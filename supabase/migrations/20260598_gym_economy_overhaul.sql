-- ============================================================
-- 체육관 경제/덱 메커니즘 대폭 변경 (사용자 요청 4가지)
--
-- 1) 방어덱에 펫 등록하면 → 그 펫은 user.main_card_ids 에서 빠짐.
--    펫 슬롯 비워지고 다른 펫 등록 가능. 단, 전투력 (pet_score) 은
--    유지 — 방어덱 펫도 pet_score 합산에 포함.
-- 2) 다른 트레이너에게 점령당해 ownership 이 넘어가면 — 방어덱 펫
--    psa_gradings 영구 삭제. (= 슬랩 소멸 = 카드 지갑서도 사라짐 —
--    psa_gradings 가 PCL10 슬랩의 정전.) 패배 사용자의 pet_score
--    자동 재계산 → 전투력 그만큼 감소.
-- 3) 점령한 체육관 1개당 center_power +10,000 버프.
-- 4) 1일 1회 / 체육관별로 일일 보상 청구 가능: +20,000,000 게임머니
--    + 10,000 랭킹 포인트. 자정(KST) 기준.
--
-- 파급:
--   · users 새 컬럼 gym_daily_rank_pts (랭크 점수에 합산).
--   · gym_rewards 의 reward_type CHECK 에 'daily' 추가.
--   · compute_user_pet_score(uuid) — main_card_ids ∪ 모든 소유 체육관
--     의 defense_pet_ids 를 합한 pet_score.
--   · set_main_cards / set_gym_defense_deck — main_card_ids 와 ownership
--     의 정합 + pet_score 재계산.
--   · resolve_gym_battle 승리 시 — 패배자 방어덱 슬랩 DELETE +
--     pet_score 재계산.
--   · gym_compute_user_center_power / get_user_rankings — gym 보유 수
--     × 10,000 버프 + (rankings) gym_daily_rank_pts 합산.
--   · claim_gym_daily(uuid, text) RPC — KST 일자 기준 1회 제한.
--   · get_gyms_state ownership 에 daily_claimed_today 추가 (자기 체육관).
-- ============================================================

-- 0) 새 컬럼 + 제약 ---
alter table users
  add column if not exists gym_daily_rank_pts int not null default 0;

alter table gym_rewards drop constraint if exists gym_rewards_reward_type_check;
alter table gym_rewards add constraint gym_rewards_reward_type_check
  check (reward_type in ('capture','maintenance','defense','extension','daily'));

-- 1) compute_user_pet_score — main + 모든 소유 체육관 방어덱 합산
create or replace function compute_user_pet_score(p_user_id uuid)
returns int
language sql
stable
set search_path = public, extensions
as $$
  with all_ids as (
    select unnest(coalesce(main_card_ids, '{}'::uuid[])) as id
      from users where id = p_user_id
    union
    select unnest(coalesce(defense_pet_ids, '{}'::uuid[])) as id
      from gym_ownerships where owner_user_id = p_user_id
  )
  select coalesce(sum(rarity_score(g.rarity) * 15), 0)::int
    from psa_gradings g
   where g.id in (select id from all_ids)
     and g.grade = 10;
$$;

grant execute on function compute_user_pet_score(uuid) to anon, authenticated;

