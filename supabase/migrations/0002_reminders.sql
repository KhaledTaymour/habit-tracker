-- The clock. See DESIGN.md §10.5 for the four gates in picture form.
--
-- All timezone maths lives here rather than in the Edge Function, because
-- Postgres already knows every IANA zone and JS would need a library.

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
           (now() at time zone h.tz)::date                      as local_today,
           extract(dow from (now() at time zone h.tz))::smallint as local_dow,
           to_char(now() at time zone h.tz, 'HH24:MI')           as local_hhmm
    from habits h
    where h.active
  ),
  ready as (
    select l.*
    from local l
    where l.local_hhmm = to_char(l.remind_at, 'HH24:MI')                    -- gate: right minute
      and (l.schedule_type = 'daily' or l.local_dow = any(l.days_of_week))  -- gate: right day
      and (l.last_notified_on is null or l.last_notified_on < l.local_today)-- gate: not sent yet
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

-- security definer means this function can read every user's rows. Only the
-- service role (the Edge Function) may call it.
revoke all on function habits_due_now() from public, anon, authenticated;
grant execute on function habits_due_now() to service_role;

-- Flips the "already sent" gate. Uses each habit's own timezone for "today".
create or replace function mark_notified(ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update habits
     set last_notified_on = (now() at time zone tz)::date
   where id = any(ids);
$$;

revoke all on function mark_notified(uuid[]) from public, anon, authenticated;
grant execute on function mark_notified(uuid[]) to service_role;

-- ------------------------------------------------------------------ the clock
--
-- Runs 1440 times a day. On 1439 of those the four gates above match nothing and
-- it costs one cheap query.
--
-- Prerequisite — store these once, so the URL and key are not in plain SQL:
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<service-role-key>',                'service_role_key');

select cron.schedule(
  'send-habit-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' ||
        (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
