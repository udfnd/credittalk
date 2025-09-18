// supabase/functions/delete-user/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async req => {
  // CORS preflight request 처리
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      },
    );

    // 요청을 보낸 사용자 정보를 가져옵니다.
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();
    if (!user) {
      throw new Error('User not found');
    }

    // Admin 클라이언트를 생성하여 사용자 삭제 권한을 얻습니다.
    // 이 클라이언트는 service_role key를 사용하므로, 데이터베이스의 모든 작업을 수행할 수 있습니다.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // auth.users 테이블에서 사용자를 삭제합니다.
    const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id);

    if (error) {
      throw error;
    }

    return new Response(
      JSON.stringify({ message: 'User deleted successfully' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
