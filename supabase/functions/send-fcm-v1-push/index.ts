// supabase Edge Function (Deno) — platform 안전 폴백 + Android는 data-only(플랫폼 있을 때)
// 목적:
// - 정확 타겟 FCM v1 발송
// - audience.all 전체, user_ids 특정 대상
// - 사용자별 최신(last_seen/created_at) 1개 토큰
// - Android: platform이 확인되면 항상 data-only
// - iOS: 링크 있으면 data-only, 없으면 notification
// - platform 미존재/미기록시: 예전 로직으로 폴백(링크 없으면 notification)
// - data 문자열화, 무효 토큰 비활성화

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { create } from 'https://deno.land/x/djwt@v2.8/mod.ts';
import { crypto } from 'https://deno.land/std@0.177.0/crypto/mod.ts';

const SERVICE_ACCOUNT = JSON.parse(
  Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON') || '{}',
);
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const ANDROID_CHANNEL_ID = 'push_default_v2';
const CHUNK_SIZE = 100;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  global: { headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}` } },
  auth: { autoRefreshToken: false, persistSession: false },
});

async function importPrivateKey(pkcs8Pem: string): Promise<CryptoKey> {
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

async function getAccessToken(): Promise<string> {
  if (!SERVICE_ACCOUNT?.private_key || !SERVICE_ACCOUNT?.client_email) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON is missing private_key or client_email',
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

function normalizeDataPayload(
  data?: Record<string, unknown> | null,
): Record<string, string> {
  if (!data || typeof data !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data))
    out[k] = typeof v === 'string' ? v : JSON.stringify(v);
  return out;
}

type Platform = 'android' | 'ios' | null | undefined;

type TokenRow = {
  token: string;
  user_id: string;
  platform?: Platform; // 없을 수도 있음
  last_seen?: string | null;
  created_at?: string | null;
};

function latestPerUser(
  rows: TokenRow[],
): Array<{ token: string; platform: Platform }> {
  const byUser = new Map<string, TokenRow>();
  for (const r of rows) {
    const t = new Date(r.last_seen ?? r.created_at ?? 0).getTime();
    const prev = byUser.get(r.user_id);
    if (!prev || t > new Date(prev.last_seen ?? prev.created_at ?? 0).getTime())
      byUser.set(r.user_id, r);
  }
  const uniq = new Map<string, { token: string; platform: Platform }>();
  for (const v of byUser.values())
    uniq.set(v.token, { token: v.token, platform: v.platform });
  return Array.from(uniq.values());
}

// SELECT helper: platform 컬럼이 없으면 자동 폴백
async function selectTokens(withUserIds: string[] | null) {
  const colsWithPlatform = 'token, user_id, platform, last_seen, created_at';
  const colsNoPlatform = 'token, user_id, last_seen, created_at';

  // 1차: platform 포함 시도
  let q = supabaseAdmin
    .from('device_push_tokens')
    .select(colsWithPlatform)
    .eq('enabled', true);
  if (withUserIds && withUserIds.length) q = q.in('user_id', withUserIds);
  let { data, error } = await q;

  // platform 컬럼이 없을 때(42703 등) → 폴백
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

async function sendToToken(params: {
  accessToken: string;
  token: string;
  platform: Platform; // 'android' | 'ios' | null | undefined
  title?: string;
  body?: string;
  data?: Record<string, string>;
  imageUrl?: string;
}) {
  const {
    accessToken,
    token,
    platform,
    title,
    body,
    data = {},
    imageUrl,
  } = params;

  const dataPayload: Record<string, string> = {
    ...data,
    ...(imageUrl ? { image: imageUrl } : {}),
  };

  if (!dataPayload.title && title) dataPayload.title = String(title);
  if (!dataPayload.body && body) dataPayload.body = String(body);
  if (!dataPayload.nid) dataPayload.nid = String(Date.now()); // 클라 디듀프/업데이트용

  const hasLink =
    typeof dataPayload.link_url === 'string' && dataPayload.link_url.length > 0;

  // 플랫폼 판정: 문자열 소문자화
  const p = (
    typeof platform === 'string' ? platform.toLowerCase() : platform
  ) as Platform;

  // wantDataOnly 규칙:
  //  - android면 항상 data-only (포그라운드 onMessage 보장)
  //  - ios면 링크 있을 때만 data-only (앱 하나만 표시)
  //  - platform 모르면 예전 로직(링크 없으면 notification)으로 폴백
  const isAndroid = p === 'android';
  const isIos = p === 'ios';
  const wantDataOnly = isAndroid ? true : isIos ? hasLink : hasLink;

  // iOS APNs 설정 (Android에는 영향 없음)
  const apns: Record<string, unknown> = {};
  const apnsHeaders: Record<string, string> = {};
  if (wantDataOnly) {
    // iOS data-only (silent)
    apnsHeaders['apns-push-type'] = 'background';
    apnsHeaders['apns-priority'] = '5';
    apns['payload'] = { aps: { 'content-available': 1 } };
  } else {
    // iOS notification
    apnsHeaders['apns-push-type'] = 'alert';
    apnsHeaders['apns-priority'] = '10';
    const aps: Record<string, unknown> = { sound: 'default' };
    const alert: Record<string, string> = {};
    if (title) alert.title = title;
    if (body) alert.body = body;
    if (imageUrl) aps['mutable-content'] = 1;
    if (Object.keys(alert).length) aps['alert'] = alert;
    apns['payload'] = { aps };
  }

  // Android 설정
  const android: Record<string, unknown> = { priority: 'HIGH' };
  if (!wantDataOnly) {
    // notification 메시지로 보낼 때만 채널/이미지 지정
    android['notification'] = {
      channel_id: ANDROID_CHANNEL_ID,
      ...(imageUrl ? { image: imageUrl } : {}),
    };
  }

  const message: Record<string, unknown> = {
    token,
    data: dataPayload, // ← data-only 가능
    android,
    apns: { ...apns, headers: apnsHeaders },
  };

  if (!wantDataOnly) {
    const notificationPayload: Record<string, string> = {};
    if (title) notificationPayload.title = title;
    if (body) notificationPayload.body = body;
    if (imageUrl) notificationPayload.image = imageUrl;
    message['notification'] = notificationPayload;
  }

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

Deno.serve(async req => {
  try {
    const payload = await req.json().catch(() => ({}));

    const rawTargetIds = (() => {
      if (Array.isArray(payload?.user_ids)) return payload.user_ids;
      if (Array.isArray(payload?.targetUserIds)) return payload.targetUserIds;
      if (Array.isArray(payload?.target_user_ids))
        return payload.target_user_ids;
      return [];
    })();

    const user_ids: string[] = rawTargetIds
      .map((id: unknown) => (typeof id === 'number' ? String(id) : id))
      .filter(
        (id: unknown): id is string =>
          typeof id === 'string' && id.trim().length > 0,
      );

    const audienceAll: boolean = Boolean(
      payload?.audience?.all ?? payload?.audience_all ?? payload?.all,
    );
    const title: string | undefined = payload?.title;
    const body: string | undefined = payload?.body;
    const imageUrl: string | undefined = payload?.imageUrl;
    const dataStr = normalizeDataPayload(payload?.data);

    if (!audienceAll && user_ids.length === 0) {
      return new Response(
        JSON.stringify({
          error:
            'Provide audience: { all: true } or user_ids/targetUserIds (non-empty array)',
        }),
        { status: 400 },
      );
    }

    // SELECT with safe fallback
    const { rows, platformAvailable } = await selectTokens(
      audienceAll ? null : user_ids,
    );

    if (!rows.length) {
      return new Response(JSON.stringify({ message: 'No valid tokens' }), {
        status: 200,
      });
    }

    const tokens = latestPerUser(rows); // [{ token, platform? }]
    if (!tokens.length) {
      return new Response(
        JSON.stringify({ message: 'No tokens after dedup' }),
        { status: 200 },
      );
    }

    const accessToken = await getAccessToken();

    const DEAD = /UNREGISTERED|NOT_FOUND|INVALID_ARGUMENT/i;
    const BATCH = 100;
    let sent = 0,
      failed = 0;
    const deadTokens: string[] = [];

    for (let i = 0; i < tokens.length; i += BATCH) {
      const chunk = tokens.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        chunk.map(({ token, platform }) =>
          sendToToken({
            accessToken,
            token,
            platform, // 있을 수도/없을 수도 있음 → 내부에서 안전 분기
            title,
            body,
            data: dataStr,
            imageUrl,
          }),
        ),
      );
      results.forEach((r, idx) => {
        if (r.status === 'fulfilled') {
          if ((r.value as any)?.ok) sent += 1;
          else {
            failed += 1;
            const code = (r.value as any)?.code ?? '';
            const status = (r.value as any)?.status ?? 0;
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
