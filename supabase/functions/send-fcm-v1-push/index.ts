/**
 * FCM v1 Push (Supabase Edge)
 * - ANDROID: 항상 data-only(silent=true) → onMessage/백그라운드 핸들러에서 표시
 * - iOS: 링크가 있으면 data-only, 없으면 notification(= OS가 표시)
 * - expect_os_alert: 서버가 OS 표시를 기대하는 경우 '1'로 data에 명시 → 클라가 중복 표시를 스킵
 * - nid(디듀프 키)로 collapse(tag) 지정 → 중복 수렴
 * - 유저당 최신 토큰 1개 사용 + DEAD 토큰 비활성화
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { create } from 'https://deno.land/x/djwt@v2.8/mod.ts';
import { crypto } from 'https://deno.land/std@0.177.0/crypto/mod.ts';

const SERVICE_ACCOUNT = JSON.parse(
  Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON') || '{}',
);
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANDROID_CHANNEL_ID = 'push_default_v2';

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  global: { headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}` } },
  auth: { autoRefreshToken: false, persistSession: false },
});

/* ------------------------------- Google OAuth ------------------------------- */

async function importPrivateKey(pkcs8Pem: string) {
  const pemHeader = '-----BEGIN PRIVATE KEY-----';
  const pemFooter = '-----END PRIVATE KEY-----';
  const pem = pkcs8Pem.trim();
  const body = pem
    .replace(pemHeader, '')
    .replace(pemFooter, '')
    .replace(/\s/g, '');
  const der = Uint8Array.from(atob(body), c => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    true,
    ['sign'],
  );
}

async function getAccessToken() {
  if (
    !SERVICE_ACCOUNT?.private_key ||
    !SERVICE_ACCOUNT?.client_email ||
    !SERVICE_ACCOUNT?.project_id
  ) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON missing private_key/client_email/project_id',
    );
  }
  const key = await importPrivateKey(SERVICE_ACCOUNT.private_key);
  const now = Math.floor(Date.now() / 1000);
  const jwt = await create(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: SERVICE_ACCOUNT.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    },
    key,
  );
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(`Failed to get access token: ${JSON.stringify(data)}`);
  return data.access_token as string;
}

/* ---------------------------------- Utils ---------------------------------- */

function normalizeDataPayload(data: unknown): Record<string, string> {
  if (!data || typeof data !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (v === null || typeof v === 'undefined') continue;
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    if (!s || s === 'null' || s === 'undefined') continue;
    out[k] = s;
  }
  return out;
}

function sanitizeImageUrl(value?: string | null) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const lowered = trimmed.toLowerCase();
  if (lowered === 'null' || lowered === 'undefined') return undefined;
  return trimmed;
}

type TokenRow = {
  token: string;
  user_id: string;
  platform?: string | null;
  last_seen?: string | null;
  created_at?: string | null;
};

function latestPerUser(rows: TokenRow[]) {
  const byUser = new Map<string, TokenRow>();
  for (const r of rows) {
    const t = new Date(r.last_seen ?? r.created_at ?? 0).getTime();
    const prev = byUser.get(r.user_id);
    if (!prev || t > new Date(prev.last_seen ?? prev.created_at ?? 0).getTime())
      byUser.set(r.user_id, r);
  }
  const uniq = new Map<string, { token: string; platform?: string | null }>();
  for (const v of byUser.values()) {
    if (typeof v.token === 'string' && v.token.trim().length > 0) {
      uniq.set(v.token, { token: v.token, platform: v.platform ?? null });
    }
  }
  return Array.from(uniq.values());
}

async function selectTokens(withUserIds: string[] | null) {
  const colsWithPlatform = 'token, user_id, platform, last_seen, created_at';
  const colsNoPlatform = 'token, user_id, last_seen, created_at';

  let q = supabaseAdmin
    .from('device_push_tokens')
    .select(colsWithPlatform)
    .eq('enabled', true);
  if (withUserIds && withUserIds.length) q = q.in('user_id', withUserIds);
  let { data, error } = await q;

  if (
    error &&
    /column .*platform.* does not exist|42703/i.test(error.message || '')
  ) {
    let q2 = supabaseAdmin
      .from('device_push_tokens')
      .select(colsNoPlatform)
      .eq('enabled', true);
    if (withUserIds && withUserIds.length) q2 = q2.in('user_id', withUserIds);
    const r2 = await q2;
    if (r2.error) throw r2.error;
    return { rows: (r2.data ?? []) as TokenRow[], platformAvailable: false };
  }
  if (error) throw error;
  return { rows: (data ?? []) as TokenRow[], platformAvailable: true };
}

