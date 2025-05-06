import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  createClient,
  SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// 입력 데이터 타입 정의 업데이트
interface ReportData {
  name: string; // 필수
  phone_number: string; // 필수 (조합된 문자열)
  account_number: string; // 필수
  national_id: string; // 필수 (조합된 문자열)
  category: string; // 필수
  address: string; // 필수
  scam_report_source: string; // 사기 경로 (필수)
  company_type: string; // 법인/개인 (필수)
  description?: string; // 선택
}

async function encryptAndInsert(
  supabaseAdminClient: SupabaseClient,
  reportData: ReportData,
  clientIp?: string,
) {
  const encrypt = async (value?: string | null): Promise<string | null> => {
    if (!value) return null;
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

  const encryptedData = {
    name: await encrypt(reportData.name),
    phone_number: await encrypt(reportData.phone_number),
    account_number: await encrypt(reportData.account_number),
    national_id: await encrypt(reportData.national_id),
    address: await encrypt(reportData.address),
  };

  const { error: insertError } = await supabaseAdminClient
    .from('scammer_reports')
    .insert({
      name: encryptedData.name,
      phone_number: encryptedData.phone_number,
      account_number: encryptedData.account_number,
      national_id: encryptedData.national_id,
      address: encryptedData.address,
      category: reportData.category,
      scam_report_source: reportData.scam_report_source,
      company_type: reportData.company_type,
      description: reportData.description || null,
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
      throw new Error('Invalid request: Missing request body.');
    }
    if (!req.headers.get('content-type')?.includes('application/json')) {
      throw new Error(
        'Invalid request: Content-Type must be application/json.',
      );
    }

    let reportData: ReportData;
    try {
      reportData = (await req.json()) as ReportData;
    } catch (jsonError) {
      throw new Error(
        `Invalid request: Failed to parse JSON body. ${jsonError.message}`,
      );
    }

    const requiredFields: (keyof ReportData)[] = [
      'name',
      'phone_number',
      'account_number',
      'national_id',
      'category',
      'address',
      'scam_report_source', // 필수 추가
      'company_type', // 필수 추가
    ];
    const missingFields = requiredFields.filter((field) => !reportData[field]);

    if (missingFields.length > 0) {
      throw new Error(
        `Invalid request: Missing required fields: ${missingFields.join(', ')}.`,
      );
    }

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim();
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Server configuration error.');
    }

    const supabaseAdminClient = createClient(supabaseUrl, serviceRoleKey);
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    let status = 500;

    if (errorMessage.includes('Invalid request')) {
      status = 400;
    }

    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: status,
    });
  }
});
