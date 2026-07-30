-- Editing a habit's schedule must clear the "already sent today" flag.
--
-- The bug: a habit fired at 12:45 and was marked notified. The time was then changed
-- to 14:53. last_notified_on was still today, so the gate blocked it and the new time
-- was silently skipped until tomorrow. To the user it looked like the scheduled path
-- was broken, when in fact it had already worked once that day.
--
-- A trigger, not client code: the flag is a database concern and any client that
-- updates a habit would otherwise have to remember this. Re-activating a paused habit
-- resets it too, for the same reason.

create or replace function reset_notified_on_schedule_change()
returns trigger
language plpgsql
as $$
begin
  if new.remind_at      is distinct from old.remind_at
     or new.schedule_type is distinct from old.schedule_type
     or new.days_of_week  is distinct from old.days_of_week
     or (new.active and not old.active)
  then
    new.last_notified_on := null;
  end if;
  return new;
end;
$$;

create trigger habits_reset_notified
  before update on habits
  for each row
  execute function reset_notified_on_schedule_change();

-- One-time repair: clear today's flags. Some were set by the old code even when every
-- delivery failed, and at least one blocks a habit whose time was edited today.
update habits
   set last_notified_on = null
 where last_notified_on = (now() at time zone tz)::date;
