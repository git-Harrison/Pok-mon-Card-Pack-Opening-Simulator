-- ============================================================
-- CENTER v2 — visit-by-login + sabotage (부수기)
-- Depends on: supabase/center-v1.sql (tables + buy/display/remove RPCs)
--
-- Visitor flow:
--   1. `get_user_center_by_login(login)` — look up someone's center
--      for read-only rendering
--   2. `sabotage_card(attacker_id, showcase_id, slot_index)` —
--      attacker spends 100,000p, 30% success. On success the
--      *entire* showcase (including every card in it) is wiped;
--      the targeted card_id is returned either way so the client
--      can look up the rarity and fire the Discord alert.
-- ============================================================

create or replace function get_user_center_by_login(p_login text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_owner record;
  v_showcases json;
begin
  select id, user_id, display_name into v_owner
    from users where user_id = p_login;
  if not found then
    return json_build_object('ok', false, 'error', '사용자를 찾을 수 없어요.');
  end if;

  v_showcases := get_user_center(v_owner.id);

  return json_build_object('ok', true,
    'owner_id', v_owner.id,
    'login_id', v_owner.user_id,
    'display_name', v_owner.display_name,
    'showcases', v_showcases);
end;
$$;

create or replace function sabotage_card(
  p_attacker_id uuid,
  p_showcase_id uuid,
  p_slot_index int
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_cost int := 100000;
  v_attacker_name text;
  v_attacker_points int;
  v_showcase record;
  v_victim_name text;
  v_victim_login text;
  v_card_id text;
  v_roll numeric;
  v_success boolean;
  v_cards_deleted int := 0;
begin
  if p_attacker_id is null or p_showcase_id is null then
    return json_build_object('ok', false, 'error', '요청이 올바르지 않아요.');
  end if;

  select display_name, points into v_attacker_name, v_attacker_points
    from users where id = p_attacker_id for update;
  if not found then
    return json_build_object('ok', false, 'error', '사용자를 찾을 수 없어요.');
  end if;
  if v_attacker_points < v_cost then
    return json_build_object('ok', false, 'error', '포인트가 부족해요. (10만p 필요)');
  end if;

  select * into v_showcase from user_showcases
    where id = p_showcase_id for update;
  if not found then
    return json_build_object('ok', false, 'error', '보관함을 찾을 수 없어요.');
  end if;
  if v_showcase.user_id = p_attacker_id then
    return json_build_object('ok', false, 'error', '자기 센터는 부술 수 없어요.');
  end if;

  select display_name, user_id into v_victim_name, v_victim_login
    from users where id = v_showcase.user_id;

  select card_id into v_card_id from showcase_cards
    where showcase_id = p_showcase_id and slot_index = p_slot_index;
  if not found then
    return json_build_object('ok', false, 'error', '대상 카드를 찾을 수 없어요.');
  end if;

  -- Deduct the 10만p fee regardless of outcome.
  update users set points = points - v_cost
    where id = p_attacker_id
    returning points into v_attacker_points;

  v_roll := random();
  v_success := v_roll < 0.3;

  if v_success then
    select count(*) into v_cards_deleted from showcase_cards
      where showcase_id = p_showcase_id;
    delete from user_showcases where id = p_showcase_id;
    -- cascades to showcase_cards via FK
  end if;

  return json_build_object('ok', true,
    'success', v_success,
    'cost', v_cost,
    'points', v_attacker_points,
    'attacker_name', v_attacker_name,
    'victim_id', v_showcase.user_id,
    'victim_name', v_victim_name,
    'victim_login', v_victim_login,
    'card_id', v_card_id,
    'cards_destroyed', case when v_success then v_cards_deleted else 0 end);
end;
$$;

grant execute on function get_user_center_by_login(text) to anon, authenticated;
grant execute on function sabotage_card(uuid, uuid, int) to anon, authenticated;

notify pgrst, 'reload schema';
