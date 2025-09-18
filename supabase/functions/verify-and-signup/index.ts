// supabase/functions/verify-and-signup/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

async function hashOtp(otp: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(otp);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { email, password, name, nickname, phoneNumber, jobType, otp } =
      await req.json();

    if (
      !email ||
      !password ||
      !name ||
      !nickname ||
      !phoneNumber ||
      !jobType ||
      !otp
    ) {
      throw new Error('모든 필드를 입력해야 합니다.');
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const hashedOtp = await hashOtp(otp);
    const { data: verification, error: otpError } = await supabaseAdmin
      .from('phone_verifications')
      .select('*')
      .eq('phone', phoneNumber)
      .eq('hashed_otp', hashedOtp)
      .single();

    if (otpError || !verification) {
      throw new Error('인증번호가 유효하지 않습니다.');
    }

    if (new Date() > new Date(verification.expires_at)) {
      await supabaseAdmin
        .from('phone_verifications')
        .delete()
        .eq('id', verification.id);
      throw new Error('인증번호가 만료되었습니다. 다시 요청해주세요.');
    }

    if (verification.used_at) {
      throw new Error('이미 사용된 인증번호입니다.');
    }

    const e164PhoneNumber = `+82${phoneNumber.substring(1)}`;

    const {
      data: { user },
      error: signUpError,
    } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      phone: e164PhoneNumber,
      email_confirm: true,
      phone_confirm: true,
    });

    if (signUpError) throw signUpError;
    if (!user) throw new Error('Auth 사용자 생성에 실패했습니다.');

    const { error: profileError } = await supabaseAdmin.from('users').insert({
      auth_user_id: user.id,
      name,
      nickname,
      phone_number: phoneNumber,
      job_type: jobType,
    });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(user.id);
      throw profileError;
    }

    await supabaseAdmin
      .from('phone_verifications')
      .update({ used_at: new Date().toISOString() })
      .eq('id', verification.id);

    return new Response(
      JSON.stringify({ success: true, message: '회원가입이 완료되었습니다.' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 201,
      },
    );
  } catch (error) {
    console.error('Sign-up Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
