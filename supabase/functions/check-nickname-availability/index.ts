import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const forbiddenWords = [
  'admin',
  'administrator',
  '관리자',
  '운영자',
  '씨발',
  '시발',
  '개새끼',
  '존나',
  '병신',
  '지랄',
  '좆',
  '미친',
  '애미',
  '느금마',
  '섹스',
  '보지',
  '자지',
];

serve(async req => {
  // OPTIONS 요청은 CORS를 위해 항상 먼저 처리합니다.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { nickname } = await req.json();

    // 닉네임 유효성 검사 (길이 등)
    if (
      !nickname ||
      typeof nickname !== 'string' ||
      nickname.trim().length < 2
    ) {
      // 이 경우는 클라이언트의 잘못된 요청이므로 400을 반환하는 것이 여전히 유효합니다.
      return new Response(
        JSON.stringify({
          error: '유효한 닉네임을 제공해야 합니다 (2자 이상).',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const trimmedNickname = nickname.trim();
    const lowercasedNickname = trimmedNickname.toLowerCase();

    // 1. 금지어 포함 여부 확인
    const hasForbiddenWord = forbiddenWords.some(word =>
      lowercasedNickname.includes(word),
    );
    if (hasForbiddenWord) {
      // 금지어 발견 시, 200 OK 상태와 함께 'forbidden' 상태를 반환합니다.
      return new Response(
        JSON.stringify({
          status: 'forbidden',
          message: '닉네임에 사용할 수 없는 단어가 포함되어 있습니다.',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // Supabase Admin 클라이언트 생성
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    // 2. 닉네임 중복 확인
    const { data: existingProfile, error: queryError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('nickname', trimmedNickname)
      .maybeSingle();

    if (queryError) throw queryError;

    // 중복 여부 확인
    if (existingProfile) {
      // 중복 시, 200 OK 상태와 함께 'taken' 상태를 반환합니다.
      return new Response(
        JSON.stringify({
          status: 'taken',
          message: '이미 사용 중인 닉네임입니다.',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // 3. 모든 검사를 통과한 경우, 'available' 상태를 반환합니다.
    return new Response(JSON.stringify({ status: 'available' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    // 데이터베이스 오류 등 예상치 못한 서버 오류 시에만 500을 반환합니다.
    console.error(err);
    return new Response(
      JSON.stringify({ error: err.message ?? '서버 오류가 발생했습니다.' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
