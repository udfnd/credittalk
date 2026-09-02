// src/lib/supabaseClient.js
import AsyncStorage from '@react-native-async-storage/async-storage'; // AsyncStorage import 추가
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@env';

// 변수명은 기존 빌드 설정과의 호환을 위해 유지하지만 값은 sb_publishable_ 키를 쓴다.

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    'Supabase URL or Anon Key is missing. Check your .env file and babel config.',
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  realtime: {
    params: {
      heartbeatIntervalMs: 30000,
    },
  },
});

console.log('[SupabaseClient] Supabase client initialized with AsyncStorage.');
