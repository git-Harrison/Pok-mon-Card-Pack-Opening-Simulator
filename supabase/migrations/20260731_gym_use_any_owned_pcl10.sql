-- ============================================================
-- 체육관 풀 정책 완화 — 펫 등록 슬랩만 → 보유 PCL10 슬랩 전부.
--
-- 사용자 요청:
--   "체육관에 등록한 펫으로만 전투/방어덱 가능했는데, 등록한 펫과 보유한
--    PCL10 등급 같은 속성 카드 모두 사용 가능하게 해. 중복은 X."
--
-- 정책 변경:
--   • 도전 (resolve_gym_battle) — 출전 슬랩이 main_card_ids ∪
--     main_cards_by_type 에 있어야 했던 검사를 제거. 본인 소유 PCL10
--     + 체육관 속성 일치 (card_eligible_for_type) 만 통과시킴.
--   • 방어덱 (set_gym_defense_deck) — 동일. "펫 슬롯에 등록된 슬랩만
--     방어덱 가능" 검사 제거. 본인 소유 PCL10 + 속성 일치만 통과.
--   • 중복 차단은 그대로 유지 — distinct grading_id × distinct card_id
--     검증 모두 보존 (한 덱 안에서 같은 카드 종류 1번만).
--
-- 그 외 로직 (turn-order, dual-type eff, defender 처리, 보호기간, 메달,
-- 챌린지 status 갱신, capture reward, defense 슬랩 main_card_ids 정리
-- 등) 은 미변경. 20260715 + 20260709 본문에서 검증 블록만 손봤음.
-- ============================================================

-- ── 1) resolve_gym_battle ──
-- 20260715 본문 그대로 + 검증 블록 (g.id = any(v_main_ids)) 제거.
-- v_main_ids / v_by_type_data 는 더 이상 필요 없으므로 declare 에서도 삭제.
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
  v_center_power bigint;
  v_user_points bigint;
  v_pet_id uuid;
  v_pet record;
  v_owner_record record;
  v_def_center_power bigint;
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
  v_enemy_record record;
  v_enemy_count int := 0;
  v_def_valid_count int := 0;
  v_use_defenders boolean := false;
  v_current_turn text := 'pet';
  v_card_id text;
  v_normalized_pet_types text[];
