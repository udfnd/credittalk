import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  createClient,
  SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// 전송받을 데이터의 타입을 정의합니다.
interface ReportData {
  name?: string | null; // 예금주명
  phone_number?: string | null;
  account_number?: string | null;
  category: string;
  scam_report_source: string;
  company_type: string; // 계좌여부 (사업자/개인)
  description?: string | null;
  nickname?: string | null;
  gender: string; // 용의자 성별
  perpetrator_dialogue_trigger?: string | null;
  perpetrator_contact_path?: string | null;
  victim_circumstances?: string[] | null;
  traded_item_category?: string | null;
  perpetrator_identified?: boolean | null;
}

// 데이터를 암호화하고 DB에 삽입하는 함수입니다.
async function encryptAndInsert(
  supabaseAdminClient: SupabaseClient,
  reportData: ReportData,
  reporterId: string, // 신고자 ID를 인자로 받습니다.
  clientIp?: string,
) {
  // 민감 정보를 암호화하는 내부 함수입니다.
  const encrypt = async (value?: string | null): Promise<string | null> => {
    if (!value || value.trim() === '') return null;
    const { data, error } = await supabaseAdminClient.rpc('encrypt_secret', {
      data: value,
    });
    if (error) {
      console.error(
        `Encryption failed for value starting with "${String(value).substring(
          0,
          5,
        )}...": ${error.message}`,
      );
      throw new Error(`Encryption failed: ${error.message}`);
    }
    return String(data);
  };

  // 암호화가 필요한 필드들을 처리합니다.
  const encryptedData = {
    name: await encrypt(reportData.name),
    phone_number: await encrypt(reportData.phone_number),
    account_number: await encrypt(reportData.account_number),
  };

  // 최종적으로 데이터베이스에 데이터를 삽입합니다.
  const { error: insertError } = await supabaseAdminClient
    .from('scammer_reports')
    .insert({
      reporter_id: reporterId, // `reporter_id`를 함께 저장합니다.
      name: encryptedData.name,
      phone_number: encryptedData.phone_number,
      account_number: encryptedData.account_number,
      category: reportData.category,
      scam_report_source: reportData.scam_report_source,
      company_type: reportData.company_type,
      description: reportData.description || null,
      nickname: reportData.nickname || null,
      ip_address: clientIp || null,
      gender: reportData.gender,
      perpetrator_dialogue_trigger:
        reportData.perpetrator_dialogue_trigger || null,
      perpetrator_contact_path: reportData.perpetrator_contact_path || null,
      victim_circumstances: reportData.victim_circumstances || null,
      traded_item_category: reportData.traded_item_category || null,
      perpetrator_identified: reportData.perpetrator_identified,
    });

  if (insertError) {
    console.error('DB Insert error:', insertError);
    throw new Error(`Database insert failed: ${insertError.message}`);
  }
  return { success: true, message: 'Report submitted successfully.' };
}

// Edge Function의 메인 로직입니다.
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 요청 헤더에서 'Authorization'을 통해 사용자 인증 토큰을 확인합니다.
    const authorization = req.headers.get('Authorization');
    if (!authorization) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Missing Authorization header.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 사용자 전용 Supabase 클라이언트를 생성하여 사용자 정보를 가져옵니다.
    const userSupabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authorization } } },
    );
    const {
      data: { user },
      error: userError,
    } = await userSupabaseClient.auth.getUser();

    if (userError || !user) {
      console.error('User auth error:', userError?.message);
      return new Response(JSON.stringify({ error: 'Authentication failed.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- 이하 로직은 이전과 유사하나, `reporterId`를 전달하는 부분이 핵심입니다. ---

    if (!req.body) {
      return new Response(JSON.stringify({ error: 'Invalid request: Missing request body.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!req.headers.get('content-type')?.includes('application/json')) {
      return new Response(JSON.stringify({ error: 'Invalid request: Content-Type must be application/json.' }), { status: 415, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const reportData: ReportData = await req.json();

    const requiredFields: (keyof ReportData)[] = ['category', 'scam_report_source', 'company_type', 'gender'];
    const missingFields = requiredFields.filter(field => !reportData[field]);
    if (reportData.perpetrator_identified === undefined || reportData.perpetrator_identified === null) {
      missingFields.push('perpetrator_identified');
    }
    if (missingFields.length > 0) {
      return new Response(JSON.stringify({ error: `Invalid request: Missing required fields: ${missingFields.join(', ')}.` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim();
    // 관리자 권한 클라이언트를 생성하여 DB에 데이터를 삽입합니다.
    const supabaseAdminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );

    // encryptAndInsert 함수 호출 시 인증된 사용자 ID(user.id)를 전달합니다.
    const result = await encryptAndInsert(
      supabaseAdminClient,
      reportData,
      user.id,
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
    if (errorMessage.includes('Invalid request') || errorMessage.includes('failed')) {
      status = 400;
    }
    if (errorMessage.includes('Forbidden') || errorMessage.includes('Authentication')) {
      status = 401;
    }
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: status,
    });
  }
});
