-- ============================================================
-- list_users() — small directory used by the <UserSelect> picker.
-- Returns id, login (user_id), display_name, character key.
-- Sorted by display_name for the search list.
--
-- Idempotent: create or replace + grants are re-runnable.
-- ============================================================

create or replace function list_users()
returns table(id uuid, user_id text, display_name text, "character" text)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select id, user_id, display_name, "character" from users order by display_name;
$$;

grant execute on function list_users() to anon, authenticated;
notify pgrst, 'reload schema';
