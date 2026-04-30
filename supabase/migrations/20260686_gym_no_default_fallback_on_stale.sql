-- ============================================================
-- 점령 체육관은 절대 default(NPC) 로 떨어지지 않게 — stale 자동 처리
-- 정책 변경.
--
-- 사용자 정책 (재확인):
--   "점령한 유저가 있는 체육관에서는 누가 도전하든 항상 그 유저의
--    방어덱 포켓몬이 나와야 합니다. 다른 유저가 도전 후 패배했다고 해서
--    체육관이 default 관장 포켓몬 상태로 보이거나 방어덱 참조가
--    초기화되면 안 됩니다."
--
-- 현재 동작 (변경 전):
--   1) get_gyms_state: defense_pet_ids 중 하나라도 stale (psa_gradings
--      row 가 사라짐) 이면 has_defense_deck=false 로 노출 → 클라
--      deriveGymStatus 가 "open" 으로 분기 → NPC 표시.
--   2) resolve_gym_battle: 도전 시 stale 검출 시 defense_pet_ids 를
--      자동 NULL 로 wipe 하고 NPC 경로로 fall through. ownership 은
--      유지되지만 방어덱 정보는 영구 유실.
--
-- 사용자 정책상 두 동작 모두 부적절. 정정:
--   1) has_defense_deck = (defense_pet_ids 길이 3). stale 검사 제거.
--      → set_gym_defense_deck 시점에 valid 검증되므로, 길이 3 면
--        등록 시점엔 valid. 이후 stale 만 발생 → "방어덱 셋업되어
--        있다" 라는 사실은 그대로 노출.
--   2) defender_pokemon — LEFT JOIN 으로 stale 슬롯도 보존. stale
--      슬롯은 grading_id/slot/type 만 유지하고 card_id/rarity/grade
--      를 null 로 반환. 클라가 placeholder 로 graceful 표시.
--   3) resolve_gym_battle — stale 검출 시 자동 wipe 절대 안 함.
--      'defender_deck_stale' 명시적 에러로 도전 차단. ownership +
--      defense_pet_ids 보존 → 점령자가 set_gym_defense_deck 으로
--      재설정 시 손상 슬롯만 교체 가능 (기존 정의 그대로 동작).
--
-- 의존성:
--   · 20260629 (현재 get_gyms_state 정의), 20260660 (현재
--     resolve_gym_battle 정의), gym_protection_interval(),
--     gym_pet_battle_stats(), gym_type_effectiveness(),
--     gym_compute_user_center_power(), force_cleanup_stale_gym_challenges,
--     gym_daily_reward.
--
-- 멱등 — CREATE OR REPLACE 만 사용. 함수 시그니처 동일.
-- ============================================================

-- 1) get_gyms_state — has_defense_deck=length 3, defender_pokemon
--    LEFT JOIN 으로 stale 보존.
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
      coalesce(g.chapter, 1) as chapter,
      (select gdr.money from gym_daily_reward(g.difficulty) gdr) as daily_money,
      (select gdr.rank_pts from gym_daily_reward(g.difficulty) gdr) as daily_rank_pts,
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
        -- has_defense_deck — 단순히 "셋업 시점 길이 3 인가" 만 검사.
        -- stale (일부 슬랩 row 사라짐) 여도 ownership/defense 정보는
        -- 그대로 노출 → 클라가 NPC default 로 떨어지지 않음.
        'has_defense_deck',
          (o.defense_pet_ids is not null
            and coalesce(array_length(o.defense_pet_ids, 1), 0) = 3),
        -- defender_pokemon — LEFT JOIN 으로 stale 슬롯도 보존.
        -- stale 슬롯은 card_id/rarity/grade null 로 반환되고
        -- 클라가 placeholder 표시.
        'defender_pokemon',
          case when o.defense_pet_ids is not null
                and coalesce(array_length(o.defense_pet_ids, 1), 0) = 3
          then (
            select coalesce(jsonb_agg(jsonb_build_object(
              'slot', t.idx,
              'grading_id', t.pid,
              'card_id', g2.card_id,
              'type', o.defense_pet_types[t.idx],
              'rarity', g2.rarity, 'grade', g2.grade
            ) order by t.idx), null::jsonb)
            from unnest(o.defense_pet_ids) with ordinality as t(pid, idx)
            left join psa_gradings g2 on g2.id = t.pid
                                       and g2.user_id = o.owner_user_id
                                       and g2.grade = 10
          ) else null end,
        'daily_claimed_today',
          case when p_user_id is null or o.owner_user_id <> p_user_id then null
          else exists (
            select 1 from gym_rewards r
             where r.gym_id = g.id and r.reward_type = 'daily'
               and r.claimed_at > now() - interval '24 hours'
          ) end,
        'daily_next_claim_at',
          case when p_user_id is null or o.owner_user_id <> p_user_id then null
          else (
            select max(r.claimed_at) + interval '24 hours'
              from gym_rewards r
             where r.gym_id = g.id and r.reward_type = 'daily'
               and r.claimed_at > now() - interval '24 hours'
          ) end
       )
       from gym_ownerships o
       join users u on u.id = o.owner_user_id
       where o.gym_id = g.id) as ownership,
      (select jsonb_build_object(
        'id', c.id, 'user_id', c.challenger_user_id,
        'display_name', cu.display_name, 'started_at', c.started_at)
       from gym_challenges c
       join users cu on cu.id = c.challenger_user_id
       where c.gym_id = g.id and c.status = 'active'
       limit 1) as active_challenge,
      case when p_user_id is null then null
      else (select cd.cooldown_until from gym_cooldowns cd
            where cd.user_id = p_user_id and cd.gym_id = g.id
              and cd.cooldown_until > now() limit 1) end as user_cooldown_until,
      case when p_user_id is null then false
      else exists (select 1 from user_gym_medals m
                   where m.user_id = p_user_id and m.gym_id = g.id) end as has_my_medal
    from gyms g
  )
  select coalesce(json_agg(row_to_json(g) order by g.display_order), '[]'::json)
    into v_rows from gyms_full g;
  return v_rows;
