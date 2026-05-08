-- ============================================================
-- 체육관/펫 dedup 정책 완화 — 같은 card_id, 같은 slab 중복 허용.
--
-- 사용자 요구:
--   "같은 카드라도 풀 unique<3 으로 막혀서 도전이 안 돼.
--    중복되게 해줘. 펫 등록도 같은 카드 등록 가능하게."
--
-- 직전 정책 (20260709 / 20260731 / 20260708):
--   • 도전/방어덱: distinct card_id 검증 — 같은 카드 종류 1번만.
--   • 펫 등록: 한 슬롯 안 distinct grading_id + 다른 type slot 에 있는
--     슬랩 거부 (cross-slot dedup).
--
-- 본 마이그레이션:
--   • resolve_gym_battle / set_gym_defense_deck — distinct card_id 검사
--     제거. 같은 card_id 슬랩 3장으로 덱 구성 가능 (단, 서로 다른 PHYSICAL
--     슬랩이어야 distinct grading_id 는 유지).
--   • set_pet_for_type — within-slot distinct grading_id + cross-slot 검사
--     모두 제거. 같은 슬랩이 여러 슬롯/타입에 동시 등록 가능. compute_
--     user_pet_score 의 UNION + flatten distinct 로직이 자동 dedup 하므로
--     pet_score 영향 없음 (한 슬랩은 점수에 1번만 합산).
--
--   유지: 본인 소유 / PCL10 / 속성 / 전시 / 방어덱 / MUR/UR or 등록 검증.
-- ============================================================

-- ── 1) resolve_gym_battle (20260733 본문 기반) ──
-- distinct card_id 검사 블록만 제거.
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
  v_by_type_data jsonb;
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

  -- distinct grading_id 만 유지 (서로 다른 PHYSICAL slab 이어야 한 슬롯에
  -- 한 인스턴스만 들어감). distinct card_id 검사는 제거 — 같은 card_id
  -- 슬랩 3장으로 덱 구성 가능.
  if (select count(distinct id) from unnest(p_pet_grading_ids) as id) <> 3 then
    return json_build_object('ok', false, 'error', '펫 3마리는 서로 다른 슬랩이어야 해요.');
  end if;

  select coalesce(main_card_ids, '{}'::uuid[]),
         coalesce(main_cards_by_type, '{}'::jsonb)
    into v_main_ids, v_by_type_data
    from users where id = p_user_id;
  if v_main_ids is null then v_main_ids := '{}'::uuid[]; end if;
  v_main_ids := v_main_ids || coalesce(
    flatten_pet_ids_by_type(v_by_type_data),
    '{}'::uuid[]
  );

  for v_pet_id in select unnest(p_pet_grading_ids) loop
    if not exists (
      select 1 from psa_gradings g
       where g.id = v_pet_id and g.user_id = p_user_id and g.grade = 10
         and (g.rarity in ('MUR', 'UR') or g.id = any(v_main_ids))
    ) then
      update gym_challenges
         set status = 'abandoned', ended_at = now(), result = 'pet_invalid'
       where id = p_challenge_id;
      return json_build_object('ok', false,
        'error', 'MUR/UR 외 희귀도는 펫에 등록된 PCL10 슬랩만 출전할 수 있어요.');
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

-- ── 2) set_gym_defense_deck (20260733 본문 기반) ──
-- distinct card_id 검사 블록 제거.
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
  v_main_ids uuid[];
  v_by_type_data jsonb;
  v_pet_id uuid;
  v_gym record;
  v_old_def uuid[];
  v_returned uuid[];
  v_new_main uuid[];
  v_slot_left int;
  v_normalized_types text[];
  v_card_id text;
begin
  if p_user_id is null or p_gym_id is null then
    return json_build_object('ok', false, 'error', '요청이 올바르지 않아요.');
  end if;
  if p_pet_grading_ids is null
     or coalesce(array_length(p_pet_grading_ids, 1), 0) <> 3 then
    return json_build_object('ok', false, 'error', '펫 3마리를 선택해주세요.');
  end if;
  if (select count(distinct id) from unnest(p_pet_grading_ids) as id) <> 3 then
    return json_build_object('ok', false, 'error', '펫 3마리는 서로 다른 슬랩이어야 해요.');
  end if;

  -- distinct card_id 검사 제거 — 같은 card_id 슬랩 3장으로 방어덱 가능.

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

  select coalesce(main_card_ids, '{}'::uuid[]),
         coalesce(main_cards_by_type, '{}'::jsonb)
    into v_main_ids, v_by_type_data
    from users where id = p_user_id for update;
  v_main_ids := v_main_ids || coalesce(
    flatten_pet_ids_by_type(v_by_type_data),
    '{}'::uuid[]
  );
  v_main_ids := v_main_ids || coalesce(v_owner.defense_pet_ids, '{}'::uuid[]);

  for v_pet_id in select unnest(p_pet_grading_ids) loop
    if not exists (
      select 1 from psa_gradings g
       where g.id = v_pet_id and g.user_id = p_user_id and g.grade = 10
    ) then
      return json_build_object('ok', false,
        'error', '본인 소유 PCL10 슬랩만 등록 가능합니다.');
    end if;
    if not exists (
      select 1 from psa_gradings g
       where g.id = v_pet_id
         and (g.rarity in ('MUR', 'UR') or g.id = any(v_main_ids))
    ) then
      return json_build_object('ok', false,
        'error', 'MUR/UR 외 희귀도는 펫에 등록된 슬랩만 방어덱에 넣을 수 있어요.');
    end if;
  end loop;

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