-- 2) set_main_cards — pet_score 산식을 union 기반으로
create or replace function set_main_cards(
  p_user_id uuid,
  p_grading_ids uuid[]
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ids uuid[];
  v_valid_count int;
  v_displayed_count int;
  v_score int;
begin
  v_ids := coalesce(p_grading_ids, '{}'::uuid[]);

  if array_length(v_ids, 1) is not null and array_length(v_ids, 1) > 10 then
    return json_build_object('ok', false, 'error', '펫은 최대 10장까지 등록할 수 있어요.');
  end if;

  if array_length(v_ids, 1) is not null then
    select count(*)::int into v_valid_count
      from psa_gradings g
     where g.id = any(v_ids)
       and g.user_id = p_user_id
       and g.grade = 10;
    if v_valid_count <> array_length(v_ids, 1) then
      return json_build_object('ok', false, 'error',
        '본인의 PCL10 슬랩만 펫으로 등록할 수 있어요.');
    end if;

    select count(*)::int into v_displayed_count
      from showcase_cards sc where sc.grading_id = any(v_ids);
    if v_displayed_count > 0 then
      return json_build_object('ok', false, 'error',
        '전시 중인 슬랩은 펫으로 등록할 수 없어요. 센터에서 전시 해제 후 다시 시도하세요.');
    end if;

    -- 신규: 다른 체육관 방어덱에 이미 있는 슬랩이면 거부.
    if exists (
      select 1 from gym_ownerships
       where owner_user_id = p_user_id
         and defense_pet_ids && v_ids
    ) then
      return json_build_object('ok', false, 'error',
        '방어 덱에 등록된 슬랩이 포함돼 있어요. 방어 덱에서 제외 후 다시 시도하세요.');
    end if;
  end if;

  update users set main_card_ids = v_ids where id = p_user_id;
  v_score := compute_user_pet_score(p_user_id);
  update users set pet_score = v_score where id = p_user_id;

  return json_build_object('ok', true,
    'main_card_ids', to_jsonb(v_ids),
    'pet_score', v_score);
end;
$$;

grant execute on function set_main_cards(uuid, uuid[]) to anon, authenticated;

-- 3) set_gym_defense_deck — main_card_ids 에서 빠지게 + pet_score 재계산
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
  v_gym record;
  v_old_def uuid[];
  v_returned uuid[];     -- 옛 defense 였으나 새 deck 에 없는 → main 으로 복귀 (자리 있으면)
  v_new_main uuid[];
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

  select coalesce(main_card_ids, '{}'::uuid[]) into v_main_ids
    from users where id = p_user_id for update;

  -- 검증: 새 방어덱 펫은 main_card_ids 또는 기존 defense_pet_ids 에 있어야.
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

  -- 옛 deck → 새 deck 차집합. 새 deck 에 없는 옛 슬랩은 main 으로 복귀
  -- 시도 (자리 있으면).
  v_old_def := coalesce(v_owner.defense_pet_ids, '{}'::uuid[]);
  v_returned := array(
    select id from unnest(v_old_def) as id
     where not (id = any(p_pet_grading_ids))
  );

  -- 새 main = (기존 main - 새 deck) ∪ (복귀할 옛 deck 펫)
  v_new_main := array(
    select id from unnest(v_main_ids) as id
     where not (id = any(p_pet_grading_ids))
  );
  -- 복귀 펫 추가 (10 슬롯 cap)
  if v_returned is not null and array_length(v_returned, 1) > 0 then
    v_new_main := v_new_main || (
      select coalesce(array_agg(id), '{}'::uuid[])
        from unnest(v_returned) as id
       where coalesce(array_length(v_new_main, 1), 0) +
             (select count(*)::int from unnest(v_returned) as ii where ii = id) <= 10
    );
  end if;

  update users set main_card_ids = v_new_main where id = p_user_id;
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

-- 4) resolve_gym_battle — 승리 시 패배 측 방어덱 슬랩 영구 삭제
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
        '본인 펫(PCL10·등록 슬랩) 만 출전할 수 있어요.');
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
        p_pet_grading_ids[i], i, v_center_power, v_gym.type, p_pet_types[i]);
    v_pet_states := v_pet_states || jsonb_build_object(
      'slot', i, 'grading_id', p_pet_grading_ids[i],
      'card_id', v_pet.card_id, 'name', v_pet.name, 'type', v_pet.type,
      'rarity', v_pet.rarity, 'grade', v_pet.grade,
      'hp_max', v_pet.hp, 'hp', v_pet.hp, 'atk', v_pet.atk
    );
  end loop;

  select * into v_owner_record from gym_ownerships where gym_id = p_gym_id;
  if v_owner_record.gym_id is not null
     and v_owner_record.defense_pet_ids is not null
     and coalesce(array_length(v_owner_record.defense_pet_ids, 1), 0) = 3
  then
    v_def_center_power := gym_compute_user_center_power(v_owner_record.owner_user_id);
    for i in 1..3 loop
      select * into v_def_pet
        from gym_pet_battle_stats(
          v_owner_record.defense_pet_ids[i], i, v_def_center_power,
          v_gym.type, v_owner_record.defense_pet_types[i]);
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
    v_protection_until := now() + interval '12 hours';

    -- 패배 측 방어덱 슬랩 영구 삭제 (사용자 요청). 패배자 pet_score 재계산.
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
      -- main_card_ids 에 우연히 남아있을 수 있으므로 정리.
      update users
         set main_card_ids = array(
               select id from unnest(coalesce(main_card_ids, '{}'::uuid[])) as id
                where not (id = any(v_owner_record.defense_pet_ids))
             )
       where id = v_owner_record.owner_user_id;
      -- pet_score 재계산
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
    -- 새 소유자 pet_score 도 재계산 (방어덱 NULL → 차이 없을 가능성 높음).
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

