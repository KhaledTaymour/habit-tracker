-- The five most recent sweeps are almost always idle minutes replying {"sent":0},
-- which crowds out the one response that matters: the minute a habit was actually
-- due. This adds a filtered view of only the sweeps that attempted a send.
--
-- Filter is on "habits", not on the sent count: a run where every device failed
-- replies {"sent":0,"gone":0,"failed":2,"habits":1}, which still contains "sent":0
-- and would be filtered out by the obvious test.

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

    'http', coalesce((
      select jsonb_agg(jsonb_build_object(
               'status_code', r.status_code,
               'content', left(coalesce(r.content, ''), 200),
               'created', r.created))
      from (select * from net._http_response order by created desc limit 5) r
    ), '[]'::jsonb),

    -- Only the sweeps that found something due and tried to deliver it.
    'http_events', coalesce((
      select jsonb_agg(jsonb_build_object(
               'status_code', r.status_code,
               'content', left(coalesce(r.content, ''), 300),
               'created', r.created))
      from (
        select * from net._http_response
        where coalesce(content, '') like '%"habits"%'
        order by created desc limit 10
      ) r
    ), '[]'::jsonb),

    'devices', (select count(*) from push_subscriptions where user_id = p_user),

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

-- Lets a habit be retried after a transient delivery failure. Without this, one
-- bad send burns the whole day, because mark_notified() had already run.
create or replace function unmark_notified(ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update habits set last_notified_on = null where id = any(ids);
$$;

revoke all on function unmark_notified(uuid[]) from public, anon, authenticated;
grant execute on function unmark_notified(uuid[]) to service_role;
