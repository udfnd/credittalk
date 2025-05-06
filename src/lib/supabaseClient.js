import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@env'; // .env 파일에서 키 가져오기

// URL이나 키가 제대로 로드되었는지 기본적인 확인 (선택 사항)
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Supabase URL or Anon Key is missing. Check your .env file and babel config.');
  // 실제 앱에서는 여기서 오류를 던지거나 사용자에게 알리는 로직 추가 가능
}

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      persistence: AsyncStorage,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
    realtime: {
      params: {
        heartbeatIntervalMs: 30000,
      },
    },
  }
);
