// supabase/functions/new-comment-notification/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  {
    global: {
      headers: {
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

const BOARD_MAP = {
  community_posts: {
    table: 'community_posts',
    screen: 'CommunityPostDetail',
    authorCol: 'user_id',
  },
  arrest_news: {
    table: 'arrest_news',
    screen: 'ArrestNewsDetail',
    authorCol: null,
  }, // 작성자 ID 없음
  incident_photos: {
    table: 'incident_photos',
    screen: 'IncidentPhotoDetail',
    authorCol: 'uploader_id',
  },
  new_crime_cases: {
    table: 'new_crime_cases',
    screen: 'NewCrimeCaseDetail',
    authorCol: 'user_id',
  },
  notices: { table: 'notices', screen: 'NoticeDetail', authorCol: null }, // 작성자 ID 없음
  reviews: { table: 'reviews', screen: 'ReviewDetail', authorCol: 'user_id' },
};

async function sendPush(userIds, title, body, data) {
  if (!userIds || userIds.length === 0) return;
  // 중복 및 null 값 제거
  const uniqueUserIds = [...new Set(userIds.filter(id => id))];
  if (uniqueUserIds.length === 0) return;

  try {
    await supabaseAdmin.functions.invoke('send-fcm-v1-push', {
      body: { user_ids: uniqueUserIds, title, body, data },
    });
  } catch (error) {
    console.error('Failed to invoke send-fcm-v1-push:', error);
  }
}

Deno.serve(async req => {
  const { record: comment } = await req.json();

  if (!comment || !comment.post_id || !comment.board_type || !comment.user_id) {
    return new Response('Invalid comment data', { status: 400 });
  }

  const postTypeInfo = BOARD_MAP[comment.board_type];
  if (!postTypeInfo) {
    return new Response('Invalid board type', { status: 400 });
  }

  // 댓글 작성자 정보 조회
  const { data: commenter } = await supabaseAdmin
    .from('users')
    .select('auth_user_id, nickname')
    .eq('id', comment.user_id)
    .single();
  const commenterAuthId = commenter?.auth_user_id;
  const commenterNickname = commenter?.nickname ?? '익명';

  const notificationData = {
    screen: postTypeInfo.screen,
    params: JSON.stringify({ id: comment.post_id }),
  };

  // 1. 게시글 작성자에게 알림 전송
  if (postTypeInfo.authorCol) {
    const { data: post } = await supabaseAdmin
      .from(postTypeInfo.table)
      .select(`title, ${postTypeInfo.authorCol}`)
      .eq('id', comment.post_id)
      .single();

    if (post) {
      const postAuthorAuthId = post[postTypeInfo.authorCol];
      // 본인이 본인 글에 댓글 달면 알림 X
      if (postAuthorAuthId && postAuthorAuthId !== commenterAuthId) {
        await sendPush(
          [postAuthorAuthId],
          `'${post.title}' 글에 새 댓글이 달렸습니다.`,
          `${commenterNickname}: ${comment.content}`,
          notificationData,
        );
      }
    }
  }

  // 2. 대댓글일 경우, 원 댓글 작성자에게 알림 전송
  if (comment.parent_comment_id) {
    const { data: parentComment } = await supabaseAdmin
      .from('comments')
      .select('user_id')
      .eq('id', comment.parent_comment_id)
      .single();

    if (parentComment?.user_id) {
      const { data: parentCommenter } = await supabaseAdmin
        .from('users')
        .select('auth_user_id')
        .eq('id', parentComment.user_id)
        .single();

      const parentCommenterAuthId = parentCommenter?.auth_user_id;

      // 본인이 본인 댓글에 대댓글 달면 알림 X, 게시글 작성자에게는 이미 위에서 보냈으므로 중복 방지
      if (parentCommenterAuthId && parentCommenterAuthId !== commenterAuthId) {
        await sendPush(
          [parentCommenterAuthId],
          '내 댓글에 새 답글이 달렸습니다.',
          `${commenterNickname}: ${comment.content}`,
          notificationData,
        );
      }
    }
  }

  return new Response(JSON.stringify({ message: 'OK' }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
