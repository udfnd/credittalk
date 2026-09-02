// supabase/functions/admin-get-decrypted-report/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  createClient,
  SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { getSupabaseSecretKey } from '../_shared/supabase-admin.ts';

async function verifyAdmin(
  supabaseAdminClient: SupabaseClient,
  authorizationHeader?: string | null,
): Promise<boolean> {
  if (!authorizationHeader?.startsWith('Bearer ')) return false;
  const token = authorizationHeader.slice('Bearer '.length).trim();
  if (!token) return false;
  const {
    data: { user },
    error: authError,
  } = await supabaseAdminClient.auth.getUser(token);
  if (authError || !user) return false;

  const { data: profile, error: profileError } = await supabaseAdminClient
    .from('users')
    .select('is_admin')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  return !profileError && profile?.is_admin === true;
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
      getSupabaseSecretKey(),
    );

    // 호출자의 실제 Auth JWT와 public.users 관리자 플래그를 모두 검증한다.
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
