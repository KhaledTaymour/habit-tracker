-- Habit Tracker schema. See DESIGN.md §4.
-- Three tables, row-level security on all of them. The browser talks to Postgres
-- directly with the user's own token, so RLS is the only thing standing between
-- users' data — there is no API layer to also get right.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------- habits

create table habits (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  name             text not null check (length(trim(name)) between 1 and 80),
  emoji            text not null default '✅' check (length(emoji) <= 8),
  schedule_type    text not null check (schedule_type in ('daily', 'days', 'weekly')),
  -- 0 = Sunday .. 6 = Saturday, matching JS getDay(). Empty for 'daily'.
  days_of_week     smallint[] not null default '{}',
  remind_at        time not null,
  -- IANA zone. Lives on the habit, not the user: one table instead of two and no
  -- signup trigger. Cost: travel needs a habit edit. DESIGN.md §4.
  tz               text not null,
  active           boolean not null default true,
  last_notified_on date,
  created_at       timestamptz not null default now(),

  constraint days_required_when_scheduled check (
    schedule_type = 'daily' or cardinality(days_of_week) > 0
  ),
  constraint weekly_is_one_day check (
    schedule_type <> 'weekly' or cardinality(days_of_week) = 1
  ),
  constraint days_in_range check (
    days_of_week <@ array[0,1,2,3,4,5,6]::smallint[]
  )
);

create index habits_due_lookup on habits (active, remind_at) where active;

alter table habits enable row level security;

create policy "own habits" on habits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ------------------------------------------------------- habit_completions

create table habit_completions (
  id       uuid primary key default gen_random_uuid(),
  habit_id uuid not null references habits (id) on delete cascade,
  user_id  uuid not null references auth.users (id) on delete cascade,
  -- A date, not a timestamp: a habit is done today or it isn't. Storing the
  -- second invites timezone bugs and buys nothing.
  done_on  date not null,

  unique (habit_id, done_on)
);

create index completions_by_habit on habit_completions (habit_id, done_on desc);

alter table habit_completions enable row level security;

create policy "own completions" on habit_completions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ------------------------------------------------------ push_subscriptions

create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

create index subscriptions_by_user on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

create policy "own subscriptions" on push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
