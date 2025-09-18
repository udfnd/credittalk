import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// 이메일 마스킹 함수
function maskEmail(email: string): string {
  if (!email) return '';
  const [localPart, domain] = email.split('@');
  if (localPart.length <= 3) {
    return `${localPart[0]}**@${domain}`;
  }
  const maskedLocalPart =
    localPart.substring(0, 3) + '*'.repeat(localPart.length - 3);
  return `${maskedLocalPart}@${domain}`;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { name, phoneNumber } = await req.json();
    console.log('수신된 데이터:', { name, phoneNumber });

    if (!name || !phoneNumber) {
      return new Response(
        JSON.stringify({ error: '이름과 전화번호를 모두 입력해야 합니다.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const trimmedName = name.trim();
    const trimmedPhoneNumber = phoneNumber.trim();

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );

    // ### 수정된 부분 ###
    // 'user_id'가 아닌 정확한 컬럼명 'auth_user_id'를 조회합니다.
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('auth_user_id')
      .eq('name', trimmedName)
      .eq('phone_number', trimmedPhoneNumber)
      .single();

    if (profileError || !profile) {
      if (profileError) {
        console.error('프로필 조회 오류:', profileError);
      } else {
        console.log('일치하는 프로필 없음. 조회 시도 값:', {
          name: trimmedName,
          phoneNumber: trimmedPhoneNumber,
        });
      }
      return new Response(
        JSON.stringify({ message: '일치하는 사용자 정보가 없습니다.' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // ### 수정된 부분 ###
    // 조회한 profile.auth_user_id (UUID)를 사용하여 auth 정보를 가져옵니다.
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.admin.getUserById(profile.auth_user_id);

    if (authError || !user || !user.email) {
      console.error('Auth 사용자 조회 오류:', authError);
      return new Response(
        JSON.stringify({ message: '사용자 정보를 찾을 수 없습니다.' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    return new Response(JSON.stringify({ email: maskEmail(user.email) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err) {
    console.error('전체 함수 오류:', err);
    return new Response(
      JSON.stringify({ error: '서버 내부 오류가 발생했습니다.' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});
