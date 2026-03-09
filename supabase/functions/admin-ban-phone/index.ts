import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // JWT에서 요청자 확인
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Authorization header required');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !caller) {
      throw new Error('Invalid authentication');
    }

    // 관리자 확인
    const { data: callerProfile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('is_admin')
      .eq('auth_user_id', caller.id)
      .single();

    if (profileError || !callerProfile?.is_admin) {
      throw new Error('Forbidden: Admin privileges required');
    }

    const { blocked_user_id } = await req.json();
    if (!blocked_user_id) {
      throw new Error('blocked_user_id is required');
    }

    // 대상 유저의 전화번호 조회
    const { data: targetUser, error: targetError } = await supabaseAdmin
      .from('users')
      .select('phone_number')
      .eq('auth_user_id', blocked_user_id)
      .single();

    if (targetError || !targetUser?.phone_number) {
      return new Response(
        JSON.stringify({ phone_banned: false, reason: 'No phone number found' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      );
    }

    // banned_phones에 insert (중복 무시)
    const { error: insertError } = await supabaseAdmin
      .from('banned_phones')
      .insert({
        phone_number: targetUser.phone_number,
        banned_by: caller.id,
        banned_user_id: blocked_user_id,
      });

    if (insertError && insertError.code !== '23505') {
      throw insertError;
    }

    return new Response(
      JSON.stringify({ phone_banned: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (error) {
    console.error('admin-ban-phone error:', error);
    let status = 400;
    if (error.message.includes('Forbidden')) status = 403;
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status,
      },
    );
  }
});
