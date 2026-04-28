-- ============================================================
-- 체육관 대결 — 펫 속성별 구조 인식 + 점령된 체육관 NPC fallback 차단.
--
-- 사용자 신규 보고:
--   1) 점령된 체육관에서 대결 진입 시 점령자 방어덱이 아니라 default
--      관장 NPC 가 표시. spec: 점령 시 반드시 방어덱이거나 명시적 오류.
--   2) 같은 속성 펫 3개 등록했는데도 "해당 속성 카드 없음" 표시.
--      원인: spec 2-1 펫 구조 변경 (main_card_ids → main_cards_by_type)
--      이후 resolve_gym_battle 의 "등록 펫만 출전" 검증이 legacy
--      main_card_ids 만 읽음 → by_type 에 등록한 펫이 거부됨.
--
-- 조치:
--   1) resolve_gym_battle 의 v_main_ids 로딩을 main_card_ids ∪
--      main_cards_by_type (flatten) 으로 union. 두 구조 모두 valid.
--   2) 점령된 체육관(v_owner_record.owner_user_id is not null) 에서
--      defense_pet_ids 가 null/빈/3 미만 인 경우 NPC fallback 대신
--      challenge 를 abandoned 로 마무리하고 명시적 오류 반환.
-- ============================================================

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
  v_center_power int;
  v_user_points int;
  v_pet_id uuid;
  v_pet record;
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
  v_enemy_record record;
  v_enemy_count int := 0;
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

  -- 펫 등록 풀: legacy main_card_ids ∪ 신구조 main_cards_by_type 평탄화.
  -- spec 2-1 마이그레이션 이후 사용자가 신구조로 등록한 펫도 인식되도록.
  select coalesce(main_card_ids, '{}'::uuid[]),
         coalesce(main_cards_by_type, '{}'::jsonb)
    into v_main_ids, v_by_type_data
    from users where id = p_user_id;
  if v_main_ids is null then v_main_ids := '{}'::uuid[]; end if;

  -- main_cards_by_type 의 모든 ID 도 합침.
  v_main_ids := v_main_ids || coalesce(
    flatten_pet_ids_by_type(v_by_type_data),
    '{}'::uuid[]
  );

  if (select count(distinct id) from unnest(p_pet_grading_ids) as id) <> 3 then
    return json_build_object('ok', false, 'error', '펫 3마리는 서로 달라야 해요.');
  end if;
  for v_pet_id in select unnest(p_pet_grading_ids) loop
    if not exists (
      select 1 from psa_gradings g
       where g.id = v_pet_id and g.user_id = p_user_id
         and g.grade = 10 and g.id = any(v_main_ids)
    ) then
      update gym_challenges
         set status = 'abandoned', ended_at = now(), result = 'pet_invalid'
       where id = p_challenge_id;
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

  -- 공격 펫 빌드 + stat 검증 가드.
  for i in 1..3 loop
    select * into v_pet
      from gym_pet_battle_stats(
        p_pet_grading_ids[i], i, v_center_power, v_gym.type, p_pet_types[i], false);
    if not found or v_pet.hp is null or v_pet.atk is null then
      update gym_challenges
         set status = 'abandoned', ended_at = now(), result = 'pet_stat_load_failed'
       where id = p_challenge_id;
      return json_build_object('ok', false,
        'error', format('펫 %s번 슬롯의 능력치를 불러오지 못했어요. 잠시 후 다시 시도해주세요.', i));
    end if;
    v_pet_states := v_pet_states || jsonb_build_object(
      'slot', i, 'grading_id', p_pet_grading_ids[i],
      'card_id', v_pet.card_id, 'name', v_pet.name, 'type', v_pet.type,
      'rarity', v_pet.rarity, 'grade', v_pet.grade,
      'hp_max', v_pet.hp, 'hp', v_pet.hp, 'atk', v_pet.atk);
  end loop;

  -- 적 빌드 — 점령 상태에 따라 분기.
  select * into v_owner_record from gym_ownerships where gym_id = p_gym_id;
  if v_owner_record.owner_user_id is not null then
    -- 점령된 체육관: 반드시 방어 덱 사용. 미설정/오류면 NPC fallback X.
    if v_owner_record.defense_pet_ids is null
       or coalesce(array_length(v_owner_record.defense_pet_ids, 1), 0) <> 3
    then
      update gym_challenges
         set status = 'abandoned', ended_at = now(),
             result = 'defender_deck_not_set'
       where id = p_challenge_id;
      return json_build_object('ok', false,
        'error',
        '점령자가 방어 덱을 아직 설정하지 않았어요. 잠시 후 다시 시도하거나 점령자가 방어 덱을 셋업한 뒤 도전 가능합니다.',
        'reason', 'defender_deck_not_set');
    end if;

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
          'error', format(
            '상대 방어덱 %s번 슬롯의 능력치를 불러오지 못했어요. ' ||
            '체육관 데이터 정합성 이슈일 수 있으니 운영자에게 문의해주세요.',
            i),
          'reason', 'defender_stat_load_failed');
      end if;
      v_enemy_states := v_enemy_states || jsonb_build_object(
        'slot', i, 'card_id', v_def_pet.card_id, 'name', v_def_pet.name,
        'type', v_def_pet.type, 'rarity', v_def_pet.rarity, 'grade', v_def_pet.grade,
        'hp_max', v_def_pet.hp, 'hp', v_def_pet.hp, 'atk', v_def_pet.atk,
        'is_defender', true);
    end loop;
  else
    -- 미점령 체육관: NPC 기본 관장 포켓몬 사용.
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
      'error', format('상대 펫 데이터가 비정상이에요 (%s/3). 운영자에게 문의해주세요.',
                      v_enemy_count),
      'reason', 'enemy_count_mismatch');
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
    'destroyed_defense_count', v_destroyed_count,
    'points', v_user_points);
