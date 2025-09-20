// supabase/functions/send-chat-push/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { create, getNumericDate } from 'https://deno.land/x/djwt@v2.8/mod.ts';
import { corsHeaders } from '../_shared/cors.ts';

// 서비스 계정 JSON의 타입 정의
interface ServiceAccount {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
}

// Supabase Admin 클라이언트는 환경변수에서 자동으로 URL과 키를 가져와 생성
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

// FCM v1 API 인증을 위한 1시간짜리 임시 액세스 토큰 발급 함수
async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const jwt = await create(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: 'https://oauth2.googleapis.com/token',
      exp: getNumericDate(3600), // 1시간 후 만료
      iat: getNumericDate(0),
    },
    sa.private_key,
  );

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Failed to get access token: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

// Edge Function 메인 로직
Deno.serve(async req => {
  // POST 요청 외에는 처리하지 않음
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 405,
    });
  }

  try {
    // 1. Supabase Secret에 저장된 서비스 계정 정보 불러오기
    const serviceAccountJSON = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
    if (!serviceAccountJSON) {
      throw new Error(
        'Secret "GOOGLE_SERVICE_ACCOUNT_JSON" is not set in Supabase project.',
      );
    }
    const serviceAccount: ServiceAccount = JSON.parse(serviceAccountJSON);
    const projectId = serviceAccount.project_id;

    // 2. DB 트리거로부터 전달받은 새 메시지 데이터 추출
    const { record: newMessage } = await req.json();
    const { room_id, sender_id, content } = newMessage;

    // 3. 발신자 프로필(닉네임) 조회
    const { data: senderProfile } = await supabaseAdmin
      .from('users') // 실제 닉네임이 저장된 테이블
      .select('nickname') // 실제 닉네임 컬럼
      .eq('auth_user_id', sender_id)
      .single();
    const senderName = senderProfile?.nickname || '알 수 없는 사용자';

    // 4. 채팅방 참여자 ID 목록 조회
    const { data: roomData } = await supabaseAdmin
      .from('chat_rooms') // 실제 채팅방 정보 테이블
      .select('participants') // 실제 참여자 목록 컬럼 (UUID 배열 타입)
      .eq('id', room_id)
      .single();

    // 발신자를 제외한 수신자 ID 목록 필터링
    const recipientIds =
      roomData?.participants.filter(id => id !== sender_id) || [];
    if (recipientIds.length === 0) {
      console.log('No recipients to notify.');
      return new Response(JSON.stringify({ message: 'No recipients' }), {
        status: 200,
      });
    }

    // 5. 수신자들의 Push Token 목록 조회
    const { data: tokens } = await supabaseAdmin
      .from('users') // 실제 토큰이 저장된 테이블
      .select('fcm_token') // 실제 토큰 컬럼
      .in('auth_user_id', recipientIds)
      .not('fcm_token', 'is', null);

    if (!tokens || tokens.length === 0) {
      console.log('Recipient tokens not found.');
      return new Response(JSON.stringify({ message: 'Tokens not found' }), {
        status: 200,
      });
    }

    // 6. FCM v1 API로 알림 발송 요청
    const accessToken = await getAccessToken(serviceAccount);

    const pushPromises = tokens.map(({ fcm_token }) => {
      const fcmPayload = {
        message: {
          token: fcm_token,
          notification: { title: senderName, body: content },
          data: {
            // 앱에서 알림 클릭 시 특정 화면으로 이동시키기 위한 데이터
            screen: 'ChatMessageScreen',
            params: JSON.stringify({ roomId: room_id, roomName: senderName }),
          },
          android: { priority: 'high' },
          apns: {
            payload: { aps: { sound: 'default', 'content-available': 1 } },
          },
        },
      };

      return fetch(
        `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(fcmPayload),
        },
      );
    });

    await Promise.all(pushPromises);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Edge Function Error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
