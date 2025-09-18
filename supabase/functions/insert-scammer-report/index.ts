import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  createClient,
  SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

interface DamageAccount {
  accountHolderName?: string | null;
  accountNumber?: string | null;
  bankName?: string | null;
  is_other_method?: boolean | null;
  other_method_details?: string | null;
}

interface ReportData {
  damage_accounts?: DamageAccount[] | null;
  phone_numbers?: (string | null)[] | null;
  impersonated_phone_number?: string | null;
  site_name?: string | null;
  category: string;
  scam_report_source: string;
  company_type: string;
  description?: string | null;
  nickname?: string | null;
  perpetrator_account?: string | null;
  perpetrator_id?: string | null;
  gender: string;
  victim_circumstances?: string | null;
  traded_item_category?: string | null;
  perpetrator_identified?: boolean | null;
  attempted_fraud?: boolean | null;
  damage_path?: string | null;
  damaged_item?: string | null;
  impersonated_person?: string | null;
  nickname_evidence_url?: string | null;
  illegal_collection_evidence_urls?: string[] | null;
  traded_item_image_urls?: string[] | null;
  detailed_crime_type?: string | null;
  crypto_transfer_amount?: number | null; // ✨ 새로운 필드 추가
  damage_amount?: number | null;
  no_damage_amount?: boolean;
  is_face_to_face?: boolean;
}

async function encryptAndInsert(
  supabaseAdminClient: SupabaseClient,
  reportData: ReportData,
  reporterId: string,
  clientIp?: string,
) {
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

  const encryptedPhoneNumbers = reportData.phone_numbers
    ? await Promise.all(reportData.phone_numbers.map(pn => encrypt(pn)))
    : null;

  const encryptedDamageAccounts =
    reportData.damage_accounts && reportData.damage_accounts.length > 0
      ? await Promise.all(
          reportData.damage_accounts.map(async acc => {
            if (acc.is_other_method) {
              return {
                is_other_method: true,
                other_method_details: acc.other_method_details || null,
                bankName: null,
                accountHolderName: null,
                accountNumber: null,
              };
            }
            return {
              is_other_method: false,
              other_method_details: null,
              bankName: acc.bankName || null,
              accountHolderName: await encrypt(acc.accountHolderName),
              accountNumber: await encrypt(acc.accountNumber),
            };
          }),
        )
      : null;

  const encryptedImpersonatedPhoneNumber = await encrypt(
    reportData.impersonated_phone_number,
  );

  const { error: insertError } = await supabaseAdminClient
    .from('scammer_reports')
    .insert({
      reporter_id: reporterId,
      damage_accounts: encryptedDamageAccounts,
      phone_numbers: encryptedPhoneNumbers,
      impersonated_phone_number: encryptedImpersonatedPhoneNumber,
      site_name: reportData.site_name || null,
      category: reportData.category,
      scam_report_source: reportData.scam_report_source,
      company_type: reportData.company_type,
      description: reportData.description || null,
      nickname: reportData.nickname || null,
      perpetrator_account: reportData.perpetrator_account || null,
      perpetrator_id: reportData.perpetrator_id || null,
      ip_address: clientIp || null,
      gender: reportData.gender,
      victim_circumstances: reportData.victim_circumstances || null,
      traded_item_category: reportData.traded_item_category || null,
      perpetrator_identified: reportData.perpetrator_identified,
      attempted_fraud: reportData.attempted_fraud,
      damage_path: reportData.damage_path || null,
      damaged_item: reportData.damaged_item || null,
      impersonated_person: reportData.impersonated_person || null,
      nickname_evidence_url: reportData.nickname_evidence_url || null,
      illegal_collection_evidence_urls:
        reportData.illegal_collection_evidence_urls || null,
      traded_item_image_urls: reportData.traded_item_image_urls || null,
      detailed_crime_type: reportData.detailed_crime_type || null,
      crypto_transfer_amount: reportData.crypto_transfer_amount,
      damage_amount: reportData.damage_amount,
      is_face_to_face: reportData.is_face_to_face,
      no_damage_amount: reportData.no_damage_amount,
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
    const authorization = req.headers.get('Authorization');
    if (!authorization) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Missing Authorization header.' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

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

    if (!req.body) {
      return new Response(
        JSON.stringify({ error: 'Invalid request: Missing request body.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }
    if (!req.headers.get('content-type')?.includes('application/json')) {
      return new Response(
        JSON.stringify({
          error: 'Invalid request: Content-Type must be application/json.',
        }),
        {
          status: 415,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const reportData: ReportData = await req.json();

    const requiredFields: (keyof ReportData)[] = [
      'category',
      'scam_report_source',
      'company_type',
      'gender',
    ];
    const missingFields = requiredFields.filter(
      field =>
        reportData[field] === undefined ||
        reportData[field] === null ||
        String(reportData[field]).trim() === '',
    );

    if (
      reportData.perpetrator_identified === undefined ||
      reportData.perpetrator_identified === null
    ) {
      missingFields.push('perpetrator_identified');
    }
    if (
      reportData.attempted_fraud === undefined ||
      reportData.attempted_fraud === null
    ) {
      missingFields.push('attempted_fraud');
    }

    if (missingFields.length > 0) {
      return new Response(
        JSON.stringify({
          error: `Invalid request: Missing required fields: ${missingFields.join(', ')}.`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim();
    const supabaseAdminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );

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
    if (
      errorMessage.includes('Invalid request') ||
      errorMessage.includes('failed')
    ) {
      status = 400;
    }
    if (
      errorMessage.includes('Forbidden') ||
      errorMessage.includes('Authentication')
    ) {
      status = 401;
    }
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: status,
    });
  }
});
