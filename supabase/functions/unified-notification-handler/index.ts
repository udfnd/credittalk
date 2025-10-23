import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Expo } from 'https://esm.sh/expo-server-sdk@3.7.0';

// Supabase 클라이언트와 Expo Push 클라이언트를 초기화합니다.
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);
const expo = new Expo();

// --- 유틸리티 함수들 ---

// 테이블 이름을 한국어로 변환해주는 맵
const TABLE_TO_KOREAN = {
  arrest_news: '검거소식',
  community_posts: '커뮤니티',
  new_crime_cases: '신종범죄',
  incident_photos: '사건사고',
  notices: '공지사항',
  reviews: '이용후기',
};

// 사용자의 Push Token을 가져오는 함수
async function getPushTokens(userIds) {
  const { data, error } = await supabaseAdmin
    .from('device_push_tokens')
    .select('token')
    .in('user_id', userIds)
    .eq('enabled', true);
  if (error) throw error;
  return data.map(d => d.token).filter(Expo.isExpoPushToken);
}

// Push 알림을 일괄 전송하는 함수
async function sendPushNotifications(messages) {
  if (messages.length === 0) return;
  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (error) {
      console.error('Push 알림 전송 실패:', error);
    }
  }
}

// --- 알림 유형별 핸들러 ---

// 1. 새 게시글 알림 처리
async function handleNewPost(data) {
  const { table, record } = data;
  const boardName = TABLE_TO_KOREAN[table] || '새 소식';

  // 모든 사용자에게 알림을 보냅니다. (향후 특정 사용자 그룹으로 변경 가능)
  const { data: users, error } = await supabaseAdmin
    .from('users')
    .select('auth_user_id')
    // 본인 제외
    .neq('auth_user_id', record.user_id);
  if (error || !users) return;

  const userIds = users.map(u => u.auth_user_id);
  const tokens = await getPushTokens(userIds);

  await sendPushNotifications(
    tokens.map(token => ({
      to: token,
      sound: 'default',
      title: `📢 ${boardName}에 새로운 글이 등록되었습니다.`,
      body: record.title,
      data: { url: `/${table}/${record.id}` }, // 앱 내 이동을 위한 데이터
    })),
  );
}

// 2. 새 댓글 알림 처리
async function handleNewComment(data) {
  const { record: comment } = data;

  // 원본 게시글 정보를 가져옵니다.
  const { data: post, error: postError } = await supabaseAdmin
    .from(comment.board_type)
    .select('user_id, title')
    .eq('id', comment.post_id)
    .single();

  if (postError || !post || !post.user_id) return;

  // 자기 자신에게는 알림을 보내지 않습니다.
  if (post.user_id === comment.user_id) return;

  const tokens = await getPushTokens([post.user_id]);

  await sendPushNotifications(
    tokens.map(token => ({
      to: token,
      sound: 'default',
      title: '💬 회원님의 글에 새 댓글이 달렸습니다.',
      body: `"${post.title}"`,
      data: { url: `/${comment.board_type}/${comment.post_id}` },
    })),
  );
}

// 3. 새 채팅 메시지 알림 처리
async function handleNewChatMessage(data) {
  const { record: message } = data;

  // 채팅방 참여자 목록을 가져옵니다. (메시지 보낸 사람 제외)
  const { data: participants, error } = await supabaseAdmin
    .from('chat_room_participants')
    .select('user_id')
    .eq('room_id', message.room_id)
    .neq('user_id', message.sender_id);

  if (error || !participants || participants.length === 0) return;

  const userIds = participants.map(p => p.user_id);
  const tokens = await getPushTokens(userIds);

  // 보낸 사람의 프로필을 가져옵니다.
  const { data: senderProfile } = await supabaseAdmin
    .from('users')
    .select('nickname, name')
    .eq('auth_user_id', message.sender_id)
    .single();

  const senderName = senderProfile?.nickname || senderProfile?.name || '익명';

  await sendPushNotifications(
    tokens.map(token => ({
      to: token,
      sound: 'default',
      title: `💬 ${senderName}님으로부터 새 메시지`,
      body: message.content,
      data: { url: `/chat/${message.room_id}` },
    })),
  );
}

// --- 메인 핸들러 ---

Deno.serve(async req => {
  try {
    // POST 요청이 아니면 거부
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // 데이터베이스에서 보낸 payload를 파싱합니다.
    const { type, data } = await req.json();

    // 알림 유형에 따라 적절한 핸들러를 호출합니다.
    switch (type) {
      case 'NEW_POST':
        await handleNewPost(data);
        break;
      case 'NEW_COMMENT':
        await handleNewComment(data);
        break;
      case 'NEW_CHAT_MESSAGE':
        await handleNewChatMessage(data);
        break;
      default:
        // 알 수 없는 유형이면 무시
        break;
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('알림 처리 중 에러 발생:', err);
    return new Response(String(err?.message ?? err), { status: 500 });
  }
});