type SendResult =
  | { ok: true }
  | { ok: false; status?: number; code?: string; msg?: string };

function isRetryable(status?: number, code?: string) {
  if (!status && !code) return true;
  if (status && [429, 500, 502, 503, 504].includes(status)) return true;
  if (
    code &&
    /UNAVAILABLE|INTERNAL|DEADLINE_EXCEEDED|RESOURCE_EXHAUSTED/i.test(code)
  )
    return true;
  return false;
}

/* ---------------------------- FCM Message Builder --------------------------- */

function buildMessage(params: {
  token: string;
  title?: string;
  body?: string;
  data: Record<string, string>;
  imageUrl?: string;
  silent?: boolean;
}) {
  const { token, title, body, data, imageUrl, silent } = params;
  const cleanImage = sanitizeImageUrl(imageUrl);

  const nid = data.nid || `${Date.now()}`; // 앱/서버에서 가능한 안정 키 제공 권장
  const osAlert = !silent && (!!title || !!body); // 서버가 OS 표시를 기대하는가?

  const baseData: Record<string, string> = {
    ...data,
    ...(title ? { title: data.title ?? String(title) } : {}),
    ...(body ? { body: data.body ?? String(body) } : {}),
    ...(cleanImage ? { image: cleanImage } : {}),
    nid,
    collapse_key: nid, // 디버깅/클라 활용용
    expect_os_alert: osAlert ? '1' : '0',
  };

  const message: any = { token, data: baseData };

  // Android 쪽도 collapse 동작을 위해 설정(알림 배너가 없더라도 적용됨)
  message.android = {
    priority: 'HIGH',
    collapse_key: nid,
    ...(osAlert
      ? {
          notification: {
            channel_id: ANDROID_CHANNEL_ID,
            tag: nid,
            ...(cleanImage ? { image: cleanImage } : {}),
          },
        }
      : {}),
  };

  if (osAlert) {
    // iOS 알림 배너
    message.notification = {
      ...(title ? { title } : {}),
      ...(body ? { body } : {}),
      ...(cleanImage ? { image: cleanImage } : {}),
    };
    message.apns = {
      headers: {
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'apns-collapse-id': nid,
      },
      payload: {
        aps: {
          ...(title || body
            ? {
                alert: {
                  ...(title ? { title } : {}),
                  ...(body ? { body } : {}),
                },
              }
            : {}),
          ...(cleanImage ? { 'mutable-content': 1 } : {}),
        },
      },
    };
  } else {
    // iOS data-only
    message.apns = {
      headers: { 'apns-push-type': 'background', 'apns-priority': '5' },
      payload: { aps: { 'content-available': 1 } },
    };
  }

  return message;
}

async function sendToToken(params: {
  accessToken: string;
  token: string;
  title?: string;
  body?: string;
  data?: Record<string, string>;
  imageUrl?: string;
  silent?: boolean;
}): Promise<SendResult> {
  const {
    accessToken,
    token,
    title,
    body,
    data = {},
    imageUrl,
    silent,
  } = params;
  const message = buildMessage({ token, title, body, data, imageUrl, silent });

  const FCM_URL = `https://fcm.googleapis.com/v1/projects/${SERVICE_ACCOUNT.project_id}/messages:send`;
  const res = await fetch(FCM_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ message }),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    try {
      const parsed = JSON.parse(bodyText);
      return {
        ok: false,
        status: res.status,
        code: parsed?.error?.status,
        msg: parsed?.error?.message ?? bodyText,
      };
    } catch {
      return { ok: false, status: res.status, code: 'UNKNOWN', msg: bodyText };
    }
  }
  return { ok: true };
}