end;
$$;

grant execute on function get_gyms_state(uuid) to anon, authenticated;

-- 2) resolve_gym_battle — stale 자동 wipe 제거. 명시적 에러 + ownership 보존.
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
  v_def_valid_count int := 0;
  v_use_defenders boolean := false;
  v_current_turn text := 'pet';
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

  select coalesce(main_card_ids, '{}'::uuid[]),
         coalesce(main_cards_by_type, '{}'::jsonb)
    into v_main_ids, v_by_type_data
    from users where id = p_user_id;
  if v_main_ids is null then v_main_ids := '{}'::uuid[]; end if;
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

  for i in 1..3 loop
    select * into v_pet
      from gym_pet_battle_stats(
        p_pet_grading_ids[i], i, v_center_power, v_gym.type, p_pet_types[i], false);
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

  -- 적 빌드 — 점령 + 방어덱 셋업이면 반드시 defenders. stale 시 절대
  -- NPC fallback 안 하고 명시적 에러 (사용자 정책: default 로 떨어지면
  -- 안 됨). 미점령일 때만 NPC.
  select * into v_owner_record from gym_ownerships where gym_id = p_gym_id;
  if v_owner_record.owner_user_id is not null
     and v_owner_record.defense_pet_ids is not null
     and coalesce(array_length(v_owner_record.defense_pet_ids, 1), 0) = 3
  then
    -- 점령 + 방어덱 셋업: stale 시 자동 wipe 안 함, ownership 보존.
    select count(*)::int into v_def_valid_count
      from psa_gradings gd
     where gd.id = any(v_owner_record.defense_pet_ids)
       and gd.user_id = v_owner_record.owner_user_id
       and gd.grade = 10;
    if v_def_valid_count = 3 then
      v_use_defenders := true;
    else
      -- stale → 명시적 에러로 도전 차단. ownership.defense_pet_ids 는
      -- 그대로 두어 점령자가 재셋업으로 손상 슬롯 교체 가능.
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
    -- 점령됐지만 방어덱 미설정 (length<3) — 기존 정책(20260625) 유지:
    -- NPC 경로로 진행 가능. 도전자 승리 시 새 owner 로 overwrite.
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

  -- 턴 시뮬 — 20260660 turn-order fix 그대로.
  while v_pet_idx <= 3 and v_enemy_idx <= 3 and v_turn < v_max_turns loop
    v_turn := v_turn + 1;

    if v_current_turn = 'pet' then
      declare
        v_pet_atk int := (v_pet_states -> (v_pet_idx - 1) ->> 'atk')::int;
        v_pet_type text := v_pet_states -> (v_pet_idx - 1) ->> 'type';
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
        if v_e_hp <= 0 then
          v_enemy_idx := v_enemy_idx + 1;
        end if;
      end;
      v_current_turn := 'enemy';
    else
      declare
        v_pet_type text := v_pet_states -> (v_pet_idx - 1) ->> 'type';
        v_e_atk int := (v_enemy_states -> (v_enemy_idx - 1) ->> 'atk')::int;
        v_e_type text := v_enemy_states -> (v_enemy_idx - 1) ->> 'type';
        v_pet_hp int := (v_pet_states -> (v_pet_idx - 1) ->> 'hp')::int;
        v_e_hp int := (v_enemy_states -> (v_enemy_idx - 1) ->> 'hp')::int;
      begin
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
    v_capture_reward := round(150000 * v_difficulty_mult)::int;
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

notify pgrst, 'reload schema';