-- 5) gym_compute_user_center_power — 점령 체육관 수 × 10,000 버프 추가
create or replace function gym_compute_user_center_power(p_user_id uuid)
returns int
language sql
stable
set search_path = public, extensions
as $$
  select coalesce((
    select sum(coalesce(showcase_power(g2.rarity, g2.grade), 0))::int
      from showcase_cards sc
      join user_showcases us on us.id = sc.showcase_id
      join psa_gradings g2 on g2.id = sc.grading_id
     where us.user_id = p_user_id
  ), 0)
  + coalesce(pokedex_power_bonus(p_user_id), 0)
  + coalesce(pokedex_completion_bonus(p_user_id), 0)
  + coalesce((select pet_score from users where id = p_user_id), 0)
  + (select count(*)::int * 10000 from gym_ownerships where owner_user_id = p_user_id);
$$;

grant execute on function gym_compute_user_center_power(uuid) to anon, authenticated;

-- 6) get_user_rankings — center_power 에 점령 버프, rank_score 에 일일 누적
create or replace function get_user_rankings()
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_rows json;
begin
  select coalesce(json_agg(r order by r.rank_score desc, r.points desc), '[]'::json)
    into v_rows
  from (
    select
      u.id, u.user_id, u.display_name, u.age, u.points, u."character",
      coalesce(u.pet_score, 0) as pet_score,
      coalesce(u.main_card_ids, '{}'::uuid[]) as main_card_ids,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', g3.id, 'card_id', g3.card_id,
          'grade', g3.grade, 'rarity', g3.rarity)
          order by array_position(u.main_card_ids, g3.id))
        from psa_gradings g3
       where g3.user_id = u.id
         and g3.id = any(coalesce(u.main_card_ids, '{}'::uuid[]))
         and g3.grade = 10
      ), '[]'::jsonb) as main_cards,
      (
        coalesce(u.wild_wins, 0) * 100
        + coalesce(u.showcase_rank_pts, 0)
        + coalesce(u.gym_daily_rank_pts, 0)
        + coalesce((select sum(case when l.grade = 10 then 1000 else 500 end)::int
              from sabotage_logs l where l.attacker_id = u.id and l.success), 0)
        + coalesce((select count(*)::int * 150 from sabotage_logs l
              where l.victim_id = u.id and not l.success), 0)
      ) as rank_score,
      (
        coalesce((
          select sum(showcase_power(g2.rarity, g2.grade))::int
          from showcase_cards sc
          join user_showcases us on us.id = sc.showcase_id
          join psa_gradings g2 on g2.id = sc.grading_id
          where us.user_id = u.id
        ), 0)
        + pokedex_power_bonus(u.id)
        + coalesce(pokedex_completion_bonus(u.id), 0)
        + coalesce(u.pet_score, 0)
        + (select count(*)::int * 10000 from gym_ownerships where owner_user_id = u.id)
      ) as center_power,
      coalesce(u.pokedex_count, 0) as pokedex_count,
      pokedex_power_bonus(u.id) as pokedex_bonus,
      coalesce(pokedex_completion_bonus(u.id), 0) as pokedex_completion_bonus,
      u.last_seen_at,
      extract(epoch from (now() - u.last_seen_at)) as seconds_since_seen,
      coalesce(count(g.id), 0)::int as psa_count,
      coalesce(sum(case when g.grade = 10 then 1 else 0 end), 0)::int as psa_10,
      coalesce(sum(case when g.grade = 9  then 1 else 0 end), 0)::int as psa_9,
      coalesce(sum(case when g.grade = 8  then 1 else 0 end), 0)::int as psa_8,
      coalesce(sum(case when g.grade = 7  then 1 else 0 end), 0)::int as psa_7,
      coalesce(sum(case when g.grade = 6  then 1 else 0 end), 0)::int as psa_6,
      coalesce((select count(*)::int from showcase_cards sc
                 join user_showcases us on us.id = sc.showcase_id
                where us.user_id = u.id), 0) as showcase_count,
      coalesce((select count(*)::int from sabotage_logs l
                where l.attacker_id = u.id and l.success), 0) as sabotage_wins,
      coalesce(u.wild_wins, 0) as wild_wins,
      coalesce(u.showcase_rank_pts, 0) as showcase_rank_pts,
      coalesce(u.gym_daily_rank_pts, 0) as gym_daily_rank_pts,
      (select count(*)::int from gym_ownerships where owner_user_id = u.id) as gym_count,
      coalesce(jsonb_agg(jsonb_build_object(
        'id', g.id, 'card_id', g.card_id, 'grade', g.grade, 'graded_at', g.graded_at)
        order by g.grade desc, g.graded_at desc)
        filter (where g.id is not null), '[]'::jsonb) as gradings
    from users u
    left join psa_gradings g on g.user_id = u.id
    group by u.id
  ) r;
  return v_rows;
