// supabase/functions/new-post-notification/index.ts
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
    auth: { autoRefreshToken: false, persistSession: false },
  },
);

const SCREEN_MAP: Record<string, string> = {
  community_posts: 'CommunityPostDetail',
  arrest_news: 'ArrestNewsDetail',
  incident_photos: 'IncidentPhotoDetail',
  new_crime_cases: 'NewCrimeCaseDetail',
  notices: 'NoticeDetail',
  reviews: 'ReviewDetail',
};
const ID_PARAM_MAP: Record<string, string> = {
  community_posts: 'postId',
  arrest_news: 'newsId',
  incident_photos: 'photoId',
  new_crime_cases: 'caseId',
  notices: 'noticeId',
  reviews: 'reviewId',
};

const CHUNK_SIZE = 100;

Deno.serve(async req => {
  try {
    const { table, record: post } = await req.json();

    if (!post || !post.id) {
      return new Response(JSON.stringify({ message: 'No-op' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const postTitle =
      [post.title, post.subject, post.case_name, '제목 없음'].find(
        (t: unknown) => typeof t === 'string' && (t as string).trim() !== '',
      ) ?? '제목 없음';

    const authorId = post.user_id || post.uploader_id;

    // 공통 라우팅 & 디듀프 키
    const screen = SCREEN_MAP[table] || 'Home';
    const idParamKey = ID_PARAM_MAP[table] || 'id';
    const nid = `post_${table}_${post.id}`;

    // 관리자 작성 판단
    let isAdminAuthor = false;
    if (table === 'notices') {
      isAdminAuthor = true;
    } else if (authorId) {
      const { data: authorProfile, error } = await supabaseAdmin
        .from('users')
        .select('is_admin, auth_user_id')
        .eq('auth_user_id', authorId)
        .single();

      if (!error && authorProfile?.is_admin === true) {
        isAdminAuthor = true;
      }
    }

    // (1) 비관리자 작성 → 관리자에게만 발송
    if (!isAdminAuthor) {
      const { data: adminUsers, error: adminErr } = await supabaseAdmin
        .from('users')
        .select('auth_user_id')
        .eq('is_admin', true);

      if (!adminErr && adminUsers?.length) {
        const adminIds = adminUsers
          .map(u => u.auth_user_id)
          .filter(
            (id): id is string =>
              typeof id === 'string' && id.trim().length > 0,
          );

        for (let i = 0; i < adminIds.length; i += CHUNK_SIZE) {
          const chunk = adminIds.slice(i, i + CHUNK_SIZE);
          await supabaseAdmin.functions.invoke('send-fcm-v1-push', {
            body: {
              user_ids: chunk,
              title: '새 글이 등록되었습니다 (관리자용)',
              body: `${postTitle}`,
              data: {
                screen,
                params: { [idParamKey]: post.id },
                [idParamKey]: post.id,
                nid, // ✅ 관리자용도 동일 nid로 수렴
              },
            },
          });
        }
      }

      return new Response(
        JSON.stringify({
          message: 'Not admin author → notified admins only',
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 },
      );
    }

    // (2) 관리자 작성(또는 notices) → 전체 브로드캐스트
    // 선택 A) users 테이블 조회/청크 (기존 로직 유지)
    const { data: users, error: userError } = await supabaseAdmin
      .from('users')
      .select('auth_user_id');

    if (userError) {
      return new Response(JSON.stringify({ message: 'Error fetching users' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    if (!users?.length) {
      return new Response(JSON.stringify({ message: 'No users' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const userIds = users
      .map(u => u.auth_user_id)
      .filter((id): id is string => typeof id === 'string' && id.trim() !== '');

    const jobs: Promise<unknown>[] = [];
    for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
      const chunk = userIds.slice(i, i + CHUNK_SIZE);
      jobs.push(
        supabaseAdmin.functions.invoke('send-fcm-v1-push', {
          body: {
            user_ids: chunk,
            title: '새로운 글이 등록되었습니다',
            body: `${postTitle}`,
            data: {
              screen,
              params: { [idParamKey]: post.id },
              [idParamKey]: post.id,
              nid,
            },
          },
        }),
      );
    }
    await Promise.allSettled(jobs);

    return new Response(JSON.stringify({ message: 'OK, push jobs invoked.' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (e) {
    console.error('[Edge] Unhandled error:', e);
    return new Response(JSON.stringify({ message: 'Internal error' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
