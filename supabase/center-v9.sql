-- ============================================================
-- CENTER v9 — successful sabotage rewards attacker 50% of the
-- showcase's purchase price.
-- ============================================================

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
  v_cost int;
  v_loot int := 0;
  v_attacker_name text;
  v_attacker_points int;
  v_showcase record;
  v_victim_name text;
  v_victim_login text;
  v_card_id text;
  v_grade int;
  v_success boolean;
  v_cards_deleted int := 0;
  v_defense numeric;
  v_success_rate numeric;
begin
  if p_attacker_id is null or p_showcase_id is null then
    return json_build_object('ok', false, 'error', '요청이 올바르지 않아요.');
  end if;

  select display_name, points into v_attacker_name, v_attacker_points
    from users where id = p_attacker_id for update;
  if not found then
    return json_build_object('ok', false, 'error', '사용자를 찾을 수 없어요.');
  end if;

  select * into v_showcase from user_showcases
    where id = p_showcase_id for update;
  if not found then
    return json_build_object('ok', false, 'error', '보관함을 찾을 수 없어요.');
  end if;
  if v_showcase.user_id = p_attacker_id then
    return json_build_object('ok', false, 'error', '자기 센터는 부술 수 없어요.');
  end if;

  v_cost := showcase_sabotage_cost(v_showcase.showcase_type);
  if v_attacker_points < v_cost then
    return json_build_object('ok', false, 'error',
      format('포인트가 부족해요. (%sp 필요)', v_cost));
  end if;

  select display_name, user_id into v_victim_name, v_victim_login
    from users where id = v_showcase.user_id;

  select g.card_id, g.grade into v_card_id, v_grade
    from showcase_cards c
    join psa_gradings g on g.id = c.grading_id
    where c.showcase_id = p_showcase_id and c.slot_index = p_slot_index;
  if v_card_id is null then
    return json_build_object('ok', false, 'error', '대상 카드를 찾을 수 없어요.');
  end if;

  update users set points = points - v_cost
    where id = p_attacker_id
    returning points into v_attacker_points;

  v_defense := showcase_defense(v_showcase.showcase_type);
  v_success_rate := greatest(0.0, 0.30 - v_defense);
  v_success := random() < v_success_rate;

  if v_success then
    select count(*) into v_cards_deleted from showcase_cards
      where showcase_id = p_showcase_id;

    -- Loot: 50% of the showcase's purchase price back to the attacker.
    v_loot := floor(showcase_price(v_showcase.showcase_type) * 0.5)::int;
    update users set points = points + v_loot
      where id = p_attacker_id
      returning points into v_attacker_points;

    delete from psa_gradings
      where id in (select grading_id from showcase_cards where showcase_id = p_showcase_id);
    delete from user_showcases where id = p_showcase_id;
  end if;

  insert into sabotage_logs
    (victim_id, attacker_id, attacker_name, card_id, grade, showcase_type, success)
  values
    (v_showcase.user_id, p_attacker_id, v_attacker_name,
     v_card_id, v_grade, v_showcase.showcase_type, v_success);

  return json_build_object('ok', true,
    'success', v_success,
    'cost', v_cost,
    'loot', v_loot,
    'defense', v_defense,
    'success_rate', v_success_rate,
    'points', v_attacker_points,
    'attacker_name', v_attacker_name,
    'victim_id', v_showcase.user_id,
    'victim_name', v_victim_name,
    'victim_login', v_victim_login,
    'card_id', v_card_id,
    'grade', v_grade,
    'cards_destroyed', case when v_success then v_cards_deleted else 0 end);
end;
$$;

grant execute on function sabotage_card(uuid, uuid, int) to anon, authenticated;

notify pgrst, 'reload schema';
