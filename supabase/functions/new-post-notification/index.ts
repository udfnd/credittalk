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

const SCREEN_MAP = {
  community_posts: 'CommunityPostDetail',
  arrest_news: 'ArrestNewsDetail',
  incident_photos: 'IncidentPhotoDetail',
  new_crime_cases: 'NewCrimeCaseDetail',
  notices: 'NoticeDetail',
  reviews: 'ReviewDetail',
};

const ID_PARAM_MAP = {
  community_posts: 'postId',
  arrest_news: 'newsId',
  incident_photos: 'photoId',
  new_crime_cases: 'caseId',
  notices: 'noticeId',
  reviews: 'reviewId',
};

const CHUNK_SIZE = 100; // 한 번에 호출할 사용자 수

Deno.serve(async req => {
  const { table, record: post } = await req.json();
  const titleCandidates = [
    post.title,
    post.subject,
    post.case_name,
    '제목 없음',
  ];
  const postTitle = titleCandidates.find(
    t => typeof t === 'string' && t.trim() !== '',
  );

  if (!post || !post.id) {
    return new Response(null, { status: 200 });
  }

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
    if (error) {
      console.error(`Error fetching author profile for ${authorId}:`, error);
    }
    if (authorProfile && authorProfile.is_admin === true) {
      isAdminAuthor = true;
    }
  }

  if (isAdminAuthor) {
    const { data: users, error: userError } = await supabaseAdmin
      .from('users')
      .select('auth_user_id');

    if (userError) {
      console.error('Error fetching users:', userError);
      return new Response(JSON.stringify({ message: 'Error fetching users' }), {
        status: 500,
      });
    }

    if (users && users.length > 0) {
      const userIds = users.map(u => u.auth_user_id).filter(Boolean);
      const screen = SCREEN_MAP[table] || 'Home';
      const idParamKey = ID_PARAM_MAP[table] || 'id';
      const invocations = [];

      for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
        const chunk = userIds.slice(i, i + CHUNK_SIZE);

        // ✅ [수정] 데이터를 플랫한 구조로 변경하여 직관성을 높이고 클라이언트의 파싱 부담을 줄입니다.
        const data = {
          screen,
          [idParamKey]: String(post.id), // FCM 표준에 맞게 ID를 문자열로 변환합니다.
        };

        const invokePromise = supabaseAdmin.functions.invoke(
          'send-fcm-v1-push',
          {
            body: {
              user_ids: chunk,
              title: '새로운 글이 등록되었습니다',
              body: `${postTitle}`,
              data, // ✅ 수정된 데이터 객체를 사용합니다.
            },
          },
        );
        invocations.push(invokePromise);
      }

      await Promise.allSettled(invocations);
      console.log(
        `Successfully invoked ${invocations.length} push notification jobs for table ${table}.`,
      );
    }
  }

  return new Response(JSON.stringify({ message: 'OK, push jobs invoked.' }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
