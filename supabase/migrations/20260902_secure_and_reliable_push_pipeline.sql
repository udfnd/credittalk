-- Secure internal push webhooks, make scheduled-job claiming atomic, and remove
-- the obsolete chat sender. The actual API key is stored separately in Vault.

alter table public.push_jobs
  add column if not exists attempt_count integer not null default 0,
  add column if not exists locked_at timestamptz,
  add column if not exists last_error text;

create index if not exists push_jobs_due_idx
  on public.push_jobs (scheduled_at, id)
  where status = 'queued';

create index if not exists push_jobs_lease_idx
  on public.push_jobs (locked_at, id)
  where status = 'processing';

-- Do not unexpectedly deliver year-old jobs created by the legacy code path.
update public.push_jobs
set status = 'failed',
    locked_at = null,
    last_error = 'Legacy job was left queued/processing before reliable leases were introduced',
    result = jsonb_build_object(
      'error', 'legacy_stuck_job',
      'migrated_at', now()
    )
where status in ('queued', 'processing')
  and created_at < now() - interval '1 hour';

create or replace function public.claim_due_push_jobs(p_limit integer default 10)
returns setof public.push_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- A worker that died after claiming gets a bounded retry. The stable nid/tag
  -- makes an ambiguous resend replace the prior Android notification.
  update public.push_jobs
  set status = 'queued',
      scheduled_at = now(),
      locked_at = null,
      last_error = coalesce(last_error, 'Processing lease expired')
  where status = 'processing'
    and locked_at < now() - interval '15 minutes'
    and attempt_count < 6;

  update public.push_jobs
  set status = 'failed',
      locked_at = null,
      last_error = coalesce(last_error, 'Maximum attempts reached after lease expiry'),
      result = coalesce(result, '{}'::jsonb) || jsonb_build_object(
        'error', coalesce(last_error, 'lease_expired'),
        'attempt', attempt_count
      )
  where status = 'processing'
    and locked_at < now() - interval '15 minutes'
    and attempt_count >= 6;

  return query
  with candidates as (
    select job.id
    from public.push_jobs as job
    where job.status = 'queued'
      and coalesce(job.scheduled_at, job.created_at) <= now()
    order by coalesce(job.scheduled_at, job.created_at), job.id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  )
  update public.push_jobs as job
  set status = 'processing',
      locked_at = now(),
      attempt_count = job.attempt_count + 1,
      last_error = null
  from candidates
  where job.id = candidates.id
  returning job.*;
end;
$$;

revoke all on function public.claim_due_push_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_due_push_jobs(integer) to service_role;

create or replace function public.handle_new_post_notification()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault, pg_temp
as $$
declare
  push_key text;
begin
  select decrypted_secret into push_key
  from vault.decrypted_secrets
  where name = 'push_internal_api_key'
  order by created_at desc
  limit 1;

  if push_key is null then
    raise warning 'push_internal_api_key is missing; new-post push skipped';
    return new;
  end if;

  perform net.http_post(
    url := 'https://lmwtidqrmfclrbapmtdm.supabase.co/functions/v1/new-post-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', push_key
    ),
    body := jsonb_build_object('table', tg_table_name, 'record', row_to_json(new))
  );
  return new;
end;
$$;

create or replace function public.handle_new_comment_notification()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault, pg_temp
as $$
declare
  push_key text;
begin
  select decrypted_secret into push_key
  from vault.decrypted_secrets
  where name = 'push_internal_api_key'
  order by created_at desc
  limit 1;

  if push_key is null then
    raise warning 'push_internal_api_key is missing; new-comment push skipped';
    return new;
  end if;

  perform net.http_post(
    url := 'https://lmwtidqrmfclrbapmtdm.supabase.co/functions/v1/new-comment-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', push_key
    ),
    body := jsonb_build_object('record', row_to_json(new))
  );
  return new;
end;
$$;

-- Chat screens and the legacy users.fcm_token sender are no longer registered
-- in the Android app. Keeping this trigger only generated failed HTTP calls.
drop trigger if exists on_new_chat_message_send_push on public.chat_messages;
drop function if exists public.trigger_send_chat_push_notification();

-- Replace the drifted unauthenticated cron call. The command reads Vault only
-- at execution time, so no secret is persisted in SQL source or cron.job.
do $$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid from cron.job where jobname = 'process-scheduled-push'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;
end;
$$;

select cron.schedule(
  'process-scheduled-push',
  '* * * * *',
  $cron$
    select net.http_post(
      url := 'https://lmwtidqrmfclrbapmtdm.supabase.co/functions/v1/process-scheduled-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'push_internal_api_key'
          order by created_at desc
          limit 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $cron$
);
