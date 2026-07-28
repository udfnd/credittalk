/**
 * FCM v1 Push (Supabase Edge)
 * - ANDROID: title/body가 있으면 notification+data 하이브리드(OS가 백그라운드/종료
 *   상태에서 직접 표시 — 삼성 절전에서도 안정 전달), 없거나 silent면 data-only
 * - iOS: 링크가 있으면 data-only, 없으면 notification(= OS가 표시)
 * - expect_os_alert: 서버가 OS 표시를 기대하는 경우 '1'로 data에 명시 → 클라가 중복 표시를 스킵
 * - nid(디듀프 키)로 collapse(tag) 지정 → 중복 수렴
 * - 유저당 활성(60일 내) 토큰 전체 발송 + DEAD 토큰 비활성화
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

// 유저당 "최신 토큰 1개"만 발송하던 과거 정책은 다중 기기/설치 계정(어드민 등)에서
// 마지막으로 앱을 연 설치본이 알림을 독점하는 미수신 사고를 냈다.
// → 최근 활성(60일 내 등록/갱신) 토큰 전체에 발송. 죽은 토큰은 FCM UNREGISTERED
//   응답으로 자동 비활성화되므로 시간이 지나면 실기기만 남는다.
const ACTIVE_WINDOW_MS = 60 * 24 * 60 * 60 * 1000; // 60일

function activeTokens(rows: TokenRow[]) {
  const cutoff = Date.now() - ACTIVE_WINDOW_MS;
  const uniq = new Map<string, { token: string; platform?: string | null }>();
  for (const r of rows) {
    const t = new Date(r.last_seen ?? r.created_at ?? 0).getTime();
    if (!Number.isFinite(t) || t < cutoff) continue;
    if (typeof r.token === 'string' && r.token.trim().length > 0) {
      uniq.set(r.token, { token: r.token, platform: r.platform ?? null });
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
  // withUserIds가 배열이면(빈 배열 포함) 반드시 필터 적용.
  // 과거: 빈 배열은 length===0이라 필터가 빠져 '전체 발송'으로 오작동 → 사고 방지.
  if (withUserIds) q = q.in('user_id', withUserIds);
  let { data, error } = await q;

  if (
    error &&
    /column .*platform.* does not exist|42703/i.test(error.message || '')
  ) {
    let q2 = supabaseAdmin
      .from('device_push_tokens')
      .select(colsNoPlatform)
      .eq('enabled', true);
    if (withUserIds) q2 = q2.in('user_id', withUserIds);
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

    // 안전장치: 전체 발송(audience.all)이 아닌데 타깃이 비어 있으면 브로드캐스트를 거부.
    // (실수로 user_ids:[] 를 보내 전체에게 발송되는 사고 방지)
    if (!audienceAll && user_ids.length === 0) {
      return new Response(
        JSON.stringify({
          message:
            'Refusing to send: no target user_ids and audience.all not set',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const { rows, platformAvailable } = await selectTokens(
      audienceAll ? null : user_ids,
    );
    if (!rows.length)
      return new Response(JSON.stringify({ message: 'No valid tokens' }), {
        status: 200,
      });

    const tokens = activeTokens(rows);
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
          // - payload가 silent를 강제했거나 표시할 title/body가 없으면 data-only
          // - ANDROID: notification+data 하이브리드(OS가 백그라운드/종료 상태에서
          //   직접 표시 → 삼성 절전/딥슬립에서도 안정적으로 전달됨)
          // - iOS: 링크가 있으면 data-only(앱이 딥링크 처리), 아니면 notification
          // - platform 미상: notification 포함(표시 누락 방지 우선)
          const wantDataOnly =
            forcedByPayload || (!title && !body) || (p === 'ios' && hasLink);

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
