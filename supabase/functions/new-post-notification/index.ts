// supabase/functions/new-post-notification/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// RLS를 확실히 우회하기 위한 Supabase 클라이언트 생성
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

  // 게시물이나 ID가 없으면 처리 중단
  if (!post || !post.id) {
    return new Response(null, { status: 200 });
  }

  // authorId를 user_id 또는 uploader_id에서 가져오기
  const authorId = post.user_id || post.uploader_id;
  let isAdminAuthor = false;

  // notices, arrest_news 테이블은 작성자 정보가 없으므로 관리자가 작성한 것으로 간주
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

  // 관리자가 작성한 글일 경우에만 모든 사용자에게 알림 발송
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
      const invocations = [];

      for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
        const chunk = userIds.slice(i, i + CHUNK_SIZE);
        const invokePromise = supabaseAdmin.functions.invoke(
          'send-fcm-v1-push',
          {
            body: {
              user_ids: chunk,
              title: '새로운 글이 등록되었습니다',
              body: `${postTitle}`,
              data: { screen, params: JSON.stringify({ id: post.id }) },
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
