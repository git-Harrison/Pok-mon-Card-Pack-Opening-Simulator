-- ============================================================
-- 체육관 방어 덱 데이터 정합성 cleanup + 검증 강화.
--
-- 사용자 보고: 잎새 체육관에 구월동포켓몬마스터 점령 + 방어덱 등록
-- 상태인데 대결 진입 시 default NPC 가 표시되고, 진행 시 "상대 방어덱
-- 3번 슬롯 능력치 로딩 실패" 에러.
--
-- 원인 추정:
--   gym_ownerships.defense_pet_ids 가 ['a', 'b', 'c'] 3장으로 보이지만
--   c (또는 다른 슬롯) 의 grading 이 어떤 경로로 사라짐 — 그러나
--   ownership row 의 defense_pet_ids 는 갱신 안 됨. 결과:
--     · array_length = 3 → has_defense_deck=true
--     · LEFT JOIN psa_gradings 에서 stale slot 의 g2.* 가 NULL
--     · resolve_gym_battle: gym_pet_battle_stats(stale_uuid, ...) → not found
--     · "능력치 로딩 실패" 에러.
--   또는 array_length=3 인데 일부가 NULL element 등 corrupt.
--
-- 가능한 stale 발생 경로:
--   · 사용자가 일괄 감별 자동삭제 등 다른 path 로 슬랩 삭제
--   · 다른 체육관에서 본 사용자 슬랩이 destroyed (resolve_gym_battle
--     의 v_owner_record.defense_pet_ids 삭제 분기)
--   · 슬랩이 어떤 admin 액션으로 정리
--
-- 조치:
--   1) gym_ownerships 전체 점검: 각 row 의 defense_pet_ids 를
--      "owner_user_id 가 소유한 PCL10 psa_gradings" 로 필터.
--      필터 후 길이가 3 미만이면 defense_pet_ids / defense_pet_types
--      모두 null 로 reset (방어 덱 미설정 상태 복귀).
--   2) get_gyms_state 의 has_defense_deck / defender_pokemon 도
--      "3장이 모두 valid 한 owner-owned PCL10" 일 때만 true.
--      array_length 단순 체크 대신 inner join 으로 실재 검증.
--   3) RAISE NOTICE 로 cleanup 결과 로깅 (몇 개 row 정리).
-- ============================================================

-- 1) cleanup — defense_pet_ids 에 owner-owned PCL10 grading 만 남김.
--    stale ID 는 array 에서 제거. 결과 길이 != 3 이면 null.
do $$
declare
  v_row record;
  v_valid_ids uuid[];
  v_cleaned_count int := 0;
  v_nulled_count int := 0;
begin
  for v_row in
    select gym_id, owner_user_id, defense_pet_ids, defense_pet_types
      from gym_ownerships
     where defense_pet_ids is not null
       and coalesce(array_length(defense_pet_ids, 1), 0) > 0
  loop
    -- owner 소유 PCL10 만 필터.
    select array_agg(g.id order by array_position(v_row.defense_pet_ids, g.id))
      into v_valid_ids
      from psa_gradings g
     where g.id = any(v_row.defense_pet_ids)
       and g.user_id = v_row.owner_user_id
       and g.grade = 10;

    if v_valid_ids is null
       or array_length(v_valid_ids, 1) is null
       or array_length(v_valid_ids, 1) <> 3
    then
      -- 3장 미만이면 방어 덱 자체를 reset.
      update gym_ownerships
         set defense_pet_ids = null, defense_pet_types = null
       where gym_id = v_row.gym_id;
      v_nulled_count := v_nulled_count + 1;
      raise notice 'gym % : defense_pet_ids reset (valid=%/3)',
        v_row.gym_id,
        coalesce(array_length(v_valid_ids, 1), 0);
    elsif v_valid_ids <> v_row.defense_pet_ids then
      -- valid 3장 모두 있지만 array order 가 어긋나는 경우 — 그대로 두지
      -- 않고 valid 순서로 재정렬. types 도 같은 순서로 재배치 필요.
      -- (현재는 동일 길이 + 같은 set 일 때만 reorder. order 가 어긋나면
      --  types 매핑이 잘못될 수 있어 단순화 위해 reset.)
      update gym_ownerships
         set defense_pet_ids = null, defense_pet_types = null
       where gym_id = v_row.gym_id;
      v_nulled_count := v_nulled_count + 1;
      raise notice 'gym % : defense_pet_ids stale order, reset', v_row.gym_id;
    else
      v_cleaned_count := v_cleaned_count + 1;
    end if;
  end loop;
  raise notice 'gym defense cleanup: % healthy, % reset', v_cleaned_count, v_nulled_count;
end$$;