end;
$$;

grant execute on function get_user_rankings() to anon, authenticated;

-- 7) claim_gym_daily — 1일 1회 체육관별 보상
create or replace function claim_gym_daily(
  p_user_id uuid,
  p_gym_id text
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_owner record;
  v_today date;
  v_already int;
  v_rank_pts constant int := 10000;
  v_money constant int := 20000000;
  v_new_points int;
begin
  if p_user_id is null or p_gym_id is null then
    return json_build_object('ok', false, 'error', '요청이 올바르지 않아요.');
  end if;

  perform pg_advisory_xact_lock(hashtext('gym:daily:' || p_gym_id || ':' || p_user_id));

  select * into v_owner from gym_ownerships
    where gym_id = p_gym_id for update;
  if not found then
    return json_build_object('ok', false, 'error', '비점령 체육관입니다.');
  end if;
  if v_owner.owner_user_id <> p_user_id then
    return json_build_object('ok', false, 'error', '체육관 소유자만 청구 가능합니다.');
  end if;

  v_today := (now() at time zone 'Asia/Seoul')::date;
  select count(*)::int into v_already
    from gym_rewards
   where user_id = p_user_id and gym_id = p_gym_id
     and reward_type = 'daily'
     and (claimed_at at time zone 'Asia/Seoul')::date = v_today;
  if v_already > 0 then
    return json_build_object('ok', false,
      'error', '오늘 이 체육관 일일 보상은 이미 받았어요. 자정(KST) 이후 다시 시도하세요.');
  end if;

  -- 보상 지급 + 누계
  update users
     set points = points + v_money,
         gym_daily_rank_pts = gym_daily_rank_pts + v_rank_pts
   where id = p_user_id
   returning points into v_new_points;
  insert into gym_rewards (user_id, gym_id, reward_type, amount)
    values (p_user_id, p_gym_id, 'daily', v_money);

  return json_build_object(
    'ok', true,
    'gym_id', p_gym_id,
    'money', v_money,
    'rank_points', v_rank_pts,
    'points', v_new_points);
end;
$$;

grant execute on function claim_gym_daily(uuid, text) to anon, authenticated;

-- 8) get_gyms_state v5 — ownership 에 daily_claimed_today (own gym 한정)
create or replace function get_gyms_state(p_user_id uuid default null)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_rows json;
  v_today_kst date := (now() at time zone 'Asia/Seoul')::date;
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
            and coalesce(array_length(o.defense_pet_ids, 1), 0) = 3),
        'defender_pokemon',
          case when o.defense_pet_ids is not null
                and coalesce(array_length(o.defense_pet_ids, 1), 0) = 3
          then (
            select coalesce(jsonb_agg(jsonb_build_object(
              'slot', t.idx, 'card_id', g2.card_id,
              'type', o.defense_pet_types[t.idx],
              'rarity', g2.rarity, 'grade', g2.grade
            ) order by t.idx), null::jsonb)
            from unnest(o.defense_pet_ids) with ordinality as t(pid, idx)
            left join psa_gradings g2 on g2.id = t.pid
          ) else null end,
        'daily_claimed_today',
          case when p_user_id is null or o.owner_user_id <> p_user_id then null
          else exists (
            select 1 from gym_rewards r
             where r.user_id = p_user_id and r.gym_id = g.id
               and r.reward_type = 'daily'
               and (r.claimed_at at time zone 'Asia/Seoul')::date = v_today_kst
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

-- 9) display_grading — 방어덱에 등록된 슬랩 전시 금지 추가
create or replace function display_grading(
  p_user_id uuid,
  p_showcase_id uuid,
  p_slot_index int,
  p_grading_id uuid
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_showcase record;
  v_capacity int;
  v_grading record;
  v_main_ids uuid[];
begin
  select * into v_showcase from user_showcases
    where id = p_showcase_id and user_id = p_user_id
    for update;
  if not found then
    return json_build_object('ok', false, 'error', '보관함을 찾을 수 없어요.');
  end if;

  v_capacity := showcase_capacity(v_showcase.showcase_type);
  if p_slot_index < 0 or p_slot_index >= v_capacity then
    return json_build_object('ok', false, 'error', '슬롯 번호가 올바르지 않아요.');
  end if;

  if exists(select 1 from showcase_cards
            where showcase_id = p_showcase_id and slot_index = p_slot_index) then
    return json_build_object('ok', false, 'error', '이미 전시 중인 슬롯이에요.');
  end if;

  select * into v_grading from psa_gradings
    where id = p_grading_id and user_id = p_user_id;
  if not found then
    return json_build_object('ok', false, 'error', '감별 기록을 찾을 수 없어요.');
  end if;
  if v_grading.grade not in (9, 10) then
    return json_build_object('ok', false, 'error', 'PCL 9·10 등급만 전시할 수 있어요.');
  end if;

  if exists(select 1 from showcase_cards where grading_id = p_grading_id) then
    return json_build_object('ok', false, 'error', '이미 다른 보관함에 전시 중이에요.');
  end if;

  select coalesce(main_card_ids, '{}'::uuid[]) into v_main_ids
    from users where id = p_user_id;
  if p_grading_id = any(v_main_ids) then
    return json_build_object('ok', false,
      'error', '펫으로 등록된 슬랩은 전시할 수 없어요. 프로필에서 펫 해제 후 다시 시도하세요.');
  end if;

  -- 신규: 체육관 방어덱에 등록된 슬랩 전시 금지
  if exists (
    select 1 from gym_ownerships
     where owner_user_id = p_user_id
       and p_grading_id = any(coalesce(defense_pet_ids, '{}'::uuid[]))
  ) then
    return json_build_object('ok', false,
      'error', '체육관 방어 덱에 등록된 슬랩은 전시할 수 없어요. 방어 덱에서 제외 후 다시 시도하세요.');
  end if;

  insert into showcase_cards (showcase_id, slot_index, grading_id)
    values (p_showcase_id, p_slot_index, p_grading_id);

  return json_build_object('ok', true);
end;
$$;

grant execute on function display_grading(uuid, uuid, int, uuid) to anon, authenticated;

-- 10) bulk_create_showcases — 방어덱 슬랩 전시 금지 (대량 등록 경로)
create or replace function bulk_create_showcases(
  p_user_id uuid,
  p_showcase_type text,
  p_grading_ids uuid[]
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_price int;
  v_count int;
  v_total_cost bigint;
  v_points int;
  v_new_points int;
  v_main_ids uuid[];
  v_def_ids uuid[];
  v_grading record;
  v_used_cells int[];
  v_cell int;
  v_slot_x int;
  v_slot_y int;
  v_new_showcase uuid;
  v_created int := 0;
  v_total_cells constant int := 36;
begin
  if p_user_id is null then
    return json_build_object('ok', false, 'error', '요청이 올바르지 않아요.');
  end if;
  if p_showcase_type is null
     or p_showcase_type = 'vault'
     or showcase_price(p_showcase_type) is null then
    return json_build_object('ok', false, 'error', '존재하지 않는 보관함 종류예요.');
  end if;
  if p_grading_ids is null or array_length(p_grading_ids, 1) is null then
    return json_build_object('ok', false, 'error', '전시할 슬랩을 선택해 주세요.');
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  v_price := showcase_price(p_showcase_type);
  v_count := array_length(p_grading_ids, 1);
  v_total_cost := v_price::bigint * v_count;

  select points, coalesce(main_card_ids, '{}'::uuid[])
    into v_points, v_main_ids
  from users
  where id = p_user_id
  for update;
  if not found then
    return json_build_object('ok', false, 'error', '사용자를 찾을 수 없어요.');
  end if;
  if v_points < v_total_cost then
    return json_build_object('ok', false, 'error', '포인트가 부족해요.');
  end if;

  -- 모든 소유 체육관의 방어덱 슬랩 모음.
  select coalesce(array_agg(id), '{}'::uuid[]) into v_def_ids
    from (select unnest(coalesce(defense_pet_ids, '{}'::uuid[])) as id
            from gym_ownerships where owner_user_id = p_user_id) t;

  select array_agg(slot_y * 6 + slot_x) into v_used_cells
    from user_showcases where user_id = p_user_id;
  v_used_cells := coalesce(v_used_cells, '{}'::int[]);
  if v_total_cells - coalesce(array_length(v_used_cells, 1), 0) < v_count then
    return json_build_object('ok', false, 'error', '빈 자리가 부족해요.');
  end if;

  for v_grading in
    select t.id as input_id, g.id, g.grade, g.card_id, g.user_id, t.ord
      from unnest(p_grading_ids) with ordinality as t(id, ord)
      left join psa_gradings g on g.id = t.id
     order by t.ord
  loop
    if v_grading.id is null or v_grading.user_id <> p_user_id then
      return json_build_object('ok', false, 'error', '소유하지 않은 슬랩이 포함돼 있어요.');
    end if;
    if v_grading.grade not in (9, 10) then
      return json_build_object('ok', false, 'error', 'PCL 9·10 슬랩만 전시 가능해요.');
    end if;
    if v_grading.id = any(v_main_ids) then
      return json_build_object('ok', false, 'error', '펫으로 등록된 슬랩은 전시할 수 없어요.');
    end if;
    if v_grading.id = any(v_def_ids) then
      return json_build_object('ok', false,
        'error', '체육관 방어 덱에 등록된 슬랩은 전시할 수 없어요.');
    end if;
    if exists (select 1 from showcase_cards sc where sc.grading_id = v_grading.id) then
      return json_build_object('ok', false, 'error', '이미 전시 중인 슬랩이 포함돼 있어요.');
    end if;
    if exists (
      select 1 from gifts gf
       where gf.grading_id = v_grading.id
         and gf.status = 'pending' and gf.expires_at > now()
    ) then
      return json_build_object('ok', false, 'error', '선물 대기 중인 슬랩이 포함돼 있어요.');
    end if;

    v_cell := null;
    for i in 0 .. v_total_cells - 1 loop
      if not (i = any(v_used_cells)) then
        v_cell := i; exit;
      end if;
    end loop;
    if v_cell is null then
      return json_build_object('ok', false, 'error', '빈 자리가 부족해요.');
    end if;
    v_used_cells := v_used_cells || v_cell;
    v_slot_x := v_cell % 6;
    v_slot_y := v_cell / 6;

    insert into user_showcases (user_id, showcase_type, slot_x, slot_y)
      values (p_user_id, p_showcase_type, v_slot_x, v_slot_y)
      returning id into v_new_showcase;
    insert into showcase_cards (showcase_id, slot_index, grading_id)
      values (v_new_showcase, 0, v_grading.id);
    v_created := v_created + 1;
  end loop;

  update users set points = points - v_total_cost
    where id = p_user_id returning points into v_new_points;

  return json_build_object('ok', true,
    'created_count', v_created,
    'total_cost', v_total_cost,
    'points', v_new_points);
end;
$$;

grant execute on function bulk_create_showcases(uuid, text, uuid[]) to anon, authenticated;

-- 11) 모든 유저 pet_score 일괄 재계산 (방어덱 합산 적용)
update users set pet_score = compute_user_pet_score(id);

notify pgrst, 'reload schema';
