import {
  getSupabaseSecretKey,
  getSupabaseSecretKeys,
} from './supabase-admin.ts';

const PUSH_INTERNAL_KEY = 'push_internal';
const ADMIN_BACKEND_KEY = 'admin_backend_v2';

function timingSafeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

export function getPushInternalKey(): string {
  return getSupabaseSecretKey(PUSH_INTERNAL_KEY);
}

export function authorizeInternalRequest(
  request: Request,
  { allowAdminBackend = false }: { allowAdminBackend?: boolean } = {},
): boolean {
  const supplied = request.headers.get('apikey') ?? '';
  if (!supplied) return false;

  const keys = getSupabaseSecretKeys();
  const allowed = [keys[PUSH_INTERNAL_KEY]];
  if (allowAdminBackend) allowed.push(keys[ADMIN_BACKEND_KEY]);
  return allowed.some(
    candidate => typeof candidate === 'string' && timingSafeEqual(supplied, candidate),
  );
}

export async function invokePushFunction(
  functionName: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!supabaseUrl) throw new Error('SUPABASE_URL is not configured');

  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: getPushInternalKey(),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    parsed = { error: text.slice(0, 500) };
  }
  if (!response.ok) {
    throw new Error(
      `Push function ${functionName} failed (${response.status}): ${String(
        parsed.error ?? parsed.message ?? 'unknown error',
      ).slice(0, 500)}`,
    );
  }
  return parsed;
}
