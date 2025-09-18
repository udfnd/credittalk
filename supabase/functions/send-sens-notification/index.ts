// supabase/functions/send-sens-notification/index.ts (관리자 알림 버전)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

// Naver SENS API 요청을 위한 인터페이스 정의
interface SensRequestBody {
  type: 'SMS' | 'LMS' | 'MMS';
  contentType: 'COMM' | 'AD';
  countryCode: string;
  from: string;
  content: string;
  messages: {
    to: string;
    content?: string;
  }[];
}

serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { record } = await req.json();
    const helpQuestion = record;

    const adminPhoneNumber = Deno.env.get('ADMIN_PHONE_NUMBER');
    if (!adminPhoneNumber) {
      throw new Error(
        '수신자인 관리자 전화번호(ADMIN_PHONE_NUMBER)가 Vault에 설정되지 않았습니다.',
      );
    }

    const serviceId = Deno.env.get('NCLOUD_SENS_SERVICE_ID');
    const accessKey = Deno.env.get('NCLOUD_ACCESS_KEY');
    const secretKey = Deno.env.get('NCLOUD_SECRET_KEY');
    const fromNumber = Deno.env.get('SENS_CALLING_NUMBER');

    if (!serviceId || !accessKey || !secretKey || !fromNumber) {
      throw new Error(
        'SENS API 설정값이 Supabase Vault에 올바르게 설정되지 않았습니다.',
      );
    }

    const method = 'POST';
    const uri = `/sms/v2/services/${serviceId}/messages`;
    const timestamp = Date.now().toString();
    const apiUrl = `https://sens.apigw.ntruss.com${uri}`;

    const hmacKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secretKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    const message = `${method} ${uri}\n${timestamp}\n${accessKey}`;
    const signature = await crypto.subtle.sign(
      'HMAC',
      hmacKey,
      new TextEncoder().encode(message),
    );
    const signatureBase64 = btoa(
      String.fromCharCode(...new Uint8Array(signature)),
    );

    const requestBody: SensRequestBody = {
      type: 'SMS',
      contentType: 'COMM',
      countryCode: '82',
      from: fromNumber,
      content: `[크레딧톡] 새로운 헬프데스크 문의가 등록되었습니다: "${helpQuestion.title}"`,
      messages: [
        {
          to: adminPhoneNumber.replace(/-/g, ''),
        },
      ],
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'x-ncp-apigw-timestamp': timestamp,
        'x-ncp-iam-access-key': accessKey,
        'x-ncp-apigw-signature-v2': signatureBase64,
      },
      body: JSON.stringify(requestBody),
    });

    const responseData = await response.json();

    if (response.status !== 202) {
      throw new Error(`SENS API 에러: ${JSON.stringify(responseData)}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `관리자에게 알림이 성공적으로 발송되었습니다. (ID: ${responseData.requestId})`,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
