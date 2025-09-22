// supabase/functions/new-post-notification/index.ts
// --------------------------------------------------
// 새 글 등록 시, 각 사용자에게 FCM data-only 페이로드를 보내기 위한 Edge Function
// - 반드시 "data-only"로 전송 (notification 객체 금지)
// - Android: priority=high / iOS: content-available=1 은 send-fcm-v1-push에서 적용
// --------------------------------------------------

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

// 앱 내 라우팅 스크린 매핑
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

const CHUNK_SIZE = 100; // 한 번에 전송할 대상 수

Deno.serve(async req => {
  try {
    const { table, record: post } = await req.json();

    if (!post || !post.id) {
      // 무해한 종료
      return new Response(JSON.stringify({ message: 'No-op' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // 제목 후보
    const postTitle =
      [post.title, post.subject, post.case_name, '제목 없음'].find(
        (t: unknown) => typeof t === 'string' && (t as string).trim() !== '',
      ) ?? '제목 없음';

    // 작성자 관리자 여부 확인 (공지/관리자 글은 전체 전송)
    const authorId = post.user_id || post.uploader_id;
    let isAdminAuthor = false;

    if (table === 'notices') {
      isAdminAuthor = true;
    } else if (authorId) {
      const { data: authorProfile, error } = await supabaseAdmin
        .from('users')
        .select('is_admin')
        .eq('auth_user_id', authorId)
        .single();
      if (error) console.error('[Edge] fetch author profile error:', error);
      if (authorProfile?.is_admin === true) isAdminAuthor = true;
    }

    if (!isAdminAuthor) {
      // 현재 정책: 관리자/공지글만 전체 푸시
      return new Response(
        JSON.stringify({ message: 'Skip (non-admin author)' }),
        {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        },
      );
    }

    const { data: users, error: userError } = await supabaseAdmin
      .from('users')
      .select('auth_user_id');

    if (userError) {
      console.error('[Edge] fetch users error:', userError);
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

    const userIds: string[] = users
      .map((u: any) => u.auth_user_id)
      .filter(Boolean);
    const screen = SCREEN_MAP[table] || 'Home';
    const idParamKey = ID_PARAM_MAP[table] || 'id';

    const invocations: Promise<any>[] = [];

    for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
      const chunk = userIds.slice(i, i + CHUNK_SIZE);

      // ✅ data-only 페이로드 (클라이언트가 로컬 알림 생성/탭 처리/라우팅)
      const data = {
        type: 'new_post',
        screen, // e.g., "ArrestNewsDetail"
        [idParamKey]: String(post.id), // FCM data는 문자열 권장
        title: '새로운 글이 등록되었습니다', // 표시용 - 클라이언트에서 사용
        body: `${postTitle}`, // 표시용 - 클라이언트에서 사용
      };

      invocations.push(
        supabaseAdmin.functions.invoke('send-fcm-v1-push', {
          body: {
            user_ids: chunk,
            // ✨ 반드시 data-only 로 전송하도록 send-fcm-v1-push 구현 필요
            // (Android priority=high / iOS content-available=1 설정)
            data,
            meta: { kind: 'data_only' },
          },
        }),
      );
    }

    await Promise.allSettled(invocations);
    console.log(`[Edge] invoked ${invocations.length} push jobs for ${table}`);

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
