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

      const data = {
        title: '새로운 글이 등록되었습니다',
        body: `${postTitle}`,
        // AdminJS와 동일한 포맷으로 수정
        data: {
          screen: screen,
          params: {
            [idParamKey]: post.id,
          },
        },
      };

      invocations.push(
        supabaseAdmin.functions.invoke('send-fcm-v1-push', {
          body: {
            user_ids: chunk,
            title: data.title,
            body: data.body,
            data: data.data,
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