begin
  if p_user_id is null or p_gym_id is null or p_challenge_id is null then
    return json_build_object('ok', false, 'error', '요청이 올바르지 않아요.');
  end if;
  if p_pet_grading_ids is null
     or coalesce(array_length(p_pet_grading_ids, 1), 0) <> 3 then
    return json_build_object('ok', false, 'error', '펫 3마리를 선택해주세요.');
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

  v_normalized_pet_types := array[]::text[];
  for i in 1..3 loop
    select g.card_id into v_card_id
      from psa_gradings g where g.id = p_pet_grading_ids[i];
    if v_card_id is null
       or not card_eligible_for_type(v_card_id, v_gym.type) then
      update gym_challenges
         set status = 'abandoned', ended_at = now(), result = 'wrong_type'
       where id = p_challenge_id;
      return json_build_object('ok', false,
        'error', format('이 체육관은 %s 속성 펫만 도전 가능합니다.', v_gym.type),
        'gym_type', v_gym.type);
    end if;
    v_normalized_pet_types := v_normalized_pet_types || v_gym.type;
  end loop;

  -- distinct grading_id 보장 (서로 다른 슬랩) + UI 측 distinct card_id
  -- dedup 과 일관 (같은 카드 종류는 1번만 출전).
  if (select count(distinct id) from unnest(p_pet_grading_ids) as id) <> 3 then
    return json_build_object('ok', false, 'error', '펫 3마리는 서로 달라야 해요.');
  end if;
  if (select count(distinct g.card_id)
        from unnest(p_pet_grading_ids) as gid
        join psa_gradings g on g.id = gid) <> 3 then
    return json_build_object('ok', false,
      'error', '같은 카드 종류는 도전 출전에 한 번만 등록할 수 있어요.');
  end if;

  -- 출전 슬랩 검증 — 본인 소유 + PCL10 만 검사. 이전엔 main_card_ids
  -- (펫 등록) 까지 강제했으나 정책 완화로 등록 여부는 무관.
  for v_pet_id in select unnest(p_pet_grading_ids) loop
    if not exists (
      select 1 from psa_gradings g
       where g.id = v_pet_id and g.user_id = p_user_id and g.grade = 10
    ) then
      update gym_challenges
         set status = 'abandoned', ended_at = now(), result = 'pet_invalid'
       where id = p_challenge_id;
      return json_build_object('ok', false,
        'error', '본인 PCL10 슬랩만 출전할 수 있어요.');
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

  for i in 1..3 loop
    select * into v_pet
      from gym_pet_battle_stats(
        p_pet_grading_ids[i], i, v_center_power, v_gym.type,
        v_normalized_pet_types[i], false);
    if not found or v_pet.hp is null or v_pet.atk is null then
      update gym_challenges
         set status = 'abandoned', ended_at = now(), result = 'pet_stat_load_failed'
       where id = p_challenge_id;
      return json_build_object('ok', false,
        'error', format('펫 %s번 슬롯의 능력치를 불러오지 못했어요.', i));
    end if;
    v_pet_states := v_pet_states || jsonb_build_object(
      'slot', i, 'grading_id', p_pet_grading_ids[i],
      'card_id', v_pet.card_id, 'name', v_pet.name, 'type', v_pet.type,
      'rarity', v_pet.rarity, 'grade', v_pet.grade,
      'hp_max', v_pet.hp, 'hp', v_pet.hp, 'atk', v_pet.atk);
  end loop;

  select * into v_owner_record from gym_ownerships where gym_id = p_gym_id;
  if v_owner_record.owner_user_id is not null
     and v_owner_record.defense_pet_ids is not null
     and coalesce(array_length(v_owner_record.defense_pet_ids, 1), 0) = 3
  then
    select count(*)::int into v_def_valid_count
      from psa_gradings gd
     where gd.id = any(v_owner_record.defense_pet_ids)
       and gd.user_id = v_owner_record.owner_user_id
       and gd.grade = 10;
    if v_def_valid_count = 3 then
      v_use_defenders := true;
    else
      update gym_challenges
         set status = 'abandoned', ended_at = now(),
             result = 'defender_deck_stale'
       where id = p_challenge_id;
      return json_build_object('ok', false,
        'error',
        '점령자 방어 덱 데이터에 손상이 있어 도전을 진행할 수 없어요 ('
        || v_def_valid_count || '/3 valid). 점령자가 방어 덱을 다시 셋업해야 도전 가능합니다.',
        'reason', 'defender_deck_stale',
        'valid_count', v_def_valid_count);
    end if;
  elsif v_owner_record.owner_user_id is not null then
    null;
  end if;

  if v_use_defenders then
    v_def_center_power := gym_compute_user_center_power(v_owner_record.owner_user_id);
    for i in 1..3 loop
      select * into v_def_pet
        from gym_pet_battle_stats(
          v_owner_record.defense_pet_ids[i], i, v_def_center_power,
          v_gym.type, v_owner_record.defense_pet_types[i], true);
      if not found or v_def_pet.hp is null or v_def_pet.atk is null then
        update gym_challenges
           set status = 'abandoned', ended_at = now(),
               result = 'defender_stat_load_failed'
         where id = p_challenge_id;
        return json_build_object('ok', false,
          'error', format('상대 방어덱 %s번 슬롯의 능력치를 불러오지 못했어요.', i),
          'reason', 'defender_stat_load_failed');
      end if;
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

  v_enemy_count := jsonb_array_length(v_enemy_states);
  if v_enemy_count <> 3 then
    update gym_challenges
       set status = 'abandoned', ended_at = now(), result = 'enemy_count_mismatch'
     where id = p_challenge_id;
    return json_build_object('ok', false,
      'error', format('상대 펫 데이터가 비정상이에요 (%s/3).', v_enemy_count),
      'reason', 'enemy_count_mismatch');
  end if;

  while v_pet_idx <= 3 and v_enemy_idx <= 3 and v_turn < v_max_turns loop
    v_turn := v_turn + 1;

    if v_current_turn = 'pet' then
      declare
        v_pet_atk int := (v_pet_states -> (v_pet_idx - 1) ->> 'atk')::int;
        v_pet_type text := v_pet_states -> (v_pet_idx - 1) ->> 'type';
        v_pet_card text := v_pet_states -> (v_pet_idx - 1) ->> 'card_id';
        v_e_type text := v_enemy_states -> (v_enemy_idx - 1) ->> 'type';
        v_e_card text := v_enemy_states -> (v_enemy_idx - 1) ->> 'card_id';
        v_pet_hp int := (v_pet_states -> (v_pet_idx - 1) ->> 'hp')::int;
        v_e_hp int := (v_enemy_states -> (v_enemy_idx - 1) ->> 'hp')::int;
      begin
        v_eff := gym_eff_dual(v_pet_card, v_pet_type, v_e_card, v_e_type);
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
        if v_e_hp <= 0 then
          v_enemy_idx := v_enemy_idx + 1;
        end if;
      end;
      v_current_turn := 'enemy';
    else
      declare
        v_pet_type text := v_pet_states -> (v_pet_idx - 1) ->> 'type';
        v_pet_card text := v_pet_states -> (v_pet_idx - 1) ->> 'card_id';
        v_e_atk int := (v_enemy_states -> (v_enemy_idx - 1) ->> 'atk')::int;
        v_e_type text := v_enemy_states -> (v_enemy_idx - 1) ->> 'type';
        v_e_card text := v_enemy_states -> (v_enemy_idx - 1) ->> 'card_id';
        v_pet_hp int := (v_pet_states -> (v_pet_idx - 1) ->> 'hp')::int;
        v_e_hp int := (v_enemy_states -> (v_enemy_idx - 1) ->> 'hp')::int;
      begin
        v_eff := gym_eff_dual(v_e_card, v_e_type, v_pet_card, v_pet_type);
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
        if v_pet_hp <= 0 then
          v_pet_idx := v_pet_idx + 1;
        end if;
      end;
      v_current_turn := 'pet';
    end if;
  end loop;

  v_pets_alive := 0; v_enemies_alive := 0;
  for i in 0..2 loop
    if coalesce((v_pet_states -> i ->> 'hp')::int, 0) > 0 then
      v_pets_alive := v_pets_alive + 1;
    end if;
    if coalesce((v_enemy_states -> i ->> 'hp')::int, 0) > 0 then
      v_enemies_alive := v_enemies_alive + 1;
    end if;
  end loop;
  v_winner := case when v_pets_alive > 0 and v_enemies_alive = 0 then 'won' else 'lost' end;

  if v_winner = 'won' then
    v_difficulty_mult := case v_gym.difficulty
      when 'EASY' then 1.0 when 'NORMAL' then 1.6
      when 'HARD' then 2.4 when 'BOSS' then 4.0 else 1.0 end;
    v_capture_reward := round(15000 * v_difficulty_mult)::int;
    if v_medal.id is not null then
      insert into user_gym_medals (user_id, gym_id, medal_id, used_pets)
        values (p_user_id, p_gym_id, v_medal.id,
          jsonb_build_object('pets', v_pet_states))
        on conflict (user_id, gym_id) do nothing;
    end if;
    v_protection_until := now() + gym_protection_interval();

    if v_use_defenders
       and v_owner_record.owner_user_id is not null
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
    case when v_use_defenders and v_owner_record.owner_user_id is not null
         then v_owner_record.owner_user_id else null end,
    v_winner,
    jsonb_build_object('pets', v_pet_states, 'enemies', v_enemy_states,
      'destroyed_defense_count', v_destroyed_count,
      'used_defenders', v_use_defenders),
    v_turn_log, v_challenge.started_at);

  return json_build_object(
    'ok', true, 'result', v_winner,
    'pets', v_pet_states, 'enemies', v_enemy_states, 'turn_log', v_turn_log,
    'capture_reward', case when v_winner = 'won' then v_capture_reward else 0 end,
    'medal_id', case when v_winner = 'won' then v_medal.id else null end,
    'protection_until', case when v_winner = 'won' then v_protection_until else null end,
    'destroyed_defense_count', v_destroyed_count,
    'used_defenders', v_use_defenders,
    'points', v_user_points);
