import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  {
    global: {
      headers: {
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`,
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
        (t: unknown) => typeof t === 'string' && String(t).trim() !== '',
      ) ?? '제목 없음';

    const authorId = post.user_id || post.uploader_id;

    const screen = SCREEN_MAP[String(table)] || 'Home';
    const idParamKey = ID_PARAM_MAP[String(table)] || 'id';
    const nid = `post_${String(table)}_${String(post.id)}`;

    const makeDataPayload = () => ({
      type: 'NAV',
      screen: String(screen),
      params: JSON.stringify({ [idParamKey]: String(post.id) }),
      nid: String(nid),
      [idParamKey]: String(post.id),
    });

    let isAdminAuthor = false;

    if (String(table) === 'notices') {
      isAdminAuthor = true;
    } else if (authorId) {
      let authorProfile: { is_admin?: boolean; auth_user_id?: string } | null =
        null;

      const byAuth = await supabaseAdmin
        .from('users')
        .select('is_admin, auth_user_id')
        .eq('auth_user_id', authorId)
        .maybeSingle();

      if (byAuth.data) {
        authorProfile = byAuth.data;
      } else {
        const byId = await supabaseAdmin
          .from('users')
          .select('is_admin, auth_user_id')
          .eq('id', authorId)
          .maybeSingle();
        if (byId.data) authorProfile = byId.data;
      }

      if (authorProfile?.is_admin === true) isAdminAuthor = true;
    }

    if (!isAdminAuthor) {
      const { data: adminUsers, error: adminErr } = await supabaseAdmin
        .from('users')
        .select('auth_user_id')
        .eq('is_admin', true);

      if (adminErr) {
        return new Response(
          JSON.stringify({ message: 'Error fetching admins' }),
          {
            headers: { 'Content-Type': 'application/json' },
            status: 500,
          },
        );
      }

      const adminIds = (adminUsers ?? [])
        .map(u => u.auth_user_id)
        .filter(
          (id): id is string => typeof id === 'string' && id.trim().length > 0,
        );

      for (let i = 0; i < adminIds.length; i += CHUNK_SIZE) {
        const chunk = adminIds.slice(i, i + CHUNK_SIZE).map(String);
        await supabaseAdmin.functions.invoke('send-fcm-v1-push', {
          body: {
            user_ids: chunk,
            title: '새 글이 등록되었습니다 (관리자용)',
            body: `${postTitle}`,
            data: makeDataPayload(),
          },
        });
      }

      return new Response(
        JSON.stringify({ message: 'Not admin author → notified admins only' }),
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
      return new Response(JSON.stringify({ message: 'Error fetching users' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    const userIds = (users ?? [])
      .map(u => u.auth_user_id)
      .filter((id): id is string => typeof id === 'string' && id.trim() !== '');

    const jobs: Promise<unknown>[] = [];
    for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
      const chunk = userIds.slice(i, i + CHUNK_SIZE).map(String);
      jobs.push(
        supabaseAdmin.functions.invoke('send-fcm-v1-push', {
          body: {
            user_ids: chunk,
            title: '새로운 글이 등록되었습니다',
            body: `${postTitle}`,
            data: makeDataPayload(),
          },
        }),
      );
    }
    await Promise.allSettled(jobs);

    return new Response(JSON.stringify({ message: 'OK, push jobs invoked.' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (e: any) {
    return new Response(
      JSON.stringify({ message: e?.message ?? 'Internal error' }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});
