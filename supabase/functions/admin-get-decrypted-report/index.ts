// supabase/functions/admin-get-decrypted-report/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  createClient,
  SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// !!! 중요: 실제 관리자 인증/권한 검증 로직 구현 필수 !!!
async function verifyAdmin(
  supabaseAdminClient: SupabaseClient,
  authorizationHeader?: string | null,
): Promise<boolean> {
  // 방법 1: 요청 헤더의 JWT 토큰 검증 및 custom claims 확인
  // 방법 2: 별도의 관리자 API 키 확인
  // 방법 3: 관리자 테이블 조회 등
  console.warn(
    '!!! Admin verification is NOT implemented. Access allowed for testing ONLY. !!!',
  );
  // const { data: { user } } = await supabaseClient.auth.getUser(); // user context 필요시
  // const isAdmin = user?.app_metadata?.claims_admin === true; // 예시
  // return isAdmin;
  return true; // 실제 구현 필요!
}

async function getDecryptedReport(
  supabaseAdminClient: SupabaseClient,
  reportId: number,
) {
  // 관리자용 DB 함수 호출
  const { data, error } = await supabaseAdminClient.rpc(
    'get_decrypted_report_for_admin',
    {
      report_id_input: reportId,
    },
  );

  if (error) {
    console.error('Admin RPC error:', error);
    if (error.message.includes('Report not found'))
      throw new Error('Report not found.');
    throw new Error(`Failed to get decrypted report: ${error.message}`);
  }
  if (!data) {
    throw new Error('Report not found or decryption failed internally.');
  }
  return data; // 복호화된 JSON 데이터 반환
}

serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 관리자 작업은 service_role 키 사용
    const supabaseAdminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // 관리자 권한 검증
    const isAdmin = await verifyAdmin(
      supabaseAdminClient,
      req.headers.get('Authorization'),
    ); // 실제 검증!
    if (!isAdmin) {
      throw new Error('Forbidden: Admin privileges required.');
    }

    const { reportId } = await req.json();
    if (!reportId || typeof reportId !== 'number') {
      throw new Error('Invalid request: Missing or invalid "reportId".');
    }

    const decryptedData = await getDecryptedReport(
      supabaseAdminClient,
      reportId,
    );

    return new Response(JSON.stringify(decryptedData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Function Error:', error);
    let status = 400;
    if (error.message.includes('Forbidden')) status = 403;
    if (error.message.includes('not found')) status = 404;
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: status,
    });
  }
});