end;
$$;

grant execute on function resolve_gym_battle(uuid, text, uuid, uuid[], text[]) to anon, authenticated;

-- ── 2) set_gym_defense_deck ──
-- 20260709 본문 그대로 + "펫 슬롯 등록 여부" 검사 제거. distinct
-- grading_id × distinct card_id 검증은 그대로 유지.
create or replace function set_gym_defense_deck(
  p_user_id uuid,
  p_gym_id text,
  p_pet_grading_ids uuid[],
  p_pet_types text[]
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_owner record;
  v_pet_id uuid;
  v_gym record;
  v_old_def uuid[];
  v_returned uuid[];
  v_new_main uuid[];
  v_slot_left int;
  v_normalized_types text[];
  v_card_id text;
  v_distinct_card_count int;
begin
  if p_user_id is null or p_gym_id is null then
    return json_build_object('ok', false, 'error', '요청이 올바르지 않아요.');
  end if;
  if p_pet_grading_ids is null
     or coalesce(array_length(p_pet_grading_ids, 1), 0) <> 3 then
    return json_build_object('ok', false, 'error', '펫 3마리를 선택해주세요.');
  end if;
  if (select count(distinct id) from unnest(p_pet_grading_ids) as id) <> 3 then
    return json_build_object('ok', false, 'error', '펫 3마리는 서로 달라야 해요.');
  end if;

  -- distinct card_id 검증 (UI dedup 과 일관) — 같은 카드 종류는 한 덱
  -- 안에서 1번만.
  select count(distinct g.card_id)::int into v_distinct_card_count
    from unnest(p_pet_grading_ids) as gid
    join psa_gradings g on g.id = gid;
  if v_distinct_card_count <> 3 then
    return json_build_object('ok', false,
      'error', '같은 카드 종류는 방어덱에 한 번만 등록할 수 있어요.');
  end if;

  perform pg_advisory_xact_lock(hashtext('gym:' || p_gym_id));

  select * into v_owner from gym_ownerships
    where gym_id = p_gym_id for update;
  if not found then
    return json_build_object('ok', false, 'error', '비점령 체육관입니다.');
  end if;
  if v_owner.owner_user_id <> p_user_id then
    return json_build_object('ok', false, 'error', '체육관 소유자만 방어 덱을 설정할 수 있어요.');
  end if;

  select * into v_gym from gyms where id = p_gym_id;

  v_normalized_types := array[]::text[];
  for i in 1..3 loop
    select g.card_id into v_card_id
      from psa_gradings g where g.id = p_pet_grading_ids[i];
    if v_card_id is null
       or not card_eligible_for_type(v_card_id, v_gym.type) then
      return json_build_object('ok', false,
        'error', format('이 체육관은 %s 속성 펫만 방어 덱에 등록 가능합니다.', v_gym.type),
        'gym_type', v_gym.type);
    end if;
    v_normalized_types := v_normalized_types || v_gym.type;
  end loop;

  -- 슬랩 검증 — 본인 소유 + PCL10 만 검사. 이전엔 main_card_ids ∪
  -- by_type ∪ 기존 defense_pet_ids 에 있어야 했지만 정책 완화로 등록
  -- 여부 무관 (보유 PCL10 이면 누구나 방어덱 가능).
  for v_pet_id in select unnest(p_pet_grading_ids) loop
    if not exists (
      select 1 from psa_gradings g
       where g.id = v_pet_id and g.user_id = p_user_id and g.grade = 10
    ) then
      return json_build_object('ok', false,
        'error', '본인 소유 PCL10 슬랩만 등록 가능합니다.');
    end if;
  end loop;

  -- 기존 방어덱에서 빠지는 슬랩은 main_card_ids 슬롯 여유분만큼 복귀.
  -- 새 방어덱에 들어간 슬랩은 main_card_ids/main_cards_by_type 에서
  -- 제거 — pet_score 중복 방지. (등록 안 된 슬랩이라면 no-op.)
  v_old_def := coalesce(v_owner.defense_pet_ids, '{}'::uuid[]);
  v_returned := array(
    select id from unnest(v_old_def) as id
     where not (id = any(p_pet_grading_ids))
  );

  v_new_main := array(
    select id from unnest(coalesce(
      (select main_card_ids from users where id = p_user_id),
      '{}'::uuid[]
    )) as id
     where not (id = any(p_pet_grading_ids))
  );
  v_slot_left := greatest(0, 10 - coalesce(array_length(v_new_main, 1), 0));
  if v_slot_left > 0 and coalesce(array_length(v_returned, 1), 0) > 0 then
    v_new_main := v_new_main || v_returned[1:v_slot_left];
  end if;

  update users set main_card_ids = v_new_main where id = p_user_id;
  update users
     set main_cards_by_type = (
       select coalesce(jsonb_object_agg(k.key, t.cleaned), '{}'::jsonb)
         from jsonb_each(coalesce(main_cards_by_type, '{}'::jsonb)) k(key, value)
         cross join lateral (
           select coalesce(
             jsonb_agg(eid.value)
               filter (where (eid.value)::uuid <> all(p_pet_grading_ids)),
             '[]'::jsonb) as cleaned
             from jsonb_array_elements_text(k.value) eid
         ) t
     )
   where id = p_user_id;

  update gym_ownerships
     set defense_pet_ids = p_pet_grading_ids,
         defense_pet_types = v_normalized_types
   where gym_id = p_gym_id;

  return json_build_object(
    'ok', true,
    'gym_id', p_gym_id,
    'defense_pet_ids', to_jsonb(p_pet_grading_ids)
  );
end;
$$;

grant execute on function set_gym_defense_deck(uuid, text, uuid[], text[])
  to anon, authenticated;

notify pgrst, 'reload schema';

-- 마이그레이션: 20260731_gym_use_any_owned_pcl10.sql
