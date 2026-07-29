-- Replaces the exact-minute gate with a 30-minute window.
--
-- Before: fired only when local time equalled remind_at to the minute. One late or
-- skipped cron run and the reminder was silently lost for the whole day — the worst
-- possible failure for the app's only real feature.
--
-- After: fires on the first sweep at or after remind_at, within 30 minutes.
-- last_notified_on still guarantees exactly one per day. A reminder four minutes
-- late is useful; one that never comes is not.
--
-- Comparison is in seconds-since-midnight rather than `time + interval '30 min'`,
-- because time arithmetic wraps: 23:50 + 30min = 00:20, which makes a BETWEEN read
-- backwards and silently matches nothing. Seconds cannot wrap, and a habit set near
-- midnight simply gets a shorter window instead of a broken one.

create or replace function habits_due_now()
returns table (
  habit_id uuid,
  user_id  uuid,
  name     text,
  emoji    text,
  pending  integer,
  endpoint text,
  p256dh   text,
  auth     text
)
language sql
security definer
set search_path = public
as $$
  with local as (
    select h.*,
           (now() at time zone h.tz)::date                              as local_today,
           extract(dow from (now() at time zone h.tz))::smallint         as local_dow,
           extract(epoch from (now() at time zone h.tz)::time)::int      as sec_now,
           extract(epoch from h.remind_at)::int                         as sec_remind
    from habits h
    where h.active
  ),
  ready as (
    select l.*
    from local l
    where l.sec_now >= l.sec_remind                                         -- gate: time has come
      and l.sec_now < l.sec_remind + 1800                                   -- gate: still within 30 min
      and (l.schedule_type = 'daily' or l.local_dow = any(l.days_of_week))  -- gate: right day
      and (l.last_notified_on is null or l.last_notified_on < l.local_today)-- gate: not sent yet today
      and not exists (                                                      -- gate: not already done
        select 1 from habit_completions c
        where c.habit_id = l.id and c.done_on = l.local_today
      )
  )
  select r.id, r.user_id, r.name, r.emoji,
         (
           -- Badge number: everything still owed today by this user.
           select count(*)::integer
           from habits h2
           where h2.user_id = r.user_id
             and h2.active
             and (
               h2.schedule_type = 'daily'
               or extract(dow from (now() at time zone h2.tz))::smallint = any(h2.days_of_week)
             )
             and not exists (
               select 1 from habit_completions c2
               where c2.habit_id = h2.id
                 and c2.done_on = (now() at time zone h2.tz)::date
             )
         ) as pending,
         s.endpoint, s.p256dh, s.auth
  from ready r
  join push_subscriptions s on s.user_id = r.user_id;
$$;

revoke all on function habits_due_now() from public, anon, authenticated;
grant execute on function habits_due_now() to service_role;
