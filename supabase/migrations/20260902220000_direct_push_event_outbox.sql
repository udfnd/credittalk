-- Put database-originated push events directly into the durable outbox.
-- The former trigger -> pg_net -> Edge Function hop could lose an event when
-- the network request or function boot failed because the trigger never saw
-- the asynchronous response.

create or replace function public.handle_new_post_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  record_data jsonb;
  screen_name text;
  id_param_name text;
  post_id text;
  post_title text;
  author_value text;
  admin_author boolean := false;
  admin_ids uuid[] := '{}'::uuid[];
  push_data jsonb;
begin
  record_data := to_jsonb(new);
  post_id := record_data ->> 'id';

  case tg_table_name
    when 'community_posts' then screen_name := 'CommunityPostDetail'; id_param_name := 'postId';
    when 'arrest_news' then screen_name := 'ArrestNewsDetail'; id_param_name := 'newsId';
    when 'incident_photos' then screen_name := 'IncidentPhotoDetail'; id_param_name := 'photoId';
    when 'new_crime_cases' then screen_name := 'NewCrimeCaseDetail'; id_param_name := 'caseId';
    when 'notices' then screen_name := 'NoticeDetail'; id_param_name := 'noticeId';
    when 'reviews' then screen_name := 'ReviewDetail'; id_param_name := 'reviewId';
    when 'events' then screen_name := 'EventDetail'; id_param_name := 'eventId';
    else
      raise warning 'Unsupported post table for push outbox: %', tg_table_name;
      return new;
  end case;

  if post_id is null then
    raise warning 'Post without id was not queued for push: %', tg_table_name;
    return new;
  end if;

  post_title := coalesce(
    nullif(btrim(record_data ->> 'title'), ''),
    nullif(btrim(record_data ->> 'subject'), ''),
    nullif(btrim(record_data ->> 'case_name'), ''),
    '제목 없음'
  );
  author_value := coalesce(
    nullif(record_data ->> 'user_id', ''),
    nullif(record_data ->> 'uploader_id', ''),
    nullif(record_data ->> 'created_by', '')
  );

  admin_author := tg_table_name = 'notices';
  if not admin_author and author_value is not null and
     author_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select coalesce(bool_or(u.is_admin), false)
      into admin_author
    from public.users as u
    where u.auth_user_id = author_value::uuid;
  end if;

  push_data := jsonb_build_object(
    'type', 'NAV',
    'nid', format('post_%s_%s', tg_table_name, post_id),
    'screen', screen_name,
    'params', jsonb_build_object(id_param_name, post_id)::text,
    id_param_name, post_id
  );

  if admin_author then
    insert into public.push_jobs (
      title, body, data, audience, target_user_ids, dry_run,
      scheduled_at, status, attempt_count, locked_at
    ) values (
      '새로운 글이 등록되었습니다', post_title, push_data,
      jsonb_build_object('all', true), null, false,
      now(), 'queued', 0, null
    );
  else
    select coalesce(array_agg(u.auth_user_id), '{}'::uuid[])
      into admin_ids
    from public.users as u
    where u.is_admin is true and u.auth_user_id is not null;

    if cardinality(admin_ids) > 0 then
      insert into public.push_jobs (
        title, body, data, audience, target_user_ids, dry_run,
        scheduled_at, status, attempt_count, locked_at
      ) values (
        '새 글이 등록되었습니다 (관리자용)', post_title, push_data,
        null, admin_ids, false, now(), 'queued', 0, null
      );
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.handle_new_comment_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  comment_data jsonb;
  board_type_name text;
  post_table_name text;
  post_author_column text;
  screen_name text;
  id_param_name text;
  post_id_value bigint;
  post_author_uuid uuid;
  post_title text := '';
  comment_author_uuid uuid;
  comment_author_nickname text := '익명';
  parent_author_uuid uuid;
  notified_ids uuid[] := '{}'::uuid[];
  admin_ids uuid[] := '{}'::uuid[];
  push_data jsonb;
