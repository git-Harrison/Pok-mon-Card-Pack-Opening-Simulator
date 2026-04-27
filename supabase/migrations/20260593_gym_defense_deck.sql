-- ============================================================
-- 체육관 방어 덱 + 점령자 정보 노출 + 전투 결과 반영.
--
-- 1) gym_ownerships 컬럼 추가: defense_pet_ids uuid[3], defense_pet_types
--    text[3]. 점령 후 소유자가 자기 PCL10 펫 3마리로 방어 덱 셋업
--    가능. NULL 이면 기본 NPC 관장 포켓몬으로 방어.
-- 2) set_gym_defense_deck RPC — 소유자만 호출 가능. 본인 PCL10 + 펫
--    등록된 슬랩만. 멱등 (재호출 시 갱신).
-- 3) get_gyms_state v3 — ownership 에 character + has_defense_deck 추가.
-- 4) resolve_gym_battle 갱신 — 도전 받는 체육관에 defense_pet_ids 가
--    있으면 그 슬랩들을 적으로 사용 (gym_pet_battle_stats 로 능력치
--    산출, 소유자의 center_power 보너스 적용). 없으면 기존 NPC 포켓몬.
--    소유자 변경 시 defense_pet_ids 초기화 (새 소유자가 다시 설정).
--
-- 모든 DDL 멱등.
-- ============================================================

alter table gym_ownerships
  add column if not exists defense_pet_ids uuid[],
  add column if not exists defense_pet_types text[];

-- 1) set_gym_defense_deck — 소유자 전용 방어 덱 셋업
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
  v_pet_id uuid;
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

  -- 본인 소유 + PCL10 + 펫 등록(main_card_ids) 검증
  select coalesce(main_card_ids, '{}'::uuid[]) into v_main_ids
    from users where id = p_user_id;
  for v_pet_id in select unnest(p_pet_grading_ids) loop
    if not exists (
      select 1 from psa_gradings g
       where g.id = v_pet_id
         and g.user_id = p_user_id
         and g.grade = 10
         and g.id = any(coalesce(v_main_ids, '{}'::uuid[]))
    ) then
      return json_build_object('ok', false, 'error',
        '본인 펫(PCL10·등록 슬랩) 만 방어 덱에 등록할 수 있어요.');
    end if;
  end loop;

  update gym_ownerships
     set defense_pet_ids = p_pet_grading_ids,
         defense_pet_types = p_pet_types
   where gym_id = p_gym_id;

  return json_build_object(
    'ok', true,
    'gym_id', p_gym_id,
    'defense_pet_ids', to_jsonb(p_pet_grading_ids)
  );
end;
$$;

grant execute on function set_gym_defense_deck(uuid, text, uuid[], text[]) to anon, authenticated;

-- 2) get_gyms_state v3 — ownership.character + has_defense_deck 추가
create or replace function get_gyms_state(p_user_id uuid default null)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_rows json;
begin
  perform force_cleanup_stale_gym_challenges();

  with gyms_full as (
    select
      g.id, g.name, g.type, g.difficulty, g.leader_name, g.leader_sprite,
      g.location_x, g.location_y, g.min_power, g.display_order,
      coalesce(
        (select jsonb_agg(jsonb_build_object(
          'id', p.id, 'slot', p.slot, 'name', p.name, 'type', p.type,
          'dex', p.dex, 'hp', p.hp, 'atk', p.atk, 'def', p.def, 'spd', p.spd
        ) order by p.slot)
         from gym_pokemon p where p.gym_id = g.id),
        '[]'::jsonb
      ) as pokemon,
      (select jsonb_build_object(
        'id', m.id, 'name', m.name, 'type', m.type, 'description', m.description
       ) from gym_medals m where m.gym_id = g.id) as medal,
      (select jsonb_build_object(
        'user_id', o.owner_user_id,
        'display_name', u.display_name,
        'character', u."character",
        'captured_at', o.captured_at,
        'protection_until', o.protection_until,
        'has_defense_deck',
          (o.defense_pet_ids is not null
            and coalesce(array_length(o.defense_pet_ids, 1), 0) = 3)
       )
       from gym_ownerships o
       join users u on u.id = o.owner_user_id
       where o.gym_id = g.id) as ownership,
      (select jsonb_build_object(
        'id', c.id,
        'user_id', c.challenger_user_id,
        'display_name', cu.display_name,
        'started_at', c.started_at
       )
       from gym_challenges c
       join users cu on cu.id = c.challenger_user_id
       where c.gym_id = g.id and c.status = 'active'
       limit 1) as active_challenge,
      case
        when p_user_id is null then null
        else (
          select cd.cooldown_until
            from gym_cooldowns cd
           where cd.user_id = p_user_id
             and cd.gym_id = g.id
             and cd.cooldown_until > now()
           limit 1
        )
      end as user_cooldown_until,
      case
        when p_user_id is null then false
        else exists (
          select 1 from user_gym_medals m
           where m.user_id = p_user_id and m.gym_id = g.id
        )
      end as has_my_medal
    from gyms g
  )
  select coalesce(json_agg(row_to_json(g) order by g.display_order), '[]'::json)
    into v_rows
    from gyms_full g;
  return v_rows;
