-- ============================================================
-- Profile v2.
--
--   1) Replace the 6 trainer character keys with 1세대 관동
--      anime canon characters: ash / misty / brock / oak /
--      gary / lance.
--   2) Wipe any users.character that no longer matches the new
--      key set.
--   3) Add update_display_name RPC so users can rename their
--      nickname (length 2~20, unique case-insensitive — matches
--      the signup constraint).
--
-- Idempotent — safe to re-run.
-- ============================================================

create or replace function is_valid_character(p_character text) returns boolean
language sql immutable as $$
  select p_character in ('ash', 'misty', 'brock', 'oak', 'gary', 'lance')
$$;

update users
   set "character" = null
 where "character" is not null
   and "character" not in ('ash', 'misty', 'brock', 'oak', 'gary', 'lance');

create or replace function update_display_name(
  p_user_id uuid,
  p_name text
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_clean text := trim(coalesce(p_name, ''));
  v_current text;
begin
  if length(v_clean) < 2 or length(v_clean) > 20 then
    return json_build_object('ok', false, 'error', '닉네임은 2~20자여야 합니다.');
  end if;

  select display_name into v_current from users where id = p_user_id;
  if not found then
    return json_build_object('ok', false, 'error', '사용자를 찾을 수 없습니다.');
  end if;

  if lower(v_current) <> lower(v_clean) then
    if exists (
      select 1 from users
       where lower(display_name) = lower(v_clean)
         and id <> p_user_id
    ) then
      return json_build_object('ok', false, 'error', '이미 사용 중인 닉네임이에요.');
    end if;
  end if;

  update users
     set display_name = v_clean
   where id = p_user_id;

  return json_build_object('ok', true, 'display_name', v_clean);
end;
$$;

grant execute on function is_valid_character(text) to anon, authenticated;
grant execute on function update_display_name(uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
