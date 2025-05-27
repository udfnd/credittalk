import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  createClient,
  SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

interface ReportData {
  name?: string | null;
  phone_number?: string | null;
  account_number?: string | null;
  national_id?: string | null;
  category: string; // 필수
  address?: string | null;
  scam_report_source: string; // 사기 경로 (필수)
  company_type: string; // 법인/개인 (필수)
  description?: string | null; // 사건 개요
  nickname?: string | null;

  // 새로 추가된 필드
  perpetrator_dialogue_trigger?: string | null;
  perpetrator_contact_path?: string | null;
  victim_circumstances?: string[] | null; // 체크박스, 배열로 받음
  traded_item_category?: string | null;
  perpetrator_identified?: boolean | null; // true, false, 또는 null
}

async function encryptAndInsert(
  supabaseAdminClient: SupabaseClient,
  reportData: ReportData,
  clientIp?: string,
) {
  const encrypt = async (value?: string | null): Promise<string | null> => {
    if (!value || value.trim() === '') return null;
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
    // perpetrator_dialogue_trigger, perpetrator_contact_path, traded_item_category는
    // 민감도에 따라 암호화 여부 결정 (현재는 암호화하지 않음)
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
      description: reportData.description || null, // 사건 개요
      nickname: reportData.nickname || null,
      ip_address: clientIp || null,
      // 새로 추가된 필드 삽입
      perpetrator_dialogue_trigger:
        reportData.perpetrator_dialogue_trigger || null,
      perpetrator_contact_path: reportData.perpetrator_contact_path || null,
      victim_circumstances: reportData.victim_circumstances || null, // 배열 또는 null
      traded_item_category: reportData.traded_item_category || null,
      perpetrator_identified: reportData.perpetrator_identified, // boolean 또는 null
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
          status: 415,
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

    // 필수 필드 검사 (기존 + 가해자 특정 여부)
    const requiredFields: (keyof ReportData)[] = [
      'category',
      'scam_report_source',
      'company_type',
      // 'perpetrator_identified', // perpetrator_identified는 boolean이라 null 체크로 확인
    ];
    const missingFields = requiredFields.filter((field) => {
      const value = reportData[field];
      return (
        value === undefined ||
        value === null ||
        (typeof value === 'string' && value.trim() === '')
      );
    });

    if (
      reportData.perpetrator_identified === undefined ||
      reportData.perpetrator_identified === null
    ) {
      missingFields.push('perpetrator_identified');
    }

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
      auth: { persistSession: false },
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
      status = 400;
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
