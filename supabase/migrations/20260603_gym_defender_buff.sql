-- ============================================================
-- 방어덱 펫 버프 강화 + MUR 2배 효율 (사용자 요청)
--
-- 사용자 요구:
--   "유저가 점령한 체육관은 유저의 전투력에 비례해 기존 보유하고
--    있는 hp나 스텟이 추가버프를 받아서 높아져야하고 MUR 카드가
--    방어덱일 경우 그 효율은 2배가 돼야해"
--
-- 변경 (gym_pet_battle_stats):
--   1) p_is_defender boolean 파라미터 추가.
--   2) 공격 측 (is_defender=false): 기존 비율 그대로 (10/8/6%, cap 1.5x).
--   3) 방어 측 (is_defender=true):
--        bonus_ratio × 1.5  (slot 1 → 15%, 2 → 12%, 3 → 9%).
--        cap × 5.0 (베이스 ATK 의 5배까지 보너스 허용 — 점령 보상감).
--   4) 방어 측 + MUR rarity:
--        bonus_ratio × 2  추가 → 슬롯 1 → 30%, 2 → 24%, 3 → 18%.
--        cap × 10.0 (MUR 은 chase 카드 — 압도적 위력).
--
-- resolve_gym_battle: 방어덱 enemy_states 빌드 시 is_defender=true 전달.
-- ============================================================

create or replace function gym_pet_battle_stats(
  p_grading_id uuid,
  p_slot int,
  p_center_power int,
  p_gym_type text,
  p_pet_type text,
  p_is_defender boolean default false
) returns table(
  hp int, atk int, type text, name text, rarity text, grade int, card_id text
)
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  v_grading record;
  v_card_name text;
  v_pet_type text;
  v_base_hp int;
  v_base_atk int;
  v_grade_mult numeric;
  v_bonus_ratio numeric;
  v_cap_factor numeric;
  v_bonus int;
  v_atk_bonus int;
  v_hp_bonus int;
  v_final_hp int;
  v_final_atk int;
  v_valid_types constant text[] := array[
    '노말','불꽃','물','풀','전기','얼음','격투','독','땅',
    '비행','에스퍼','벌레','바위','고스트','드래곤','악','강철','페어리'
  ];
begin
  select g.id, g.card_id, g.grade, g.rarity into v_grading
    from psa_gradings g where g.id = p_grading_id;
  if not found then return; end if;

  v_card_name := v_grading.card_id;
  if p_pet_type = any(v_valid_types) then
    v_pet_type := p_pet_type;
  else
    v_pet_type := '노말';
  end if;

  select gs.hp, gs.atk into v_base_hp, v_base_atk
    from gym_rarity_stats(v_grading.rarity) gs;
  v_grade_mult := gym_grade_mult(v_grading.grade);
  v_base_hp := round(v_base_hp * v_grade_mult);
  v_base_atk := round(v_base_atk * v_grade_mult);

  -- 기본 보너스 비율 (슬롯별).
  v_bonus_ratio := case p_slot
    when 1 then 0.10
    when 2 then 0.08
    when 3 then 0.06
    else 0
  end;

  -- 방어 측 보너스 강화.
  if p_is_defender then
    v_bonus_ratio := v_bonus_ratio * 1.5;       -- 점령 보상감
    if v_grading.rarity = 'MUR' then
      v_bonus_ratio := v_bonus_ratio * 2.0;     -- MUR 2배 효율
    end if;
  end if;

  v_bonus := round(coalesce(p_center_power, 0) * v_bonus_ratio)::int;

  -- 상한 — 방어 측은 ATK 의 5배 (MUR 은 10배), 공격은 1.5배.
  v_cap_factor := 1.5;
  if p_is_defender then
    v_cap_factor := 5.0;
    if v_grading.rarity = 'MUR' then
      v_cap_factor := 10.0;
    end if;
  end if;
  v_atk_bonus := least(v_bonus, round(v_base_atk * v_cap_factor)::int);
  v_hp_bonus := least(round(v_bonus * 0.5)::int, round(v_base_hp * v_cap_factor)::int);

  v_final_hp := v_base_hp + v_hp_bonus;
  v_final_atk := v_base_atk + v_atk_bonus;

  -- 체육관 속성 일치 시 +5% atk.
  if v_pet_type = p_gym_type then
    v_final_atk := round(v_final_atk * 1.05)::int;
  end if;

  hp := v_final_hp;
  atk := v_final_atk;
  type := v_pet_type;
  name := v_card_name;
  rarity := v_grading.rarity;
  grade := v_grading.grade;
  card_id := v_grading.card_id;
  return next;
