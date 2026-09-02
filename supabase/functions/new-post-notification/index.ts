import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  authorizeInternalRequest,
  getPushInternalKey,
} from '../_shared/push-auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const adminKey = getPushInternalKey();
const supabaseAdmin = createClient(SUPABASE_URL, adminKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SCREEN_MAP: Record<string, string> = {
  community_posts: 'CommunityPostDetail',
  arrest_news: 'ArrestNewsDetail',
  incident_photos: 'IncidentPhotoDetail',
  new_crime_cases: 'NewCrimeCaseDetail',
  notices: 'NoticeDetail',
  reviews: 'ReviewDetail',
  events: 'EventDetail',
};

const ID_PARAM_MAP: Record<string, string> = {
  community_posts: 'postId',
  arrest_news: 'newsId',
  incident_photos: 'photoId',
  new_crime_cases: 'caseId',
  notices: 'noticeId',
  reviews: 'reviewId',
  events: 'eventId',
};

const CHUNK_SIZE = 100;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function enqueuePush(
  title: string,
  body: string,
  data: Record<string, string>,
  userIds: string[] | null,
) {
  const { data: job, error } = await supabaseAdmin
    .from('push_jobs')
    .insert({
      title,
      body,
      data,
      audience: userIds ? null : { all: true },
      target_user_ids: userIds,
      dry_run: false,
      scheduled_at: new Date().toISOString(),
      status: 'queued',
      attempt_count: 0,
      locked_at: null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return Number(job.id);
}

Deno.serve(async request => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    if (!authorizeInternalRequest(request)) return json({ error: 'Unauthorized' }, 401);
    const { table, record: post } = await request.json();
    const tableName = String(table ?? '');
    const screen = SCREEN_MAP[tableName];
    const idParamKey = ID_PARAM_MAP[tableName];
    if (!post?.id || !screen || !idParamKey) {
      return json({ error: 'Unsupported table or missing post id' }, 400);
    }

    const postTitle =
      [post.title, post.subject, post.case_name, '제목 없음'].find(
        value => typeof value === 'string' && value.trim(),
      ) ?? '제목 없음';
    const authorId = post.user_id || post.uploader_id || post.created_by;
    const data = {
      type: 'NAV',
      nid: `post_${tableName}_${String(post.id)}`,
      screen,
      params: JSON.stringify({ [idParamKey]: String(post.id) }),
      [idParamKey]: String(post.id),
    };

    let isAdminAuthor = tableName === 'notices';
    if (!isAdminAuthor && authorId) {
      const byAuth = await supabaseAdmin
        .from('users')
        .select('is_admin')
        .eq('auth_user_id', authorId)
        .maybeSingle();
      if (byAuth.error) throw byAuth.error;
      if (byAuth.data?.is_admin === true) {
        isAdminAuthor = true;
      } else {
        const byId = await supabaseAdmin
          .from('users')
          .select('is_admin')
          .eq('id', authorId)
          .maybeSingle();
        if (byId.error) throw byId.error;
        isAdminAuthor = byId.data?.is_admin === true;
      }
    }

    if (isAdminAuthor) {
      const jobId = await enqueuePush(
        '새로운 글이 등록되었습니다',
        String(postTitle),
        data,
        null,
      );
      return json({ message: 'Broadcast queued', job_id: jobId }, 202);
    }

    const { data: admins, error } = await supabaseAdmin
      .from('users')
      .select('auth_user_id')
      .eq('is_admin', true);
    if (error) throw error;
    const adminIds = [...new Set(
      (admins ?? [])
        .map(user => user.auth_user_id)
        .filter((id): id is string => typeof id === 'string' && Boolean(id.trim())),
    )];
    const jobIds = [];
    for (let index = 0; index < adminIds.length; index += CHUNK_SIZE) {
      jobIds.push(
        await enqueuePush(
          '새 글이 등록되었습니다 (관리자용)',
          String(postTitle),
          data,
          adminIds.slice(index, index + CHUNK_SIZE),
        ),
      );
    }
    return json({ message: 'Admin notification queued', job_ids: jobIds }, 202);
  } catch (error) {
    const message = String((error as Error)?.message ?? error).slice(0, 500);
    console.error('[new-post-notification]', message);
    return json({ error: message }, 500);
  }
});