async function sendWithRetry(
  params: {
    accessToken: string;
    token: string;
    title?: string;
    body?: string;
    data?: Record<string, string>;
    imageUrl?: string;
    silent?: boolean;
  },
  attempts = 3,
): Promise<SendResult> {
  let last: SendResult | null = null;
  for (let i = 0; i < attempts; i++) {
    const r = await sendToToken(params);
    if (r.ok) return r;
    if (!isRetryable(r.status, r.code)) return r;
    last = r;
    const backoffMs = 200 * Math.pow(2, i) + Math.floor(Math.random() * 100);
    await new Promise(res => setTimeout(res, backoffMs));
  }
  return last ?? { ok: false, code: 'UNKNOWN' };
}

/* --------------------------------- Handler --------------------------------- */

Deno.serve(async req => {
  try {
    const payload = await req.json().catch(() => ({}));

    const rawTargetIds: unknown[] =
      (Array.isArray(payload?.user_ids) && payload.user_ids) ||
      (Array.isArray(payload?.targetUserIds) && payload.targetUserIds) ||
      (Array.isArray(payload?.target_user_ids) && payload.target_user_ids) ||
      [];

    const user_ids = rawTargetIds
      .map(id => (typeof id === 'number' ? String(id) : id))
      .filter(
        (id): id is string => typeof id === 'string' && id.trim().length > 0,
      );

    const audienceAll = Boolean(
      payload?.audience?.all ?? payload?.audience_all ?? payload?.all,
    );

    const title: string | undefined = payload?.title;
    const body: string | undefined = payload?.body;
    const imageUrl = sanitizeImageUrl(payload?.imageUrl);

    const forcedByPayload =
      payload?.silent === true || payload?.data?.silent === '1';

    const { rows, platformAvailable } = await selectTokens(
      audienceAll ? null : user_ids,
    );
    if (!rows.length)
      return new Response(JSON.stringify({ message: 'No valid tokens' }), {
        status: 200,
      });

    const tokens = latestPerUser(rows);
    if (!tokens.length)
      return new Response(
        JSON.stringify({ message: 'No tokens after dedup' }),
        { status: 200 },
      );

    const accessToken = await getAccessToken();

    const DEAD = /UNREGISTERED|NOT_FOUND|INVALID_ARGUMENT/i;
    let sent = 0,
      failed = 0;
    const deadTokens: string[] = [];

    const BATCH = 100;
    const dataStr = normalizeDataPayload(payload?.data);

    const hasLink =
      (typeof dataStr.link_url === 'string' && dataStr.link_url.length > 0) ||
      (typeof dataStr.url === 'string' && dataStr.url.length > 0);

    for (let i = 0; i < tokens.length; i += BATCH) {
      const chunk = tokens.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        chunk.map(({ token, platform }) => {
          const p = (platform || '').toLowerCase();

          // 규칙 요약:
          // - payload가 silent를 강제했다면 그 값 우선
          // - ANDROID: 항상 data-only
          // - iOS: 링크가 있으면 data-only, 아니면 notification
          // - platform 미상: 강제 없음(요청 silent 우선)
          const wantDataOnly =
            forcedByPayload || p === 'android' || (p === 'ios' && hasLink);

          return sendWithRetry(
            {
              accessToken,
              token,
              title,
              body,
              data: dataStr,
              imageUrl,
              silent: wantDataOnly,
            },
            3,
          );
        }),
      );

      results.forEach((r, idx) => {
        if (r.status === 'fulfilled') {
          if (r.value.ok) sent += 1;
          else {
            failed += 1;
            const code = r.value.code ?? '';
            const status = r.value.status ?? 0;
            if (DEAD.test(String(code)) || status === 404)
              deadTokens.push(chunk[idx].token);
          }
        } else failed += 1;
      });
    }

    if (deadTokens.length) {
      await supabaseAdmin
        .from('device_push_tokens')
        .update({ enabled: false })
        .in('token', deadTokens);
    }

    return new Response(
      JSON.stringify({
        success: true,
        audience: audienceAll ? 'all' : 'targeted',
        platform_available: platformAvailable,
        total_tokens_found: rows.length,
        used_tokens: tokens.length,
        sent,
        failed,
        disabled_tokens: deadTokens.length,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error('[send-fcm-v1-push] Main Error:', e?.message ?? e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
    });
  }
});
