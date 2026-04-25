-- ============================================================
-- 20260538_character_lineup_fix.sql
--
-- Replace the male "gary" character with the female "leaf"
-- (FRLG female protagonist) so the 1세대 lineup includes a
-- second female trainer. Also refreshes the character allow-
-- list so the new key passes server-side validation, and
-- wipes any stale 'gary' picks back to NULL so users who had
-- chosen Gary can re-pick on next visit.
--
-- Idempotent — safe to re-run. Touching the file rebuilds
-- the function and re-runs the cleanup UPDATE (which is a
-- no-op once 'gary' rows are gone).
-- ============================================================

create or replace function is_valid_character(p_character text) returns boolean
language sql immutable as $$
  select p_character in ('ash', 'misty', 'brock', 'oak', 'leaf', 'lance');
$$;

grant execute on function is_valid_character(text) to anon, authenticated;

-- Wipe stale 'gary' picks back to NULL so affected users can re-pick.
update users set "character" = null where "character" = 'gary';

notify pgrst, 'reload schema';