-- ── 3) set_pet_for_type (20260708 본문 기반) ──
-- within-slot distinct grading_id + cross-slot grading_id 검사 모두 제거.
-- compute_user_pet_score 의 UNION + flatten distinct 가 자동 dedup 하므로
-- 같은 슬랩이 여러 슬롯/타입에 등록돼도 점수에 1번만 합산됨.
create or replace function set_pet_for_type(
  p_user_id uuid,
  p_type text,
  p_grading_ids uuid[]
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ids uuid[];
  v_distinct_ids uuid[];
  v_data jsonb;
  v_valid_count int;
  v_displayed int;
  v_def int;
  v_score int;
  v_invalid_count int;
begin
  if p_user_id is null then
    return json_build_object('ok', false, 'error', '인증 필요.');
  end if;
  if p_type is null or length(p_type) = 0 then
    return json_build_object('ok', false, 'error', '속성을 지정해주세요.');
  end if;

  v_ids := coalesce(p_grading_ids, '{}'::uuid[]);
  if coalesce(array_length(v_ids, 1), 0) > 3 then
    return json_build_object('ok', false,
      'error', '한 속성에 최대 3마리까지만 등록할 수 있어요.');
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  if array_length(v_ids, 1) is not null then
    -- 검증은 distinct slab 단위로 — 같은 슬랩이 여러 슬롯/타입에 등록돼도
    -- 한 번씩만 체크.
    v_distinct_ids := array(select distinct id from unnest(v_ids) as id);

    select count(*)::int into v_valid_count
      from psa_gradings g
     where g.id = any(v_distinct_ids) and g.user_id = p_user_id and g.grade = 10;
    if v_valid_count <> coalesce(array_length(v_distinct_ids, 1), 0) then
      return json_build_object('ok', false, 'error',
        '본인의 PCL10 슬랩만 펫으로 등록할 수 있어요.');
    end if;

    select count(*)::int into v_displayed
      from showcase_cards where grading_id = any(v_distinct_ids);
    if v_displayed > 0 then
      return json_build_object('ok', false, 'error',
        '전시 중인 슬랩은 펫으로 등록할 수 없어요.');
    end if;

    select count(*)::int into v_def
      from gym_ownerships
     where owner_user_id = p_user_id and defense_pet_ids && v_distinct_ids;
    if v_def > 0 then
      return json_build_object('ok', false, 'error',
        '방어 덱에 등록된 슬랩이 포함돼 있어요. 방어 덱 해제 후 다시 시도하세요.');
    end if;

    -- type 검증 — wild_type 또는 wild_type_2 = p_type 이면 OK.
    select count(*)::int into v_invalid_count
      from psa_gradings g
      left join card_types ct on ct.card_id = g.card_id
     where g.id = any(v_distinct_ids)
       and (ct.wild_type is null
            or (ct.wild_type <> p_type
                and (ct.wild_type_2 is null or ct.wild_type_2 <> p_type)));
    if v_invalid_count > 0 then
      return json_build_object('ok', false,
        'error', format(
          '%s 속성 슬롯에는 %s 속성 포켓몬 카드만 등록할 수 있어요. ' ||
          'UR/MUR 은 1차/2차 속성 중 하나라도 일치해야 합니다.',
          p_type, p_type));
    end if;

    -- within-slot distinct grading_id 검사 제거 (같은 슬랩이 여러 슬롯에
    -- 들어가도 OK). cross-slot 검사도 제거 (다른 type 슬롯에 같은 슬랩
    -- 동시 등록 가능 — 특히 dual-type MUR 자연스럽게).
  end if;

  v_data := coalesce(
    (select main_cards_by_type from users where id = p_user_id),
    '{}'::jsonb
  );
  v_data := jsonb_set(v_data, array[p_type], to_jsonb(v_ids), true);

  update users
     set main_cards_by_type = v_data,
         main_card_ids = array(
           select id from unnest(coalesce(main_card_ids, '{}'::uuid[])) as id
            where not (id = any(v_ids))
         )
   where id = p_user_id;

  v_score := compute_user_pet_score(p_user_id);
  update users set pet_score = v_score where id = p_user_id;

  return json_build_object('ok', true,
    'main_cards_by_type', v_data,
    'pet_score', v_score);
end;
$$;

grant execute on function set_pet_for_type(uuid, text, uuid[]) to anon, authenticated;

notify pgrst, 'reload schema';

-- 마이그레이션: 20260739_gym_pet_relax_dedup.sql
