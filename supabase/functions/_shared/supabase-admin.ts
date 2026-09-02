const DEFAULT_KEY_NAME = 'push_internal';
const DEFAULT_PUBLISHABLE_KEY_NAME = 'android_v40';

type SecretKeyMap = Record<string, string>;

export function getSupabaseSecretKey(keyName = DEFAULT_KEY_NAME): string {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (!raw) throw new Error('SUPABASE_SECRET_KEYS is not configured');

  let parsed: SecretKeyMap;
  try {
    parsed = JSON.parse(raw) as SecretKeyMap;
  } catch {
    throw new Error('SUPABASE_SECRET_KEYS is invalid');
  }
  const key = parsed?.[keyName];
  if (typeof key !== 'string' || !key) {
    throw new Error(`Missing Supabase secret key: ${keyName}`);
  }
  return key;
}

export function getSupabaseSecretKeys(): SecretKeyMap {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (!raw) throw new Error('SUPABASE_SECRET_KEYS is not configured');
  try {
    const parsed = JSON.parse(raw) as SecretKeyMap;
    if (!parsed || typeof parsed !== 'object') throw new Error('invalid map');
    return parsed;
  } catch {
    throw new Error('SUPABASE_SECRET_KEYS is invalid');
  }
}

export function getSupabasePublishableKey(
  keyName = DEFAULT_PUBLISHABLE_KEY_NAME,
): string {
  const raw = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (!raw) throw new Error('SUPABASE_PUBLISHABLE_KEYS is not configured');
  try {
    const keys = JSON.parse(raw) as SecretKeyMap;
    const key = keys?.[keyName];
    if (typeof key !== 'string' || !key) throw new Error('missing key');
    return key;
  } catch {
    throw new Error(`Missing Supabase publishable key: ${keyName}`);
  }
}
