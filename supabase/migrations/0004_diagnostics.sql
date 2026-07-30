-- A read-only window into why a reminder did or did not fire.
--
-- Every failure in DESIGN.md §12 was silence: something reported success while
-- delivering nothing. The scheduled path is the worst of them, because the four
-- gates live in SQL and a rejected gate looks identical to a healthy idle minute.
-- This turns that silence into an answer.
--
-- Reads nothing it does not need, writes nothing at all, and habit rows are scoped
-- to the caller.

create or replace function reminder_diagnostics(p_user uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'now_utc', now(),

    -- Did cron fire? Note: 'succeeded' here only means pg_net queued the request.
    'cron', coalesce((
      select jsonb_agg(jsonb_build_object(
               'status', d.status,
               'start', d.start_time,
               'message', left(coalesce(d.return_message, ''), 160)))
      from (select * from cron.job_run_details order by start_time desc limit 5) d
    ), '[]'::jsonb),

    -- What the function actually replied. This is the row that tells the truth:
    -- a 401 here means the vault service_role_key is wrong, and cron still says
    -- 'succeeded'.
    'http', coalesce((
      select jsonb_agg(jsonb_build_object(
               'status_code', r.status_code,
               'content', left(coalesce(r.content, ''), 200),
               'created', r.created))
      from (select * from net._http_response order by created desc limit 5) r
    ), '[]'::jsonb),

    'devices', (select count(*) from push_subscriptions where user_id = p_user),

    -- Each habit with all four gates evaluated as of right now, so a false gate
    -- names itself instead of being inferred.
    'habits', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', h.name,
        'tz', h.tz,
        'remind_at', h.remind_at,
        'local_now', to_char(now() at time zone h.tz, 'YYYY-MM-DD HH24:MI'),
        'sec_now', extract(epoch from (now() at time zone h.tz)::time)::int,
        'sec_remind', extract(epoch from h.remind_at)::int,
        'local_dow', extract(dow from (now() at time zone h.tz))::int,
        'days_of_week', h.days_of_week,
        'schedule_type', h.schedule_type,
        'last_notified_on', h.last_notified_on,
        'gate_active', h.active,
        'gate_time', (
          extract(epoch from (now() at time zone h.tz)::time)::int >= extract(epoch from h.remind_at)::int
          and extract(epoch from (now() at time zone h.tz)::time)::int < extract(epoch from h.remind_at)::int + 1800
        ),
        'gate_day', (
          h.schedule_type = 'daily'
          or extract(dow from (now() at time zone h.tz))::smallint = any(h.days_of_week)
        ),
        'gate_not_sent_today', (
          h.last_notified_on is null
          or h.last_notified_on < (now() at time zone h.tz)::date
        ),
        'gate_not_done_today', not exists (
          select 1 from habit_completions c
          where c.habit_id = h.id and c.done_on = (now() at time zone h.tz)::date
        )
      ))
      from habits h
      where h.user_id = p_user
    ), '[]'::jsonb)
  );
$$;

revoke all on function reminder_diagnostics(uuid) from public, anon, authenticated;
grant execute on function reminder_diagnostics(uuid) to service_role;
