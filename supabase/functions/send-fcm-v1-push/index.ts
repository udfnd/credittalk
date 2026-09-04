/**
 * Canonical FCM v1 sender for every CreditTalk push source.
 * Internal-only: callers must supply an approved Supabase secret key in `apikey`.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { create } from 'https://deno.land/x/djwt@v2.8/mod.ts';
import { crypto } from 'https://deno.land/std@0.177.0/crypto/mod.ts';
import {
  authorizeInternalRequest,
  getPushInternalKey,
} from '../_shared/push-auth.ts';

const SERVICE_ACCOUNT = JSON.parse(
  Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON') || '{}',
);
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANDROID_CHANNEL_ID = 'push_default_v2';
const ANDROID_TTL = '86400s';
const ACTIVE_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 1000;
const BATCH_SIZE = 100;
const MAX_FCM_PAYLOAD_BYTES = 3900;
const MAX_EXPLICIT_TARGETS = 1000;
const RESERVED_DATA_KEY = /^(from|message_type|google\.|gcm\.notification\.)/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SCREEN_PARAM_MAP: Record<string, string | null> = {
  CommunityPostDetail: 'postId',
  ArrestNewsDetail: 'newsId',
  IncidentPhotoDetail: 'photoId',
  NewCrimeCaseDetail: 'caseId',
  NoticeDetail: 'noticeId',
  ReviewDetail: 'reviewId',
  HelpDeskDetail: 'questionId',
  EventDetail: 'eventId',
  MyReports: null,
};

const adminKey = getPushInternalKey();
const supabaseAdmin = createClient(SUPABASE_URL, adminKey, {
  global: { headers: { apikey: adminKey } },
  auth: { autoRefreshToken: false, persistSession: false },
});

type TokenRow = {
  token: string;
  user_id: string;
  platform?: string | null;
  last_seen?: string | null;
  created_at?: string | null;
};

type SendFailure = {
  ok: false;
  status?: number;
  code: string;
  message: string;
  retryAfterMs?: number;
  disableToken?: boolean;
};
type SendResult = { ok: true } | SendFailure;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function importPrivateKey(pkcs8Pem: string) {
  const body = pkcs8Pem
    .trim()
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const der = Uint8Array.from(atob(body), character => character.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function getAccessToken(): Promise<string> {
  if (
    !SERVICE_ACCOUNT?.private_key ||
    !SERVICE_ACCOUNT?.client_email ||
    !SERVICE_ACCOUNT?.project_id
  ) {
    throw new Error('Google service account is incomplete');
  }
  const key = await importPrivateKey(SERVICE_ACCOUNT.private_key);
  const now = Math.floor(Date.now() / 1000);
  const assertion = await create(
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
      assertion,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const responseBody = await response.json();
  if (!response.ok || typeof responseBody?.access_token !== 'string') {
    throw new Error(`Google OAuth failed (${response.status})`);
  }
  return responseBody.access_token;
}

function normalizeHttpUrl(value: unknown, field: string): string | undefined {
  if (value === null || typeof value === 'undefined' || value === '') return undefined;
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
  let candidate = value.trim();
  if (!candidate) return undefined;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) candidate = `https://${candidate}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`${field} is not a valid URL`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error(`${field} must use http or https`);
  }
  if (parsed.username || parsed.password || candidate.length > 2048) {
    throw new Error(`${field} is not allowed`);
  }
  return parsed.toString();
}

function normalizeDataPayload(value: unknown): Record<string, string> {
  if (value === null || typeof value === 'undefined') return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('data must be an object');
  }
  const output: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!key || RESERVED_DATA_KEY.test(key)) {
      throw new Error(`data contains a reserved key: ${key}`);
    }
    if (raw === null || typeof raw === 'undefined') continue;
    const stringValue = typeof raw === 'string' ? raw : JSON.stringify(raw);
    if (typeof stringValue === 'string') output[key] = stringValue;
  }
  const link = normalizeHttpUrl(output.link_url, 'data.link_url');
  const legacyLink = normalizeHttpUrl(output.url, 'data.url');
  if (link) output.link_url = link;
  else delete output.link_url;
  if (legacyLink) output.url = legacyLink;
  else delete output.url;
  if (output.link_url && output.url && output.link_url !== output.url) {
    throw new Error('data.link_url and data.url conflict');
  }
  return output;
}

function validateNavigationData(data: Record<string, string>): void {
  const screen = data.screen?.trim();
  const hasLink = Boolean(data.link_url || data.url);
  if (!screen) return;
  if (hasLink) throw new Error('data.screen cannot be combined with an external link');
  if (!Object.prototype.hasOwnProperty.call(SCREEN_PARAM_MAP, screen)) {
    throw new Error(`data.screen is not allowed: ${screen}`);
  }
  const requiredParam = SCREEN_PARAM_MAP[screen];
  if (!requiredParam) return;

  let parsedParams: Record<string, unknown> = {};
  if (data.params) {
    try {
      const parsed = JSON.parse(data.params);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        parsedParams = parsed as Record<string, unknown>;
      }
    } catch {
      throw new Error('data.params must be valid JSON');
    }
  }
  const id = data[requiredParam] ?? parsedParams[requiredParam];
  if (!/^\d+$/.test(String(id ?? '')) || Number(id) <= 0) {
    throw new Error(`data.${requiredParam} is required for ${screen}`);
  }
}

function activeTokens(rows: TokenRow[]) {
  const cutoff = Date.now() - ACTIVE_WINDOW_MS;
  const unique = new Map<string, { token: string; platform?: string | null }>();
  for (const row of rows) {
    const lastSeen = new Date(row.last_seen ?? row.created_at ?? 0).getTime();
    if (!Number.isFinite(lastSeen) || lastSeen < cutoff) continue;
    if (typeof row.token === 'string' && row.token.trim()) {
      unique.set(row.token, { token: row.token, platform: row.platform ?? null });
    }
  }
  return [...unique.values()];
}

async function fetchTokenPage(
  userIds: string[] | null,
  targetTokens: string[] | null,
  from: number,
  includePlatform: boolean,
): Promise<TokenRow[]> {
  const columns = includePlatform
    ? 'token, user_id, platform, last_seen, created_at'
    : 'token, user_id, last_seen, created_at';
  let query = supabaseAdmin
    .from('device_push_tokens')
    .select(columns)
    .eq('enabled', true)
    .order('token', { ascending: true })
    .range(from, from + PAGE_SIZE - 1);
  if (userIds) query = query.in('user_id', userIds);
  if (targetTokens) query = query.in('token', targetTokens);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as TokenRow[];
}

async function selectTokens(userIds: string[] | null, targetTokens: string[] | null) {
  const rows: TokenRow[] = [];
  let platformAvailable = true;
  for (let from = 0; ; from += PAGE_SIZE) {
    let page: TokenRow[];
    try {
      page = await fetchTokenPage(userIds, targetTokens, from, platformAvailable);
    } catch (error) {
      if (
        platformAvailable &&
        /column .*platform.* does not exist|42703/i.test(String((error as Error)?.message ?? error))
      ) {
        platformAvailable = false;
        rows.length = 0;
        from = -PAGE_SIZE;
        continue;
      }
      throw error;
    }
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return { rows, platformAvailable };
}

function buildMessage({
  token,
  title,
  body,
  data,
  imageUrl,
  silent,
}: {
  token: string;
  title?: string;
  body?: string;
  data: Record<string, string>;
  imageUrl?: string;
  silent: boolean;
}) {
  const nid = data.nid || `push_${crypto.randomUUID()}`;
  const osAlert = !silent && Boolean(title || body);
  const message: Record<string, unknown> = {
    token,
    data: {
      ...data,
      ...(title ? { title: data.title ?? title } : {}),
      ...(body ? { body: data.body ?? body } : {}),
      ...(imageUrl ? { image: imageUrl } : {}),
      nid,
      expect_os_alert: osAlert ? '1' : '0',
    },
    // android.notification.click_action은 절대 지정하지 않는다: 지정하면 FCM이
    // 명시적 런치 인텐트(getLaunchIntentForPackage) 대신 카테고리 없는 암시적
    // 인텐트를 만들고, MainActivity의 MAIN 필터에는 CATEGORY_DEFAULT가 없어
    // 탭이 해석되지 않는다(= 알림은 뜨는데 화면 이동이 안 됨).
    android: {
      priority: 'HIGH',
      ttl: ANDROID_TTL,
      ...(osAlert
        ? {
            notification: {
              channel_id: ANDROID_CHANNEL_ID,
              tag: nid,
              ...(imageUrl ? { image: imageUrl } : {}),
            },
          }
        : {}),
    },
  };
  if (osAlert) {
    message.notification = {
      ...(title ? { title } : {}),
      ...(body ? { body } : {}),
      ...(imageUrl ? { image: imageUrl } : {}),
    };
    message.apns = {
      headers: { 'apns-push-type': 'alert', 'apns-priority': '10' },
      payload: { aps: { alert: { title: title ?? '', body: body ?? '' } } },
    };
  } else {
    message.apns = {
      headers: { 'apns-push-type': 'background', 'apns-priority': '5' },
      payload: { aps: { 'content-available': 1 } },
    };
  }
  return message;
}

function validatePayloadSize(message: Record<string, unknown>): void {
  const withoutTarget = { ...message, token: '' };
  const bytes = new TextEncoder().encode(JSON.stringify(withoutTarget)).byteLength;
  if (bytes > MAX_FCM_PAYLOAD_BYTES) {
    throw new Error(`FCM payload is too large (${bytes} bytes)`);
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

function parseFcmError(raw: string, status: number, retryAfter: string | null): SendFailure {
  let topCode = 'UNKNOWN';
  let detailCode = '';
  let message = raw.slice(0, 500);
  try {
    const parsed = JSON.parse(raw);
    topCode = String(parsed?.error?.status ?? topCode);
    message = String(parsed?.error?.message ?? message).slice(0, 500);
    const details = Array.isArray(parsed?.error?.details) ? parsed.error.details : [];
    const fcmDetail = details.find(
      (detail: Record<string, unknown>) =>
        detail?.['@type'] === 'type.googleapis.com/google.firebase.fcm.v1.FcmError' &&
        typeof detail?.errorCode === 'string',
    );
    detailCode = String(fcmDetail?.errorCode ?? '');
    const code = detailCode || topCode;
    return {
      ok: false,
      status,
      code,
      message,
      retryAfterMs: parseRetryAfter(retryAfter),
      // INVALID_ARGUMENT is terminal for a token only when FCM identifies the
      // detail as FcmError. A google.rpc.BadRequest instead means our payload
      // is invalid and must never disable every otherwise valid token.
      disableToken:
        code === 'UNREGISTERED' ||
        code === 'SENDER_ID_MISMATCH' ||
        (code === 'INVALID_ARGUMENT' && Boolean(fcmDetail)),
    };
  } catch {}
  return {
    ok: false,
    status,
    code: detailCode || topCode,
    message,
    retryAfterMs: parseRetryAfter(retryAfter),
  };
}

function retryable(result: SendFailure): boolean {
  return (
    [408, 429, 500, 502, 503, 504].includes(result.status ?? 0) ||
    /NETWORK_ERROR|UNAVAILABLE|INTERNAL|DEADLINE_EXCEEDED|RESOURCE_EXHAUSTED/i.test(result.code)
  );
}

async function sendToToken(accessToken: string, message: Record<string, unknown>): Promise<SendResult> {
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${SERVICE_ACCOUNT.project_id}/messages:send`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ message }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (response.ok) return { ok: true };
  return parseFcmError(
    await response.text().catch(() => ''),
    response.status,
    response.headers.get('retry-after'),
  );
}

async function sendWithRetry(
  accessToken: string,
  message: Record<string, unknown>,
): Promise<SendResult> {
  let last: SendResult = { ok: false, code: 'UNKNOWN', message: 'No send attempt' };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      last = await sendToToken(accessToken, message);
    } catch (error) {
      last = {
        ok: false,
        code: 'NETWORK_ERROR',
        message: String((error as Error)?.message ?? error).slice(0, 500),
      };
    }
    if (last.ok || !retryable(last) || attempt === 1) return last;
    const base = last.retryAfterMs ?? (last.status === 429 ? 60_000 : 10_000);
    const waitMs = Math.min(60_000, Math.max(10_000, base)) + Math.floor(Math.random() * 1000);
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }
  return last;
}

async function disableDeadTokens(tokens: string[]): Promise<void> {
  for (let index = 0; index < tokens.length; index += 500) {
    const chunk = tokens.slice(index, index + 500);
    const { error } = await supabaseAdmin
      .from('device_push_tokens')
      .update({ enabled: false })
      .in('token', chunk);
    if (error) throw error;
  }
}

Deno.serve(async request => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    if (!authorizeInternalRequest(request, { allowAdminBackend: true })) {
      return json({ error: 'Unauthorized' }, 401);
    }
    const payload = await request.json().catch(() => ({}));
    const audienceAll = payload?.audience?.all === true || payload?.audience_all === true;
    const rawUserIds = [payload?.user_ids, payload?.targetUserIds, payload?.target_user_ids].find(
      Array.isArray,
    ) as unknown[] | undefined;
    const rawTokens = Array.isArray(payload?.target_tokens) ? payload.target_tokens : undefined;
    const userIds = [...new Set((rawUserIds ?? []).map(String).map(v => v.trim()).filter(Boolean))];
    const targetTokens = [...new Set((rawTokens ?? []).map(String).map(v => v.trim()).filter(Boolean))];
    if (userIds.length > MAX_EXPLICIT_TARGETS || targetTokens.length > MAX_EXPLICIT_TARGETS) {
      return json({ error: `At most ${MAX_EXPLICIT_TARGETS} explicit targets are allowed` }, 400);
    }
    if (userIds.some(id => !UUID_PATTERN.test(id))) {
      return json({ error: 'user_ids must contain valid UUIDs' }, 400);
    }
    if (!audienceAll && userIds.length === 0 && targetTokens.length === 0) {
      return json({ error: 'At least one explicit target or audience.all=true is required' }, 400);
    }
    if (audienceAll && (userIds.length > 0 || targetTokens.length > 0)) {
      return json({ error: 'audience.all cannot be combined with explicit targets' }, 400);
    }

    const title = typeof payload?.title === 'string' ? payload.title.trim() : '';
    const body = typeof payload?.body === 'string' ? payload.body.trim() : '';
    const forcedSilent = payload?.silent === true || payload?.data?.silent === '1';
    if (!forcedSilent && !title && !body) return json({ error: 'title or body is required' }, 400);

    const data = normalizeDataPayload(payload?.data);
    data.nid = data.nid || `push_${crypto.randomUUID()}`;
    if (data.nid.length > 128) return json({ error: 'data.nid is too long' }, 400);
    validateNavigationData(data);
    const imageUrl = normalizeHttpUrl(payload?.imageUrl ?? data.image, 'imageUrl');
    if (imageUrl) data.image = imageUrl;
    const hasLink = Boolean(data.link_url || data.url);

    validatePayloadSize(
      buildMessage({ token: '', title, body, data, imageUrl, silent: forcedSilent }),
    );

    const { rows, platformAvailable } = await selectTokens(
      audienceAll ? null : userIds.length ? userIds : null,
      targetTokens.length ? targetTokens : null,
    );
    const tokens = activeTokens(rows);
    if (tokens.length === 0) {
      return json({
        success: true,
        audience: audienceAll ? 'all' : 'targeted',
        total_tokens_found: rows.length,
        used_tokens: 0,
        sent: 0,
        failed: 0,
        disabled_tokens: 0,
        error_codes: {},
        nid: data.nid,
      });
    }

    const accessToken = await getAccessToken();
    let sent = 0;
    let failed = 0;
    let retryableFailed = 0;
    const deadTokens: string[] = [];
    const errorCodes: Record<string, number> = {};
    const errorSamples: Array<{ code: string; status?: number; message: string }> = [];

    for (let index = 0; index < tokens.length; index += BATCH_SIZE) {
      const chunk = tokens.slice(index, index + BATCH_SIZE);
      const settled = await Promise.allSettled(
        chunk.map(({ token, platform }) => {
          const wantDataOnly =
            forcedSilent || (!title && !body) || ((platform ?? '').toLowerCase() === 'ios' && hasLink);
          return sendWithRetry(
            accessToken,
            buildMessage({ token, title, body, data, imageUrl, silent: wantDataOnly }),
          );
        }),
      );
      settled.forEach((entry, offset) => {
        if (entry.status === 'fulfilled' && entry.value.ok) {
          sent += 1;
          return;
        }
        failed += 1;
        const failure: SendFailure =
          entry.status === 'fulfilled'
            ? (entry.value as SendFailure)
            : {
                ok: false,
                code: 'UNHANDLED_ERROR',
                message: String(entry.reason).slice(0, 500),
              };
        errorCodes[failure.code] = (errorCodes[failure.code] ?? 0) + 1;
        if (retryable(failure)) retryableFailed += 1;
        if (errorSamples.length < 5) {
          errorSamples.push({
            code: failure.code,
            status: failure.status,
            message: failure.message,
          });
        }
        if (failure.disableToken) deadTokens.push(chunk[offset].token);
      });
    }
    const uniqueDeadTokens = [...new Set(deadTokens)];
    if (uniqueDeadTokens.length) await disableDeadTokens(uniqueDeadTokens);

    const result = {
      success: failed === 0,
      partial: sent > 0 && failed > 0,
      audience: audienceAll ? 'all' : 'targeted',
      platform_available: platformAvailable,
      total_tokens_found: rows.length,
      used_tokens: tokens.length,
      sent,
      failed,
      retryable_failed: retryableFailed,
      disabled_tokens: uniqueDeadTokens.length,
      error_codes: errorCodes,
      error_samples: errorSamples,
      nid: data.nid,
    };
    // 영속 worker가 같은 nid/tag로 전체 작업을 재시도하도록 일시 실패를 503으로
    // 전달한다. 이미 성공한 Android 알림은 같은 tag로 교체되어 중복 누적되지 않는다.
    if (retryableFailed > 0) return json(result, 503);
    return json(result, sent === 0 && failed > 0 ? 502 : 200);
  } catch (error) {
    const message = String((error as Error)?.message ?? error).slice(0, 500);
    console.error('[send-fcm-v1-push]', message);
    const clientError =
      /required|invalid|must|reserved|large|conflict|allowed|combined|too long|at most|uuid/i.test(
        message,
      );
    return json({ success: false, error: message }, clientError ? 400 : 500);
  }
});
