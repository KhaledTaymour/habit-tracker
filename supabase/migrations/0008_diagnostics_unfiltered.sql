-- Widen the diagnostic window, and stop filtering in a way that can hide the answer.
--
-- The previous http_events required content like '%"habits"%'. That excludes exactly
-- the rows worth seeing: a sweep that timed out records status_code null and empty
-- content, so the function may have run, sent, and marked habits notified while the
-- filtered view showed nothing at all.
--
-- This is the second time a filter here hid evidence. The first excluded all-failed
-- runs because their reply contains "sent":0. A diagnostic can carry the same
-- silent-failure bug as the thing it diagnoses, so this one shows everything from the
-- last few hours and lets the reader do the filtering.

-- "Notable" = anything other than a plain idle sweep. A null status (response never
-- recorded) counts, because that is the case the old filter hid.
create or replace function sweep_is_notable(p_status int, p_content text)
returns boolean
language sql
immutable
as $$
  select p_status is null
      or p_status >= 400
      or coalesce(p_content, '') <> '{"sent":0}';
$$;

revoke all on function sweep_is_notable(int, text) from public, anon, authenticated;
grant execute on function sweep_is_notable(int, text) to service_role;

create or replace function reminder_diagnostics(p_user uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'now_utc', now(),

    'cron', coalesce((
      select jsonb_agg(jsonb_build_object(
               'status', d.status,
               'start', d.start_time,
               'message', left(coalesce(d.return_message, ''), 160)))
      from (select * from cron.job_run_details order by start_time desc limit 5) d
    ), '[]'::jsonb),

    -- Anything that is not a plain idle reply: a real send, an error, or a sweep
    -- whose response was never recorded. Unfiltered by content.
    'http_notable', coalesce((
      select jsonb_agg(jsonb_build_object(
               'status_code', r.status_code,
               'content', left(coalesce(r.content, ''), 300),
               'created', r.created))
      from (
        select * from net._http_response
        where sweep_is_notable(status_code::int, content)
        order by created desc limit 20
      ) r
    ), '[]'::jsonb),

    -- How many plain idle minutes, so a gap in coverage is visible as a number
    -- rather than being inferred from the absence of rows.
    'http_idle_count', (
      select count(*) from net._http_response
      where not sweep_is_notable(status_code::int, content)
    ),

    'devices', (select count(*) from push_subscriptions where user_id = p_user),

    'triggers', coalesce((
      select jsonb_agg(t.tgname)
      from pg_trigger t
      where t.tgrelid = 'public.habits'::regclass and not t.tgisinternal
    ), '[]'::jsonb),

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
