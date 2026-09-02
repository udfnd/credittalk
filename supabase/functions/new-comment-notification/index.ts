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

const BOARD_TYPE_MAP = {
  arrest_news: ['arrest_news', 'title', 'user_id', 'ArrestNewsDetail', 'newsId'],
  community_posts: ['community_posts', 'title', 'user_id', 'CommunityPostDetail', 'postId'],
  reviews: ['reviews', 'title', 'user_id', 'ReviewDetail', 'reviewId'],
  incident_photos: ['incident_photos', 'title', 'uploader_id', 'IncidentPhotoDetail', 'photoId'],
  new_crime_cases: ['new_crime_cases', 'title', 'user_id', 'NewCrimeCaseDetail', 'caseId'],
  events: ['events', 'title', 'created_by', 'EventDetail', 'eventId'],
  notices: ['notices', 'title', null, 'NoticeDetail', 'noticeId'],
} as const;

const BOARD_TYPE_ALIASES: Record<string, keyof typeof BOARD_TYPE_MAP> = {
  review: 'reviews',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function notify(userIds: string[], title: string, body: string, data: Record<string, string>) {
  const targets = [...new Set(userIds.filter(Boolean))];
  if (targets.length === 0) return null;
  const { data: job, error } = await supabaseAdmin
    .from('push_jobs')
    .insert({
      title,
      body,
      data,
      audience: null,
      target_user_ids: targets,
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
    const { record: comment } = await request.json();
    const rawBoardType = String(comment?.board_type ?? '');
    const boardType = BOARD_TYPE_ALIASES[rawBoardType] ?? rawBoardType;
    const mapping = BOARD_TYPE_MAP[boardType as keyof typeof BOARD_TYPE_MAP];
    if (!comment?.id || !comment?.post_id || !mapping) {
      return json({ error: 'Unsupported board type or missing comment fields' }, 400);
    }

    const [postTable, titleColumn, authorColumn, screen, idParamName] = mapping;
    const { data: post, error: postError } = await supabaseAdmin
      .from(postTable)
      .select(authorColumn ? `${authorColumn}, ${titleColumn}` : titleColumn)
      .eq('id', comment.post_id)
      .single();
    if (postError) throw postError;

    const { data: commentAuthor, error: authorError } = await supabaseAdmin
      .from('users')
      .select('nickname, auth_user_id')
      .eq('id', comment.user_id)
      .single();
    if (authorError) throw authorError;

    const nickname = commentAuthor?.nickname || '익명';
    const commentAuthorUuid = String(commentAuthor?.auth_user_id ?? '');
    const notified = new Set<string>(commentAuthorUuid ? [commentAuthorUuid] : []);
    const data = {
      type: 'NAV',
      screen,
      params: JSON.stringify({ [idParamName]: String(comment.post_id) }),
      nid: `comment_${String(comment.id)}`,
      [idParamName]: String(comment.post_id),
    };

    const postAuthorUuid = authorColumn ? String(post?.[authorColumn] ?? '') : '';
    if (postAuthorUuid && !notified.has(postAuthorUuid)) {
      await notify(
        [postAuthorUuid],
        '새로운 댓글 알림',
        `${nickname}님이 회원님의 게시물에 댓글을 남겼습니다.`,
        data,
      );
      notified.add(postAuthorUuid);
    }

    if (comment.parent_comment_id) {
      const { data: parentComment, error: parentError } = await supabaseAdmin
        .from('comments')
        .select('user_id')
        .eq('id', comment.parent_comment_id)
        .maybeSingle();
      if (parentError) throw parentError;
      if (parentComment?.user_id) {
        const { data: parentAuthor, error: parentAuthorError } = await supabaseAdmin
          .from('users')
          .select('auth_user_id')
          .eq('id', parentComment.user_id)
          .maybeSingle();
        if (parentAuthorError) throw parentAuthorError;
        const parentUuid = String(parentAuthor?.auth_user_id ?? '');
        if (parentUuid && !notified.has(parentUuid)) {
          await notify(
            [parentUuid],
            '새로운 답글 알림',
            `${nickname}님이 회원님의 댓글에 답글을 남겼습니다.`,
            data,
          );
          notified.add(parentUuid);
        }
      }
    }

    const { data: admins, error: adminError } = await supabaseAdmin
      .from('users')
      .select('auth_user_id')
      .eq('is_admin', true);
    if (adminError) throw adminError;
    const adminIds = (admins ?? [])
      .map(admin => String(admin.auth_user_id ?? ''))
      .filter(uuid => uuid && !notified.has(uuid));
    await notify(
      adminIds,
      '[관리자] 새 댓글 알림',
      `'${String(post?.[titleColumn] ?? '')}' 게시물에 ${nickname}님이 새 댓글을 작성했습니다.`,
      data,
    );

    return json({ message: 'Notifications queued' }, 202);
  } catch (error) {
    const message = String((error as Error)?.message ?? error).slice(0, 500);
    console.error('[new-comment-notification]', message);
    return json({ error: message }, 500);
  }
});