end;
$$;

grant execute on function resolve_gym_battle(uuid, text, uuid, uuid[], text[]) to anon, authenticated;

-- set_gym_defense_deck 도 main_card_ids ∪ main_cards_by_type 인식.
-- 기존 검증 "펫 슬롯에 등록된 슬랩이어야" 가 by_type 에 등록한 펫
-- 거부하던 회귀 fix.
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
  v_score int;
begin
  if p_user_id is null or p_gym_id is null then
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
  if (select count(distinct id) from unnest(p_pet_grading_ids) as id) <> 3 then
    return json_build_object('ok', false, 'error', '펫 3마리는 서로 달라야 해요.');
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
  for i in 1..3 loop
    if p_pet_types[i] is null or p_pet_types[i] <> v_gym.type then
      return json_build_object('ok', false,
        'error', format('이 체육관은 %s 속성 펫만 방어 덱에 등록 가능합니다.', v_gym.type),
        'gym_type', v_gym.type);
    end if;
  end loop;

  -- 펫 풀 — main_card_ids ∪ main_cards_by_type 평탄화.
  select coalesce(main_card_ids, '{}'::uuid[]),
         coalesce(main_cards_by_type, '{}'::jsonb)
    into v_main_ids, v_by_type_data
    from users where id = p_user_id for update;
  v_main_ids := v_main_ids || coalesce(
    flatten_pet_ids_by_type(v_by_type_data),
    '{}'::uuid[]
  );

  -- 새 defense 펫은 본인 PCL10 소유여야 + (main_card_ids ∪ by_type 에
  -- 있거나 기존 defense 에 있어야).
  for v_pet_id in select unnest(p_pet_grading_ids) loop
    if not exists (
      select 1 from psa_gradings g
       where g.id = v_pet_id and g.user_id = p_user_id and g.grade = 10
    ) then
      return json_build_object('ok', false,
        'error', '본인 소유 PCL10 슬랩만 등록 가능합니다.');
    end if;
    if not (
      v_pet_id = any(v_main_ids)
      or v_pet_id = any(coalesce(v_owner.defense_pet_ids, '{}'::uuid[]))
    ) then
      return json_build_object('ok', false,
        'error', '펫 슬롯에 등록되지 않은 슬랩이에요. 먼저 펫 등록 후 방어 덱에 넣을 수 있어요.');
    end if;
  end loop;

  v_old_def := coalesce(v_owner.defense_pet_ids, '{}'::uuid[]);
  -- 새 defense 에 없는 옛 defense 펫 → main 으로 복귀 후보 (legacy).
  v_returned := array(
    select id from unnest(v_old_def) as id
     where not (id = any(p_pet_grading_ids))
  );

  -- legacy main = (legacy main - 새 defense)
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
  -- main_cards_by_type 에서도 새 defense 슬랩 제거.
  update users
     set main_cards_by_type = (
       select coalesce(jsonb_object_agg(k.key, t.cleaned), '{}'::jsonb)
         from jsonb_each(coalesce(main_cards_by_type, '{}'::jsonb)) k(key, val),
              lateral (
                select coalesce(jsonb_agg(e.value), '[]'::jsonb) as cleaned
                  from jsonb_array_elements_text(k.val) e(value)
                 where (e.value)::uuid <> all(p_pet_grading_ids)
              ) t
     )
   where id = p_user_id;

  update gym_ownerships
     set defense_pet_ids = p_pet_grading_ids,
         defense_pet_types = p_pet_types
   where gym_id = p_gym_id;

  v_score := compute_user_pet_score(p_user_id);
  update users set pet_score = v_score where id = p_user_id;

  return json_build_object(
    'ok', true,
    'gym_id', p_gym_id,
    'defense_pet_ids', to_jsonb(p_pet_grading_ids),
    'pet_score', v_score,
    'main_card_ids', to_jsonb(v_new_main));
end;
$$;

grant execute on function set_gym_defense_deck(uuid, text, uuid[], text[]) to anon, authenticated;

notify pgrst, 'reload schema';
