import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// RLS를 우회하기 위한 Admin 클라이언트
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// board_type에 따라 실제 테이블 정보와 화면 이름을 매핑합니다.
const BOARD_TYPE_MAP = {
  arrest_news: {
    postTable: 'arrest_news',
    postTitleColumn: 'title',
    postAuthorColumn: 'user_id',
    screen: 'ArrestNewsDetail',
  },
  community_posts: {
    postTable: 'community_posts',
    postTitleColumn: 'title',
    postAuthorColumn: 'user_id',
    screen: 'CommunityPostDetail',
  },
  reviews: {
    postTable: 'reviews',
    postTitleColumn: 'title',
    postAuthorColumn: 'user_id',
    screen: 'ReviewDetail',
  },
  incident_photos: {
    postTable: 'incident_photos',
    postTitleColumn: 'title',
    postAuthorColumn: 'uploader_id',
    screen: 'IncidentPhotoDetail',
  },
  new_crime_cases: {
    postTable: 'new_crime_cases',
    postTitleColumn: 'title',
    postAuthorColumn: 'user_id',
    screen: 'NewCrimeCaseDetail',
  },
};

serve(async (req: Request) => {
  try {
    const { record: comment } = await req.json();
    const mapping = BOARD_TYPE_MAP[comment.board_type];

    if (!comment || !comment.post_id || !mapping) {
      const message = !mapping
        ? `Board type mapping not found for ${comment.board_type}`
        : 'No comment data or post_id';
      console.log(message);
      return new Response(JSON.stringify({ message }), { status: 400 });
    }

    // Set để 중복 알림 방지
    const notifiedUserUuids = new Set<string>();

    // 1. 게시물 정보 조회
    const { data: post, error: postError } = await supabaseAdmin
      .from(mapping.postTable)
      .select(`${mapping.postAuthorColumn}, ${mapping.postTitleColumn}`)
      .eq('id', comment.post_id)
      .single();

    if (postError) throw postError;

    const postAuthorUuid = post[mapping.postAuthorColumn];
    const postTitle = post[mapping.postTitleColumn];

    // 2. 댓글 작성자 닉네임 조회
    const { data: commentAuthor, error: commentAuthorError } =
      await supabaseAdmin
        .from('users')
        .select('nickname, auth_user_id')
        .eq('id', comment.user_id)
        .single();

    if (commentAuthorError) throw commentAuthorError;
    const commentAuthorNickname = commentAuthor?.nickname || '익명';
    const commentAuthorUuid = commentAuthor?.auth_user_id;

    // 자기 자신에게는 알림을 보내지 않도록 추가
    if (commentAuthorUuid) {
      notifiedUserUuids.add(commentAuthorUuid);
    }

    const notificationData = {
      screen: mapping.screen,
      params: JSON.stringify({ postId: comment.post_id }),
    };

    // 3. 게시물 작성자에게 알림 보내기
    await supabaseAdmin.functions.invoke('send-fcm-v1-push', {
      body: {
        user_ids: [postAuthorUuid],
        title: '새로운 댓글 알림',
        body: `${commentAuthorNickname}님이 회원님의 게시물에 댓글을 남겼습니다.`,
        data: notificationData,
      },
    });
    notifiedUserUuids.add(postAuthorUuid);

    // 4. 답글인 경우, 부모 댓글 작성자에게 알림 보내기
    if (comment.parent_comment_id) {
      const { data: parentComment, error: parentCommentError } =
        await supabaseAdmin
          .from('comments')
          .select('user_id')
          .eq('id', comment.parent_comment_id)
          .single();

      if (parentCommentError) throw parentCommentError;

      const parentCommentAuthorNumericId = parentComment.user_id;

      const { data: parentAuthor, error: parentAuthorError } =
        await supabaseAdmin
          .from('users')
          .select('auth_user_id')
          .eq('id', parentCommentAuthorNumericId)
          .single();

      if (parentAuthorError) {
        console.error(
          `Could not find parent author for numeric id: ${parentCommentAuthorNumericId}`,
        );
      } else {
        await supabaseAdmin.functions.invoke('send-fcm-v1-push', {
          body: {
            user_ids: [parentAuthor.auth_user_id],
            title: '새로운 답글 알림',
            body: `${commentAuthorNickname}님이 회원님의 댓글에 답글을 남겼습니다.`,
            data: notificationData,
          },
        });
        notifiedUserUuids.add(parentAuthor.auth_user_id);
      }
    }

    // ✅ 5. 모든 관리자에게 알림 보내기
    const { data: admins, error: adminError } = await supabaseAdmin
      .from('users')
      .select('auth_user_id')
      .eq('is_admin', true);

    if (adminError) {
      console.error('Error fetching admins:', adminError);
    } else if (admins && admins.length > 0) {
      const adminUuidsToNotify = admins
        .map(a => a.auth_user_id)
        .filter(uuid => uuid && !notifiedUserUuids.has(uuid));

      if (adminUuidsToNotify.length > 0) {
        await supabaseAdmin.functions.invoke('send-fcm-v1-push', {
          body: {
            user_ids: adminUuidsToNotify,
            title: `[관리자] 새 댓글 알림`,
            body: `'${postTitle}' 게시물에 ${commentAuthorNickname}님이 새 댓글을 작성했습니다.`,
            data: notificationData,
          },
        });
      }
    }

    return new Response(JSON.stringify({ message: 'Notifications sent' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Error processing request:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
