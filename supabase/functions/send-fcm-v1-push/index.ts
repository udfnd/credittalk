// 목적:
// - FCM v1으로 정확한 대상에게만 푸시 발송
// - audience.all 이면 전체 발송, user_ids 있으면 특정 대상 발송
// - 유저당 최신(last_seen/created_at) 1개 토큰만 사용 → 중복 알림 방지
// - 링크가 있으면 data-only (앱이 1개만 표시), 없으면 notification 전송(이미지 포함 가능)
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

type TokenRow = {
  token: string;
  user_id: string;
  last_seen?: string | null;
  created_at?: string | null;
};

function latestPerUser(rows: TokenRow[]): string[] {
  const byUser = new Map<string, { token: string; t: number }>();
  for (const r of rows) {
    const t = new Date(r.last_seen ?? r.created_at ?? 0).getTime();
    const prev = byUser.get(r.user_id);
    if (!prev || t > prev.t) byUser.set(r.user_id, { token: r.token, t });
  }
  return Array.from(
    new Set(Array.from(byUser.values()).map(v => v.token)),
  ).filter(Boolean);
}

async function sendToToken(params: {
  accessToken: string;
  token: string;
  title?: string;
  body?: string;
  data?: Record<string, string>;
  imageUrl?: string;
}) {
  const { accessToken, token, title, body, data = {}, imageUrl } = params;

  const hasLink = typeof data.link_url === 'string' && data.link_url.length > 0;
  const isDataOnly = hasLink || (!title && !body);

  const message: Record<string, unknown> = {
    token,
    data: { ...data, ...(imageUrl ? { image: imageUrl } : {}) }, // 앱 로컬 알림용 이미지도 data에 둔다
    android: { priority: 'HIGH' },
  };

  if (isDataOnly) {
    // data-only → OS 시스템 알림 생성 방지
    message['apns'] = { payload: { aps: { 'content-available': 1 } } };
  } else {
    // 시스템 알림 1개만 (이미지 포함)
    message['notification'] = {
      title,
      body,
      ...(imageUrl ? { image: imageUrl } : {}),
    };
    (message['android'] as any).notification = {
      channel_id: ANDROID_CHANNEL_ID,
      ...(imageUrl ? { image: imageUrl } : {}),
    };
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
    const user_ids: string[] = Array.isArray(payload?.user_ids)
      ? payload.user_ids
      : [];
    const audienceAll: boolean = !!payload?.audience?.all;
    const title: string | undefined = payload?.title;
    const body: string | undefined = payload?.body;
    const imageUrl: string | undefined = payload?.imageUrl;
    const dataStr = normalizeDataPayload(payload?.data);

    if (!audienceAll && user_ids.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'Provide audience: { all: true } or user_ids',
        }),
        { status: 400 },
      );
    }

    let tokenRows: TokenRow[] = [];
    if (audienceAll) {
      const { data, error } = await supabaseAdmin
        .from('device_push_tokens')
        .select('token, user_id, last_seen, created_at')
        .eq('enabled', true);
      if (error) throw error;
      tokenRows = (data ?? []) as TokenRow[];
    } else {
      for (let i = 0; i < user_ids.length; i += CHUNK_SIZE) {
        const chunk = user_ids.slice(i, i + CHUNK_SIZE);
        const { data, error } = await supabaseAdmin
          .from('device_push_tokens')
          .select('token, user_id, last_seen, created_at')
          .in('user_id', chunk)
          .eq('enabled', true);
        if (error) {
          console.error(
            `[send-fcm-v1-push] fetch tokens chunk ${i / CHUNK_SIZE} error:`,
            error.message,
          );
          continue;
        }
        if (data?.length) tokenRows.push(...(data as TokenRow[]));
      }
    }

    if (!tokenRows.length) {
      return new Response(JSON.stringify({ message: 'No valid tokens' }), {
        status: 200,
      });
    }

    const tokens = latestPerUser(tokenRows);
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
        chunk.map(tkn =>
          sendToToken({
            accessToken,
            token: tkn,
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
              deadTokens.push(chunk[idx]);
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
        total_tokens_found: tokenRows.length,
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