-- 2) get_gyms_state 보강 — has_defense_deck 가 "3장 모두 valid" 검증.
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
        -- has_defense_deck — array length=3 + 모든 ID 가 owner 의
        -- valid PCL10 grading 일 때만 true. stale grading 이 섞여 있으면
        -- false 로 fall through (사용자가 보호되도록).
        'has_defense_deck',
          (o.defense_pet_ids is not null
            and coalesce(array_length(o.defense_pet_ids, 1), 0) = 3
            and (
              select count(*)::int = 3
                from psa_gradings gd
               where gd.id = any(o.defense_pet_ids)
                 and gd.user_id = o.owner_user_id
                 and gd.grade = 10
            )
          ),
        'defender_pokemon',
          case when o.defense_pet_ids is not null
                and coalesce(array_length(o.defense_pet_ids, 1), 0) = 3
                and (
                  select count(*)::int = 3
                    from psa_gradings gd
                   where gd.id = any(o.defense_pet_ids)
                     and gd.user_id = o.owner_user_id
                     and gd.grade = 10
                )
          then (
            select coalesce(jsonb_agg(jsonb_build_object(
              'slot', t.idx,
              'grading_id', t.pid,
              'card_id', g2.card_id,
              'type', o.defense_pet_types[t.idx],
              'rarity', g2.rarity, 'grade', g2.grade
            ) order by t.idx), null::jsonb)
            -- inner join 으로 invalid 슬롯 자동 제외 (이미 위 valid 체크
            -- 가 모두 통과한 상태이므로 항상 3장 매칭).
            from unnest(o.defense_pet_ids) with ordinality as t(pid, idx)
            join psa_gradings g2 on g2.id = t.pid
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

-- 3) resolve_gym_battle — 점령 + defense_pet_ids 가 stale 한 경우 친절한
--    오류 메시지. 기존(20260620) 의 "방어 덱 미설정" 분기에 stale 검증
--    추가.
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

  -- 펫 등록 풀 — main_card_ids ∪ main_cards_by_type union.
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

  -- 공격 펫 빌드.
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

  -- 적 빌드 — 점령 상태 + 방어덱 valid 검증.
  select * into v_owner_record from gym_ownerships where gym_id = p_gym_id;
  if v_owner_record.owner_user_id is not null then
    -- 점령됨: 방어덱 길이 3 + 모든 ID 가 owner-owned PCL10 grading 인지.
    if v_owner_record.defense_pet_ids is null
       or coalesce(array_length(v_owner_record.defense_pet_ids, 1), 0) <> 3
    then
      update gym_challenges
         set status = 'abandoned', ended_at = now(),
             result = 'defender_deck_not_set'
       where id = p_challenge_id;
      return json_build_object('ok', false,
        'error',
        '점령자가 방어 덱을 아직 설정하지 않았어요. 점령자가 셋업하기 전엔 도전 불가.',
        'reason', 'defender_deck_not_set');
    end if;

    -- stale 슬랩 검증.
    select count(*)::int into v_def_valid_count
      from psa_gradings gd
     where gd.id = any(v_owner_record.defense_pet_ids)
       and gd.user_id = v_owner_record.owner_user_id
       and gd.grade = 10;
    if v_def_valid_count <> 3 then
      -- stale 발견 → 자동 reset 후 사용자에게 명시 오류. 다음 시도 시
      -- 점령자가 방어 덱 재셋업 가능.
      update gym_ownerships
         set defense_pet_ids = null, defense_pet_types = null
       where gym_id = p_gym_id;
      update gym_challenges
         set status = 'abandoned', ended_at = now(),
             result = 'defender_deck_stale'
       where id = p_challenge_id;
      return json_build_object('ok', false,
        'error',
        '점령자 방어 덱 데이터가 손상돼 있어요 (' || v_def_valid_count
        || '/3 valid). 자동 정리됐으니 점령자가 방어 덱을 다시 셋업하면 도전 가능합니다.',
        'reason', 'defender_deck_stale');
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
            '상대 방어덱 %s번 슬롯의 능력치를 불러오지 못했어요.', i),
          'reason', 'defender_stat_load_failed');
      end if;
      v_enemy_states := v_enemy_states || jsonb_build_object(
        'slot', i, 'card_id', v_def_pet.card_id, 'name', v_def_pet.name,
        'type', v_def_pet.type, 'rarity', v_def_pet.rarity, 'grade', v_def_pet.grade,
        'hp_max', v_def_pet.hp, 'hp', v_def_pet.hp, 'atk', v_def_pet.atk,
        'is_defender', true);
    end loop;
  else
    -- 미점령: NPC 관장 포켓몬.
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

notify pgrst, 'reload schema';
