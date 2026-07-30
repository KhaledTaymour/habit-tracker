-- Deliberately fails if 0006's trigger is not actually installed, so the answer
-- comes from the database rather than from reading the migration and assuming.
do $$
declare
  found int;
begin
  select count(*) into found
  from pg_trigger
  where tgname = 'habits_reset_notified' and not tgisinternal;

  if found = 0 then
    raise exception 'habits_reset_notified is MISSING';
  end if;
  raise notice 'habits_reset_notified is present';
end;
$$;
