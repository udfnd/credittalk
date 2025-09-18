import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// 가장 효율적인 방법은 DB 뷰를 직접 호출하는 것이므로,
// 클라이언트 사이드에서 복호화 로직은 필요 없습니다.

serve(async (req: Request) => {
  // OPTIONS 요청에 대한 표준 처리
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. 환경 변수 유효성 검사
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      console.error(
        'Server configuration error: Missing Supabase URL or Service Role Key.',
      );
      throw new Error('서버 구성 오류가 발생했습니다.');
    }

    // 2. 인증 헤더 확인 및 사용자 정보 가져오기
    const authorization = req.headers.get('Authorization');
    if (!authorization) {
      throw new Error('Forbidden: Missing Authorization header.');
    }

    // 사용자 클라이언트를 생성하여 사용자 인증
    const userSupabaseClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: { headers: { Authorization: authorization } },
      },
    );

    const {
      data: { user },
      error: userError,
    } = await userSupabaseClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Authentication failed.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const supabaseAdminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: decryptedReports, error: fetchError } =
      await supabaseAdminClient
        .from('decrypted_scammer_reports') // <- 원본 테이블이 아닌, 복호화된 뷰를 조회
        .select('*') // <- 모든 필드를 가져옴
        .eq('reporter_id', user.id) // <- 현재 로그인한 사용자의 신고 내역만 필터링
        .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('Failed to fetch reports from view:', fetchError);
      throw new Error(`리포트 조회 실패: ${fetchError.message}`);
    }

    // 4. 조회된 데이터를 그대로 반환
    return new Response(JSON.stringify(decryptedReports), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    console.error('An unexpected error occurred:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: error.message.includes('Forbidden') ? 403 : 500,
    });
  }
});
