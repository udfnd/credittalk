import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const BOARD_TYPE_MAP = {
  arrest_news: {
    postTable: 'arrest_news',
    postTitleColumn: 'title',
    postAuthorColumn: 'user_id',
    screen: 'ArrestNewsDetail',
    idParamName: 'newsId',
  },
  community_posts: {
    postTable: 'community_posts',
    postTitleColumn: 'title',
    postAuthorColumn: 'user_id',
    screen: 'CommunityPostDetail',
    idParamName: 'postId',
  },
  reviews: {
    postTable: 'reviews',
    postTitleColumn: 'title',
    postAuthorColumn: 'user_id',
    screen: 'ReviewDetail',
    idParamName: 'reviewId',
  },
  incident_photos: {
    postTable: 'incident_photos',
    postTitleColumn: 'title',
    postAuthorColumn: 'uploader_id',
    screen: 'IncidentPhotoDetail',
    idParamName: 'photoId',
  },
  new_crime_cases: {
    postTable: 'new_crime_cases',
    postTitleColumn: 'title',
    postAuthorColumn: 'user_id',
    screen: 'NewCrimeCaseDetail',
    idParamName: 'caseId',
  },
} as const;

serve(async req => {
  try {
    const { record: comment } = await req.json();
    const mapping =
      BOARD_TYPE_MAP[comment?.board_type as keyof typeof BOARD_TYPE_MAP];

    if (!comment || !comment.post_id || !mapping) {
      const message = !mapping
        ? `Board type mapping not found for ${comment?.board_type}`
        : 'No comment data or post_id';
      return new Response(JSON.stringify({ message }), { status: 400 });
    }

    // 모든 발송에서 동일 nid 사용 → 재시도/중복 트리거에도 하나로 수렴
    const nid = `comment_${String(comment.id)}`;

    const notifiedUserUuids = new Set<string>();

    const { data: post, error: postError } = await supabaseAdmin
      .from(mapping.postTable)
      .select(`${mapping.postAuthorColumn}, ${mapping.postTitleColumn}`)
      .eq('id', comment.post_id)
      .single();
    if (postError) throw postError;

    const postAuthorUuid = post?.[mapping.postAuthorColumn];
    const postTitle = String(post?.[mapping.postTitleColumn] ?? '');

    const { data: commentAuthor, error: commentAuthorError } =
      await supabaseAdmin
        .from('users')
        .select('nickname, auth_user_id')
        .eq('id', comment.user_id)
        .single();
    if (commentAuthorError) throw commentAuthorError;

    const commentAuthorNickname = commentAuthor?.nickname || '익명';
    const commentAuthorUuid = commentAuthor?.auth_user_id;
    if (commentAuthorUuid) notifiedUserUuids.add(commentAuthorUuid); // 자기 자신 중복 방지

    const notificationData = {
      screen: mapping.screen,
      params: { [mapping.idParamName]: comment.post_id },
      [mapping.idParamName]: comment.post_id,
      nid, // 클라/서버 모두 동일 키 사용
    };

    // 원글 작성자
    if (postAuthorUuid) {
      await supabaseAdmin.functions.invoke('send-fcm-v1-push', {
        body: {
          user_ids: [postAuthorUuid],
          title: '새로운 댓글 알림',
          body: `${commentAuthorNickname}님이 회원님의 게시물에 댓글을 남겼습니다.`,
          data: notificationData,
        },
      });
      notifiedUserUuids.add(postAuthorUuid);
    }

    // 부모 댓글 작성자(대댓글 시)
    if (comment.parent_comment_id) {
      const { data: parentComment } = await supabaseAdmin
        .from('comments')
        .select('user_id')
        .eq('id', comment.parent_comment_id)
        .single();

      const parentUserId = parentComment?.user_id;
      if (parentUserId) {
        const { data: parentAuthor } = await supabaseAdmin
          .from('users')
          .select('auth_user_id')
          .eq('id', parentUserId)
          .single();

        const parentUuid = parentAuthor?.auth_user_id;
        if (parentUuid) {
          await supabaseAdmin.functions.invoke('send-fcm-v1-push', {
            body: {
              user_ids: [parentUuid],
              title: '새로운 답글 알림',
              body: `${commentAuthorNickname}님이 회원님의 댓글에 답글을 남겼습니다.`,
              data: notificationData, // 같은 nid
            },
          });
          notifiedUserUuids.add(parentUuid);
        }
      }
    }

    // 관리자 전체(작성자/부모댓글 작성자와 중복 방지)
    const { data: admins, error: adminError } = await supabaseAdmin
      .from('users')
      .select('auth_user_id')
      .eq('is_admin', true);
    if (!adminError && admins?.length) {
      const adminUuids = admins
        .map(a => a.auth_user_id)
        .filter(
          (uuid): uuid is string =>
            typeof uuid === 'string' && uuid && !notifiedUserUuids.has(uuid),
        );
      if (adminUuids.length) {
        await supabaseAdmin.functions.invoke('send-fcm-v1-push', {
          body: {
            user_ids: adminUuids,
            title: `[관리자] 새 댓글 알림`,
            body: `'${postTitle}' 게시물에 ${commentAuthorNickname}님이 새 댓글을 작성했습니다.`,
            data: notificationData, // 같은 nid
          },
        });
      }
    }

    return new Response(JSON.stringify({ message: 'Notifications sent' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    console.error('Error processing request:', error);
    return new Response(
      JSON.stringify({ error: error?.message ?? String(error) }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});