end;
$$;

grant execute on function get_gyms_state(uuid) to anon, authenticated;

-- 3) resolve_gym_battle v2 — 방어 덱 우선 사용 + 소유자 변경 시 초기화
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
  if not found then
    return json_build_object('ok', false, 'error', '도전 기록을 찾을 수 없어요.');
  end if;
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

  select coalesce(main_card_ids, '{}'::uuid[]) into v_main_ids
    from users where id = p_user_id;
  if v_main_ids is null then v_main_ids := '{}'::uuid[]; end if;

  if (select count(distinct id) from unnest(p_pet_grading_ids) as id) <> 3 then
    return json_build_object('ok', false, 'error', '펫 3마리는 서로 달라야 해요.');
  end if;
  for v_pet_id in select unnest(p_pet_grading_ids) loop
    if not exists (
      select 1 from psa_gradings g
       where g.id = v_pet_id
         and g.user_id = p_user_id
         and g.grade = 10
         and g.id = any(v_main_ids)
    ) then
      return json_build_object('ok', false, 'error',
        '본인 펫(PCL10·등록 슬랩) 만 출전할 수 있어요.');
    end if;
  end loop;

  v_center_power := gym_compute_user_center_power(p_user_id);
  if v_center_power < coalesce(v_gym.min_power, 0) then
    update gym_challenges
       set status = 'abandoned', ended_at = now(), result = 'underpowered'
     where id = p_challenge_id;
    return json_build_object(
      'ok', false,
      'error', '도전 최소 전투력에 못 미쳐요.',
      'min_power', v_gym.min_power,
      'center_power', v_center_power
    );
  end if;

  -- 도전자 펫 능력치
  for i in 1..3 loop
    select * into v_pet
      from gym_pet_battle_stats(
        p_pet_grading_ids[i], i, v_center_power, v_gym.type, p_pet_types[i]
      );
    v_pet_states := v_pet_states || jsonb_build_object(
      'slot', i,
      'grading_id', p_pet_grading_ids[i],
      'card_id', v_pet.card_id,
      'name', v_pet.name,
      'type', v_pet.type,
      'rarity', v_pet.rarity,
      'grade', v_pet.grade,
      'hp_max', v_pet.hp,
      'hp', v_pet.hp,
      'atk', v_pet.atk
    );
  end loop;

  -- 적 능력치 — 소유자의 방어 덱이 있으면 그것 우선, 없으면 NPC 포켓몬.
  select * into v_owner_record from gym_ownerships
    where gym_id = p_gym_id;
  if v_owner_record.gym_id is not null
     and v_owner_record.defense_pet_ids is not null
     and coalesce(array_length(v_owner_record.defense_pet_ids, 1), 0) = 3
  then
    -- 방어 덱 모드
    v_def_center_power := gym_compute_user_center_power(v_owner_record.owner_user_id);
    for i in 1..3 loop
      select * into v_def_pet
        from gym_pet_battle_stats(
          v_owner_record.defense_pet_ids[i],
          i,
          v_def_center_power,
          v_gym.type,
          v_owner_record.defense_pet_types[i]
        );
      v_enemy_states := v_enemy_states || jsonb_build_object(
        'slot', i,
        'card_id', v_def_pet.card_id,
        'name', v_def_pet.name,
        'type', v_def_pet.type,
        'rarity', v_def_pet.rarity,
        'grade', v_def_pet.grade,
        'hp_max', v_def_pet.hp,
        'hp', v_def_pet.hp,
        'atk', v_def_pet.atk,
        'is_defender', true
      );
    end loop;
  else
    -- NPC 모드 (관장 기본 포켓몬)
    for v_enemy_record in
      select gp.slot, gp.name, gp.type, gp.dex, gp.hp, gp.atk, gp.def, gp.spd
        from gym_pokemon gp
       where gp.gym_id = p_gym_id
       order by gp.slot
    loop
      declare v_e_atk int := v_enemy_record.atk;
      begin
        if v_enemy_record.type = v_gym.type then
          v_e_atk := round(v_e_atk * 1.10)::int;
        end if;
        v_enemy_states := v_enemy_states || jsonb_build_object(
          'slot', v_enemy_record.slot,
          'name', v_enemy_record.name,
          'type', v_enemy_record.type,
          'dex', v_enemy_record.dex,
          'hp_max', v_enemy_record.hp,
          'hp', v_enemy_record.hp,
          'atk', v_e_atk,
          'is_defender', false
        );
      end;
    end loop;
  end if;

  -- 시뮬 — 펫 선공
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
        'turn', v_turn, 'side', 'pet',
        'attacker_slot', v_pet_idx, 'defender_slot', v_enemy_idx,
        'damage', v_dmg, 'eff', v_eff, 'crit', v_crit,
        'enemy_hp_left', v_e_hp, 'pet_hp_left', v_pet_hp
      );
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
        'turn', v_turn, 'side', 'enemy',
        'attacker_slot', v_enemy_idx, 'defender_slot', v_pet_idx,
        'damage', v_dmg, 'eff', v_eff, 'crit', v_crit,
        'enemy_hp_left', v_e_hp, 'pet_hp_left', v_pet_hp
      );
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
      when 'HARD' then 2.4 when 'BOSS' then 4.0
      else 1.0
    end;
    v_capture_reward := round(150000 * v_difficulty_mult)::int;
    if v_medal.id is not null then
      insert into user_gym_medals (user_id, gym_id, medal_id, used_pets)
        values (p_user_id, p_gym_id, v_medal.id,
          jsonb_build_object('pets', v_pet_states))
        on conflict (user_id, gym_id) do nothing;
    end if;
    v_protection_until := now() + interval '12 hours';
    -- 소유자 변경 시 방어 덱 NULL 로 초기화 — 새 소유자가 다시 설정.
    insert into gym_ownerships (
      gym_id, owner_user_id, captured_at, protection_until,
      defense_pet_ids, defense_pet_types
    ) values (
      p_gym_id, p_user_id, now(), v_protection_until, null, null
    )
    on conflict (gym_id) do update
      set owner_user_id = excluded.owner_user_id,
          captured_at = excluded.captured_at,
          protection_until = excluded.protection_until,
          defense_pet_ids = null,
          defense_pet_types = null;
    update users set points = points + v_capture_reward
      where id = p_user_id returning points into v_user_points;
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
    jsonb_build_object('pets', v_pet_states, 'enemies', v_enemy_states),
    v_turn_log, v_challenge.started_at
  );

  return json_build_object(
    'ok', true,
    'result', v_winner,
    'pets', v_pet_states,
    'enemies', v_enemy_states,
    'turn_log', v_turn_log,
    'capture_reward', case when v_winner = 'won' then v_capture_reward else 0 end,
    'medal_id', case when v_winner = 'won' then v_medal.id else null end,
    'protection_until', case when v_winner = 'won' then v_protection_until else null end,
    'cooldown_until', case when v_winner = 'lost' then now() + interval '8 minutes' else null end,
    'points', v_user_points,
    'center_power', v_center_power
  );
end;
$$;

grant execute on function resolve_gym_battle(uuid, text, uuid, uuid[], text[]) to anon, authenticated;

notify pgrst, 'reload schema';
