import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  createClient,
  SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

interface ReportData {
  name?: string | null; // 선택 사항으로 변경
  phone_number?: string | null; // 선택 사항으로 변경
  account_number?: string | null; // 선택 사항으로 변경
  national_id?: string | null; // 선택 사항으로 변경
  category: string; // 필수
  address?: string | null; // 선택 사항으로 변경
  scam_report_source: string; // 사기 경로 (필수)
  company_type: string; // 법인/개인 (필수)
  description?: string | null;
  nickname?: string | null; // 닉네임 추가 (선택 사항)
}

async function encryptAndInsert(
  supabaseAdminClient: SupabaseClient,
  reportData: ReportData,
  clientIp?: string,
) {
  const encrypt = async (value?: string | null): Promise<string | null> => {
    if (!value || value.trim() === '') return null; // 빈 문자열도 null로 처리하여 암호화 안 함
    const { data, error } = await supabaseAdminClient.rpc('encrypt_secret', {
      data: value,
    });
    if (error) {
      console.error(
        `Encryption failed for value starting with "${String(value).substring(0, 5)}...": ${error.message}`,
      );
      throw new Error(`Encryption failed: ${error.message}`);
    }
    return String(data);
  };

  // 암호화할 필드들만 선택적으로 암호화
  const encryptedData = {
    name: await encrypt(reportData.name),
    phone_number: await encrypt(reportData.phone_number),
    account_number: await encrypt(reportData.account_number),
    national_id: await encrypt(reportData.national_id),
    address: await encrypt(reportData.address),
    // 닉네임도 암호화가 필요하다면 추가
    // nickname: await encrypt(reportData.nickname),
  };

  const { error: insertError } = await supabaseAdminClient
    .from('scammer_reports')
    .insert({
      name: encryptedData.name,
      phone_number: encryptedData.phone_number,
      account_number: encryptedData.account_number,
      national_id: encryptedData.national_id,
      address: encryptedData.address,
      category: reportData.category, // 필수
      scam_report_source: reportData.scam_report_source, // 필수
      company_type: reportData.company_type, // 필수
      description: reportData.description || null,
      nickname: reportData.nickname || null, // 닉네임 추가
      ip_address: clientIp || null,
    });

  if (insertError) {
    console.error('DB Insert error:', insertError);
    throw new Error(`Database insert failed: ${insertError.message}`);
  }
  return { success: true, message: 'Report submitted successfully.' };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!req.body) {
      return new Response(
        JSON.stringify({ error: 'Invalid request: Missing request body.' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      );
    }
    if (!req.headers.get('content-type')?.includes('application/json')) {
      return new Response(
        JSON.stringify({
          error: 'Invalid request: Content-Type must be application/json.',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 415, // Unsupported Media Type
        },
      );
    }

    let reportData: ReportData;
    try {
      reportData = (await req.json()) as ReportData;
    } catch (jsonError) {
      return new Response(
        JSON.stringify({
          error: `Invalid request: Failed to parse JSON body. ${jsonError.message}`,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      );
    }

    // 필수 필드 검사: category, scam_report_source, company_type만 필수로 남김
    const requiredFields: (keyof ReportData)[] = [
      'category',
      'scam_report_source',
      'company_type',
    ];
    const missingFields = requiredFields.filter((field) => {
      const value = reportData[field];
      // undefined, null, 빈 문자열을 모두 누락으로 간주 (필수 항목에 대해서)
      return (
        value === undefined ||
        value === null ||
        (typeof value === 'string' && value.trim() === '')
      );
    });

    if (missingFields.length > 0) {
      return new Response(
        JSON.stringify({
          error: `Invalid request: Missing required fields: ${missingFields.join(', ')}.`,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      );
    }

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim();
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      console.error(
        'Server configuration error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.',
      );
      return new Response(
        JSON.stringify({ error: 'Server configuration error.' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        },
      );
    }

    const supabaseAdminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }, // 서버리스 함수에서는 세션 유지 불필요
    });

    const result = await encryptAndInsert(
      supabaseAdminClient,
      reportData,
      clientIp,
    );
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    console.error('Function Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    let status = 500;

    if (
      errorMessage.includes('Invalid request') ||
      errorMessage.includes('Encryption failed') ||
      errorMessage.includes('Database insert failed')
    ) {
      status = 400; // 클라이언트 요청 오류 또는 내부 처리 오류로 인한 Bad Request
    }
    if (errorMessage.includes('Server configuration error')) {
      status = 500;
    }

    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: status,
    });
  }
});
