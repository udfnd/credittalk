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
  community_posts: { table: 'community_posts', screen: 'CommunityPostDetail' },
  arrest_news: { table: 'arrest_news', screen: 'ArrestNewsDetail' },
  incident_photos: { table: 'incident_photos', screen: 'IncidentPhotoDetail' },
  new_crime_cases: { table: 'new_crime_cases', screen: 'NewCrimeCaseDetail' },
  notices: { table: 'notices', screen: 'NoticeDetail' },
  reviews: { table: 'reviews', screen: 'ReviewDetail' },
};

async function sendPush(userIds, title, body, data) {
  if (!userIds || userIds.length === 0) return;
  try {
    await supabaseAdmin.functions.invoke('send-fcm-v1-push', {
      body: { user_ids: userIds, title, body, data },
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

  const { data: commenter } = await supabaseAdmin
    .from('users')
    .select('auth_user_id')
    .eq('id', comment.user_id)
    .single();
  const commenterAuthId = commenter?.auth_user_id;

  const { data: post } = await supabaseAdmin
    .from(postTypeInfo.table)
    .select('title, user_id') // `user_id`는 `author_auth_id`일 수 있습니다. 스키마에 따라 조정 필요.
    .eq('id', comment.post_id)
    .single();

  if (!post) {
    return new Response('Post not found', { status: 404 });
  }

  const postAuthorAuthId = post.user_id;
  const notificationPromises = [];

  // 1. 관리자에게 알림 전송
  const adminNotification = async () => {
    const { data: admins } = await supabaseAdmin
      .from('users')
      .select('auth_user_id')
      .eq('is_admin', true);
    if (admins) {
      const adminIds = admins
        .map(a => a.auth_user_id)
        .filter(id => id && id !== commenterAuthId);
      if (adminIds.length > 0) {
        await sendPush(
          adminIds,
          '새로운 댓글이 등록되었습니다.',
          comment.content,
          {
            screen: postTypeInfo.screen,
            params: JSON.stringify({ id: comment.post_id }),
          },
        );
      }
    }
  };
  notificationPromises.push(adminNotification());

  // 2. 게시글 작성자에게 알림 전송
  const postAuthorNotification = async () => {
    // if (postAuthorAuthId && postAuthorAuthId !== commenterAuthId) {
    await sendPush(
      [postAuthorAuthId],
      `'${post.title}' 글에 새 댓글이 달렸습니다.`,
      comment.content,
      {
        screen: postTypeInfo.screen,
        params: JSON.stringify({ id: comment.post_id }),
      },
    );
    // }
  };
  notificationPromises.push(postAuthorNotification());

  // 3. 대댓글일 경우, 원 댓글 작성자에게 알림 전송
  const parentCommentNotification = async () => {
    if (comment.parent_comment_id) {
      const { data: parentComment } = await supabaseAdmin
        .from('comments')
        .select('user_id')
        .eq('id', comment.parent_comment_id)
        .single();

      if (parentComment && parentComment.user_id) {
        const { data: parentCommenter } = await supabaseAdmin
          .from('users')
          .select('auth_user_id')
          .eq('id', parentComment.user_id)
          .single();

        const parentCommenterAuthId = parentCommenter?.auth_user_id;

        // if (
        //   parentCommenterAuthId &&
        //   parentCommenterAuthId !== commenterAuthId
        // ) {
        await sendPush(
          [parentCommenterAuthId],
          '내 댓글에 새 답글이 달렸습니다.',
          comment.content,
          {
            screen: postTypeInfo.screen,
            params: JSON.stringify({ id: comment.post_id }),
          },
        );
        // }
      }
    }
  };
  notificationPromises.push(parentCommentNotification());

  // 모든 알림 전송 작업을 동시에 실행하고 결과를 기다림
  await Promise.allSettled(notificationPromises);

  return new Response(JSON.stringify({ message: 'OK' }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
