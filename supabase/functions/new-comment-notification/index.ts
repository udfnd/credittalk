import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// [핵심 수정] RLS를 확실히 우회하기 위한 Supabase 클라이언트 생성
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

Deno.serve(async req => {
  const { record: comment } = await req.json();

  if (!comment || !comment.post_id || !comment.board_type || !comment.user_id)
    return new Response(null, { status: 200 });

  const postTypeInfo = BOARD_MAP[comment.board_type];
  if (!postTypeInfo) return new Response(null, { status: 200 });

  const { data: commenter } = await supabaseAdmin
    .from('users')
    .select('auth_user_id')
    .eq('id', comment.user_id)
    .single();
  const commenterAuthId = commenter?.auth_user_id;

  const { data: post } = await supabaseAdmin
    .from(postTypeInfo.table)
    .select('title, user_id')
    .eq('id', comment.post_id)
    .single();
  if (!post || !post.user_id) return new Response(null, { status: 200 });

  const postAuthorAuthId = post.user_id;

  // 1. 관리자에게 알림 전송
  const { data: admins } = await supabaseAdmin
    .from('users')
    .select('auth_user_id')
    .eq('is_admin', true);
  if (admins) {
    const adminIds = admins
      .map(a => a.auth_user_id)
      .filter(id => id && id !== commenterAuthId);
    if (adminIds.length > 0) {
      await supabaseAdmin.functions.invoke('send-fcm-v1-push', {
        body: {
          user_ids: adminIds,
          title: '새로운 댓글이 등록되었습니다.',
          body: comment.content,
          data: {
            screen: postTypeInfo.screen,
            params: JSON.stringify({ id: comment.post_id }),
          },
        },
      });
    }
  }

  // 2. 게시글 작성자에게 알림 전송
  if (postAuthorAuthId && postAuthorAuthId !== commenterAuthId) {
    const { count } = await supabaseAdmin
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', comment.post_id)
      .eq('board_type', comment.board_type);
    await supabaseAdmin.functions.invoke('send-fcm-v1-push', {
      body: {
        user_ids: [postAuthorAuthId],
        title: `"${post.title}"에 댓글이 등록되었습니다`,
        body: `총 ${count || 1}개의 댓글이 있습니다.`,
        data: {
          screen: postTypeInfo.screen,
          params: JSON.stringify({ id: comment.post_id }),
        },
      },
    });
  }

  return new Response(JSON.stringify({ message: 'OK' }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