end;
$$;

grant execute on function gym_pet_battle_stats(uuid, int, int, text, text, boolean) to anon, authenticated;
-- 옛 5-arg signature 도 함께 grant 유지 (resolve_gym_battle 의 공격
-- 호출이 아직 5-arg 형태). 기본값(p_is_defender=false) 으로 호환.
grant execute on function gym_pet_battle_stats(uuid, int, int, text, text) to anon, authenticated;

-- resolve_gym_battle — 방어 덱 enemy_states 빌드 시 is_defender=true 전달.
-- (공격 펫은 false 기본값 그대로.)
create or replace function resolve_gym_battle(
  p_user_id uuid,
  p_gym_id text,
  p_challenge_id uuid,
  p_pet_grading_ids uuid[],
  p_pet_types text[]
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_challenge record;
  v_gym record;
  v_medal record;
  v_main_ids uuid[];
  v_center_power int;
  v_user_points int;
  v_pet_id uuid;
  v_pet record;
  v_enemy_record record;
  v_owner_record record;
  v_def_center_power int;
  v_def_pet record;
  v_pet_states jsonb := '[]'::jsonb;
  v_enemy_states jsonb := '[]'::jsonb;
  v_pet_idx int := 1;
  v_enemy_idx int := 1;
  v_turn_log jsonb := '[]'::jsonb;
  v_turn int := 0;
  v_max_turns constant int := 200;
  v_eff numeric;
  v_jitter numeric;
  v_dmg int;
  v_crit boolean;
  v_pets_alive int;
  v_enemies_alive int;
  v_winner text;
  v_capture_reward int;
  v_difficulty_mult numeric;
  v_protection_until timestamptz;
  v_destroyed_count int := 0;
begin
  if p_user_id is null or p_gym_id is null or p_challenge_id is null then
    return json_build_object('ok', false, 'error', '요청이 올바르지 않아요.');
  end if;
  if p_pet_grading_ids is null
     or coalesce(array_length(p_pet_grading_ids, 1), 0) <> 3 then
    return json_build_object('ok', false, 'error', '펫 3마리를 선택해주세요.');
  end if;
  if p_pet_types is null
     or coalesce(array_length(p_pet_types, 1), 0) <> 3 then
    return json_build_object('ok', false, 'error', '펫 타입 정보가 부족해요.');
  end if;

  perform pg_advisory_xact_lock(hashtext('gym:' || p_gym_id));

  select * into v_challenge
    from gym_challenges where id = p_challenge_id for update;
  if not found then return json_build_object('ok', false, 'error', '도전 기록을 찾을 수 없어요.'); end if;
  if v_challenge.challenger_user_id <> p_user_id then
    return json_build_object('ok', false, 'error', '본인 도전만 진행할 수 있어요.');
  end if;
  if v_challenge.gym_id <> p_gym_id then
    return json_build_object('ok', false, 'error', '도전 정보가 일치하지 않아요.');
  end if;
  if v_challenge.status <> 'active' then
    return json_build_object('ok', false, 'error', '이미 종료된 도전이에요.');
  end if;

  select * into v_gym from gyms where id = p_gym_id;
  select * into v_medal from gym_medals where gym_id = p_gym_id;

  for i in 1..3 loop
    if p_pet_types[i] is null or p_pet_types[i] <> v_gym.type then
      update gym_challenges
         set status = 'abandoned', ended_at = now(), result = 'wrong_type'
       where id = p_challenge_id;
      return json_build_object('ok', false,
        'error', format('이 체육관은 %s 속성 펫만 도전 가능합니다.', v_gym.type),
        'gym_type', v_gym.type);
    end if;
  end loop;

  select coalesce(main_card_ids, '{}'::uuid[]) into v_main_ids
    from users where id = p_user_id;
  if v_main_ids is null then v_main_ids := '{}'::uuid[]; end if;

  if (select count(distinct id) from unnest(p_pet_grading_ids) as id) <> 3 then
    return json_build_object('ok', false, 'error', '펫 3마리는 서로 달라야 해요.');
  end if;
  for v_pet_id in select unnest(p_pet_grading_ids) loop
    if not exists (
      select 1 from psa_gradings g
       where g.id = v_pet_id and g.user_id = p_user_id
         and g.grade = 10 and g.id = any(v_main_ids)
    ) then
      return json_build_object('ok', false,
        'error', '본인 펫(PCL10·등록 슬랩) 만 출전할 수 있어요.');
    end if;
  end loop;

  v_center_power := gym_compute_user_center_power(p_user_id);
  if v_center_power < coalesce(v_gym.min_power, 0) then
    update gym_challenges
       set status = 'abandoned', ended_at = now(), result = 'underpowered'
     where id = p_challenge_id;
    return json_build_object('ok', false,
      'error', '도전 최소 전투력에 못 미쳐요.',
      'min_power', v_gym.min_power, 'center_power', v_center_power);
  end if;

  -- 공격 펫 — is_defender=false (기본).
  for i in 1..3 loop
    select * into v_pet
      from gym_pet_battle_stats(
        p_pet_grading_ids[i], i, v_center_power, v_gym.type, p_pet_types[i], false);
    v_pet_states := v_pet_states || jsonb_build_object(
      'slot', i, 'grading_id', p_pet_grading_ids[i],
      'card_id', v_pet.card_id, 'name', v_pet.name, 'type', v_pet.type,
      'rarity', v_pet.rarity, 'grade', v_pet.grade,
      'hp_max', v_pet.hp, 'hp', v_pet.hp, 'atk', v_pet.atk);
  end loop;

  select * into v_owner_record from gym_ownerships where gym_id = p_gym_id;
  if v_owner_record.gym_id is not null
     and v_owner_record.defense_pet_ids is not null
     and coalesce(array_length(v_owner_record.defense_pet_ids, 1), 0) = 3
  then
    v_def_center_power := gym_compute_user_center_power(v_owner_record.owner_user_id);
    -- 방어 펫 — is_defender=true (강화 버프 + MUR 2x).
    for i in 1..3 loop
      select * into v_def_pet
        from gym_pet_battle_stats(
          v_owner_record.defense_pet_ids[i], i, v_def_center_power,
          v_gym.type, v_owner_record.defense_pet_types[i], true);
      v_enemy_states := v_enemy_states || jsonb_build_object(
        'slot', i, 'card_id', v_def_pet.card_id, 'name', v_def_pet.name,
        'type', v_def_pet.type, 'rarity', v_def_pet.rarity, 'grade', v_def_pet.grade,
        'hp_max', v_def_pet.hp, 'hp', v_def_pet.hp, 'atk', v_def_pet.atk,
        'is_defender', true);
    end loop;
  else
    for v_enemy_record in
      select gp.slot, gp.name, gp.type, gp.dex, gp.hp, gp.atk, gp.def, gp.spd
        from gym_pokemon gp where gp.gym_id = p_gym_id order by gp.slot
    loop
      declare v_e_atk int := v_enemy_record.atk;
      begin
        if v_enemy_record.type = v_gym.type then
          v_e_atk := round(v_e_atk * 1.10)::int;
        end if;
        v_enemy_states := v_enemy_states || jsonb_build_object(
          'slot', v_enemy_record.slot, 'name', v_enemy_record.name,
          'type', v_enemy_record.type, 'dex', v_enemy_record.dex,
          'hp_max', v_enemy_record.hp, 'hp', v_enemy_record.hp,
          'atk', v_e_atk, 'is_defender', false);
      end;
    end loop;
  end if;

  while v_pet_idx <= 3 and v_enemy_idx <= 3 and v_turn < v_max_turns loop
    v_turn := v_turn + 1;
    declare
      v_pet_atk int := (v_pet_states -> (v_pet_idx - 1) ->> 'atk')::int;
      v_pet_type text := v_pet_states -> (v_pet_idx - 1) ->> 'type';
      v_e_atk int := (v_enemy_states -> (v_enemy_idx - 1) ->> 'atk')::int;
      v_e_type text := v_enemy_states -> (v_enemy_idx - 1) ->> 'type';
      v_pet_hp int := (v_pet_states -> (v_pet_idx - 1) ->> 'hp')::int;
      v_e_hp int := (v_enemy_states -> (v_enemy_idx - 1) ->> 'hp')::int;
    begin
      v_eff := gym_type_effectiveness(v_pet_type, v_e_type);
      v_jitter := 0.9 + (random() * 0.2);
      v_dmg := round(v_pet_atk * v_eff * v_jitter)::int;
      v_crit := random() < 0.05;
      if v_crit then v_dmg := round(v_dmg * 1.5)::int; end if;
      v_dmg := greatest(case when v_eff = 0 then 0 else 1 end, v_dmg);
      v_e_hp := greatest(0, v_e_hp - v_dmg);
      v_enemy_states := jsonb_set(v_enemy_states,
        array[(v_enemy_idx - 1)::text, 'hp'], to_jsonb(v_e_hp));
      v_turn_log := v_turn_log || jsonb_build_object(
        'turn', v_turn, 'side', 'pet', 'attacker_slot', v_pet_idx,
        'defender_slot', v_enemy_idx, 'damage', v_dmg, 'eff', v_eff,
        'crit', v_crit, 'enemy_hp_left', v_e_hp, 'pet_hp_left', v_pet_hp);
      if v_e_hp <= 0 then v_enemy_idx := v_enemy_idx + 1; continue; end if;

      v_eff := gym_type_effectiveness(v_e_type, v_pet_type);
      v_jitter := 0.9 + (random() * 0.2);
      v_dmg := round(v_e_atk * v_eff * v_jitter)::int;
      v_crit := random() < 0.05;
      if v_crit then v_dmg := round(v_dmg * 1.5)::int; end if;
      v_dmg := greatest(case when v_eff = 0 then 0 else 1 end, v_dmg);
      v_pet_hp := greatest(0, v_pet_hp - v_dmg);
      v_pet_states := jsonb_set(v_pet_states,
        array[(v_pet_idx - 1)::text, 'hp'], to_jsonb(v_pet_hp));
      v_turn_log := v_turn_log || jsonb_build_object(
        'turn', v_turn, 'side', 'enemy', 'attacker_slot', v_enemy_idx,
        'defender_slot', v_pet_idx, 'damage', v_dmg, 'eff', v_eff,
        'crit', v_crit, 'enemy_hp_left', v_e_hp, 'pet_hp_left', v_pet_hp);
      if v_pet_hp <= 0 then v_pet_idx := v_pet_idx + 1; continue; end if;
    end;
  end loop;

  v_pets_alive := 0; v_enemies_alive := 0;
  for i in 0..2 loop
    if (v_pet_states -> i ->> 'hp')::int > 0 then v_pets_alive := v_pets_alive + 1; end if;
    if (v_enemy_states -> i ->> 'hp')::int > 0 then v_enemies_alive := v_enemies_alive + 1; end if;
  end loop;
  v_winner := case when v_pets_alive > 0 and v_enemies_alive = 0 then 'won' else 'lost' end;

  if v_winner = 'won' then
    v_difficulty_mult := case v_gym.difficulty
      when 'EASY' then 1.0 when 'NORMAL' then 1.6
      when 'HARD' then 2.4 when 'BOSS' then 4.0 else 1.0 end;
    v_capture_reward := round(150000 * v_difficulty_mult)::int;
    if v_medal.id is not null then
      insert into user_gym_medals (user_id, gym_id, medal_id, used_pets)
        values (p_user_id, p_gym_id, v_medal.id,
          jsonb_build_object('pets', v_pet_states))
        on conflict (user_id, gym_id) do nothing;
    end if;
    v_protection_until := now() + interval '3 hours';

    if v_owner_record.owner_user_id is not null
       and v_owner_record.defense_pet_ids is not null
       and coalesce(array_length(v_owner_record.defense_pet_ids, 1), 0) > 0
    then
      with del as (
        delete from psa_gradings
         where id = any(v_owner_record.defense_pet_ids)
        returning id
      )
      select count(*)::int into v_destroyed_count from del;
      update users
         set main_card_ids = array(
               select id from unnest(coalesce(main_card_ids, '{}'::uuid[])) as id
                where not (id = any(v_owner_record.defense_pet_ids)))
       where id = v_owner_record.owner_user_id;
      update users
         set pet_score = compute_user_pet_score(v_owner_record.owner_user_id)
       where id = v_owner_record.owner_user_id;
    end if;

    insert into gym_ownerships (
      gym_id, owner_user_id, captured_at, protection_until,
      defense_pet_ids, defense_pet_types
    ) values (p_gym_id, p_user_id, now(), v_protection_until, null, null)
    on conflict (gym_id) do update
      set owner_user_id = excluded.owner_user_id,
          captured_at = excluded.captured_at,
          protection_until = excluded.protection_until,
          defense_pet_ids = null, defense_pet_types = null;

    update users set points = points + v_capture_reward
      where id = p_user_id returning points into v_user_points;
    update users set pet_score = compute_user_pet_score(p_user_id)
      where id = p_user_id;
    insert into gym_rewards (user_id, gym_id, reward_type, amount)
      values (p_user_id, p_gym_id, 'capture', v_capture_reward);
    update gym_challenges set status = 'won', ended_at = now(), result = 'won'
      where id = p_challenge_id;
  else
    insert into gym_cooldowns (user_id, gym_id, cooldown_until)
      values (p_user_id, p_gym_id, now() + interval '8 minutes')
      on conflict (user_id, gym_id) do update set cooldown_until = excluded.cooldown_until;
    update gym_challenges set status = 'lost', ended_at = now(), result = 'lost'
      where id = p_challenge_id;
    select points into v_user_points from users where id = p_user_id;
  end if;

  insert into gym_battle_logs (
    challenge_id, gym_id, challenger_user_id, defender_user_id,
    result, used_pets, turn_log, started_at
  ) values (
    p_challenge_id, p_gym_id, p_user_id,
    case when v_owner_record.owner_user_id is not null
         then v_owner_record.owner_user_id else null end,
    v_winner,
    jsonb_build_object('pets', v_pet_states, 'enemies', v_enemy_states,
      'destroyed_defense_count', v_destroyed_count),
    v_turn_log, v_challenge.started_at);

  return json_build_object(
    'ok', true, 'result', v_winner,
    'pets', v_pet_states, 'enemies', v_enemy_states, 'turn_log', v_turn_log,
    'capture_reward', case when v_winner = 'won' then v_capture_reward else 0 end,
    'medal_id', case when v_winner = 'won' then v_medal.id else null end,
    'protection_until', case when v_winner = 'won' then v_protection_until else null end,
    'cooldown_until', case when v_winner = 'lost' then now() + interval '8 minutes' else null end,
    'points', v_user_points,
    'center_power', v_center_power,
    'destroyed_defense_count', v_destroyed_count);
end;
$$;

grant execute on function resolve_gym_battle(uuid, text, uuid, uuid[], text[]) to anon, authenticated;

notify pgrst, 'reload schema';
