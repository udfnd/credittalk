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

  if (!post || !post.user_id || !post.id) {
    return new Response(null, { status: 200 });
  }

  const { data: authorProfile } = await supabaseAdmin
    .from('users')
    .select('is_admin')
    .eq('auth_user_id', post.user_id)
    .single();

  if (authorProfile && authorProfile.is_admin === true) {
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('auth_user_id');

    if (users && users.length > 0) {
      const userIds = users.map(u => u.auth_user_id).filter(Boolean);
      const screen = SCREEN_MAP[table] || 'Home';

      const invocations = [];

      // [핵심 수정] 사용자 ID 목록을 100명씩 나누어 invoke "명령"만 배열에 담습니다.
      for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
        const chunk = userIds.slice(i, i + CHUNK_SIZE);

        const invokePromise = supabaseAdmin.functions.invoke(
          'send-fcm-v1-push',
          {
            body: {
              user_ids: chunk,
              title: '새 글이 등록되었습니다',
              body: `제목: ${postTitle}`,
              data: { screen, params: JSON.stringify({ id: post.id }) },
            },
          },
        );
        invocations.push(invokePromise);
      }

      // [핵심 수정] 모든 invoke 명령을 await 없이 동시에 실행시킵니다.
      // 이렇게 하면 이 함수는 즉시 종료되고, 호출된 함수들이 각자 알아서 작업을 완료합니다.
      await Promise.all(invocations);
      console.log(
        `Successfully invoked ${invocations.length} push notification jobs.`,
      );
    }
  }

  return new Response(JSON.stringify({ message: 'OK, push jobs invoked.' }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