begin
  comment_data := to_jsonb(new);
  board_type_name := comment_data ->> 'board_type';
  if board_type_name = 'review' then board_type_name := 'reviews'; end if;

  case board_type_name
    when 'arrest_news' then post_table_name := 'arrest_news'; post_author_column := 'user_id'; screen_name := 'ArrestNewsDetail'; id_param_name := 'newsId';
    when 'community_posts' then post_table_name := 'community_posts'; post_author_column := 'user_id'; screen_name := 'CommunityPostDetail'; id_param_name := 'postId';
    when 'reviews' then post_table_name := 'reviews'; post_author_column := 'user_id'; screen_name := 'ReviewDetail'; id_param_name := 'reviewId';
    when 'incident_photos' then post_table_name := 'incident_photos'; post_author_column := 'uploader_id'; screen_name := 'IncidentPhotoDetail'; id_param_name := 'photoId';
    when 'new_crime_cases' then post_table_name := 'new_crime_cases'; post_author_column := 'user_id'; screen_name := 'NewCrimeCaseDetail'; id_param_name := 'caseId';
    when 'events' then post_table_name := 'events'; post_author_column := 'created_by'; screen_name := 'EventDetail'; id_param_name := 'eventId';
    when 'notices' then post_table_name := 'notices'; post_author_column := null; screen_name := 'NoticeDetail'; id_param_name := 'noticeId';
    else
      raise warning 'Unsupported comment board type for push outbox: %', board_type_name;
      return new;
  end case;

  if (comment_data ->> 'id') is null or (comment_data ->> 'post_id') is null then
    raise warning 'Comment without id/post_id was not queued for push';
    return new;
  end if;
  post_id_value := (comment_data ->> 'post_id')::bigint;

  if post_author_column is null then
    execute format(
      'select null::uuid, title::text from public.%I where id = $1',
      post_table_name
    ) into post_author_uuid, post_title using post_id_value;
  else
    execute format(
      'select %I, title::text from public.%I where id = $1',
      post_author_column,
      post_table_name
    ) into post_author_uuid, post_title using post_id_value;
  end if;

  select u.auth_user_id, coalesce(nullif(u.nickname, ''), '익명')
    into comment_author_uuid, comment_author_nickname
  from public.users as u
  where u.id = (comment_data ->> 'user_id')::bigint;

  if comment_author_uuid is not null then
    notified_ids := array_append(notified_ids, comment_author_uuid);
  end if;

  push_data := jsonb_build_object(
    'type', 'NAV',
    'nid', format('comment_%s', comment_data ->> 'id'),
    'screen', screen_name,
    'params', jsonb_build_object(id_param_name, post_id_value::text)::text,
    id_param_name, post_id_value::text
  );

  if post_author_uuid is not null and not (post_author_uuid = any(notified_ids)) then
    insert into public.push_jobs (
      title, body, data, audience, target_user_ids, dry_run,
      scheduled_at, status, attempt_count, locked_at
    ) values (
      '새로운 댓글 알림',
      format('%s님이 회원님의 게시물에 댓글을 남겼습니다.', comment_author_nickname),
      push_data, null, array[post_author_uuid], false,
      now(), 'queued', 0, null
    );
    notified_ids := array_append(notified_ids, post_author_uuid);
  end if;

  if nullif(comment_data ->> 'parent_comment_id', '') is not null then
    select u.auth_user_id
      into parent_author_uuid
    from public.comments as c
    join public.users as u on u.id = c.user_id
    where c.id = (comment_data ->> 'parent_comment_id')::bigint;

    if parent_author_uuid is not null and not (parent_author_uuid = any(notified_ids)) then
      insert into public.push_jobs (
        title, body, data, audience, target_user_ids, dry_run,
        scheduled_at, status, attempt_count, locked_at
      ) values (
        '새로운 답글 알림',
        format('%s님이 회원님의 댓글에 답글을 남겼습니다.', comment_author_nickname),
        push_data, null, array[parent_author_uuid], false,
        now(), 'queued', 0, null
      );
      notified_ids := array_append(notified_ids, parent_author_uuid);
    end if;
  end if;

  select coalesce(array_agg(u.auth_user_id), '{}'::uuid[])
    into admin_ids
  from public.users as u
  where u.is_admin is true
    and u.auth_user_id is not null
    and not (u.auth_user_id = any(notified_ids));

  if cardinality(admin_ids) > 0 then
    insert into public.push_jobs (
      title, body, data, audience, target_user_ids, dry_run,
      scheduled_at, status, attempt_count, locked_at
    ) values (
      '[관리자] 새 댓글 알림',
      format('''%s'' 게시물에 %s님이 새 댓글을 작성했습니다.', coalesce(post_title, ''), comment_author_nickname),
      push_data, null, admin_ids, false,
      now(), 'queued', 0, null
    );
  end if;

  return new;
end;
$$;

revoke all on function public.handle_new_post_notification() from public, anon, authenticated;
revoke all on function public.handle_new_comment_notification() from public, anon, authenticated;

-- Removed cron implementation from the first scheduler prototype. It read a
-- legacy service-role value from a database setting and must not be revived.
drop function if exists public.invoke_process_scheduled_push();
