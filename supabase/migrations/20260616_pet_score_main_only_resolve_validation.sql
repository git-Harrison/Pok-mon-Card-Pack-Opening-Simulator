-- ============================================================
-- Round 2 Phase 2+3 — 펫 점수에서 방어덱 제외 + 자동승리 버그 수정.
--
-- 사용자 스펙 1-5: "방어덱 등록 카드/펫은 펫 점수/펫 전투력 계산에서
-- 제외" — 현재(20260598) compute_user_pet_score 가 main_card_ids
-- UNION defense_pet_ids 라 방어덱 카드도 점수에 들어감. spec 위반.
--
-- 사용자 스펙 1-1: "상대 방어덱 스탯이 ? 로 표시되고 자동 승리되는
-- 버그." 원인 추적: resolve_gym_battle 의 defender 빌드 루프가 stale
-- defense_pet_ids (deleted gradings) 일 때 gym_pet_battle_stats 가
-- 빈 행을 반환하는데, 코드가 v_def_pet record 가 null 인 채로 jsonb
-- 빌드하면서 hp/atk = null 로 들어감. 이후 비교가 NULL > 0 = NULL
-- (false) 라 enemy alive 카운트 0 → 자동 won. 추가로 challenger
-- 펫이 등록(main_card_ids) 됐는지도 늦게 체크해 wallet/showcase 단계
-- 의 race 가능성 존재.
--
-- 조치:
--   1) compute_user_pet_score → main_card_ids 만. 방어덱 union 폐기.
--      spec 1-5 와 정확히 일치. 모든 유저 pet_score 즉시 재계산.
--   2) resolve_gym_battle — 방어덱 빌드 루프 안에 row 누락 / NULL
--      hp,atk 검증 가드. 어느 슬롯 하나라도 stale 이면 challenge
--      abandoned + json error. 자동 승리 차단.
--   3) defense 빌드 후 v_enemy_states 의 길이가 3 (defense) 또는
--      gym_pokemon NPC 수와 일치하는지 사후 검증. 빈 enemy_states 면
--      battle 진입 X.
--   4) v_pet_states/v_enemy_states 인덱스 접근 시 null 가드 추가.
-- ============================================================

-- ── 1) compute_user_pet_score: main_card_ids 만 ──
create or replace function compute_user_pet_score(p_user_id uuid)
returns int
language sql
stable
set search_path = public, extensions
as $$
  select coalesce(sum(rarity_score(g.rarity) * 15), 0)::int
    from psa_gradings g
   where g.user_id = p_user_id
     and g.grade = 10
     and g.id = any(coalesce(
       (select main_card_ids from users where id = p_user_id),
       '{}'::uuid[]
     ));
$$;

grant execute on function compute_user_pet_score(uuid) to anon, authenticated;

-- pet_score_for 도 동일 시그니처로 main 만 — defense 합산 폐기.
create or replace function pet_score_for(p_grading_ids uuid[])
returns int
language sql
stable
set search_path = public, extensions
as $$
  select coalesce(sum(rarity_score(g.rarity) * 15), 0)::int
    from psa_gradings g
   where g.id = any(coalesce(p_grading_ids, '{}'::uuid[]))
     and g.grade = 10;
$$;

grant execute on function pet_score_for(uuid[]) to anon, authenticated;

-- 모든 유저 pet_score 즉시 재계산 — 방어덱 카드 빠지면서 일부 감소.
update users
   set pet_score = compute_user_pet_score(id);

-- ── 2) resolve_gym_battle 자동승리 버그 fix ──
-- 방어덱 빌드 루프 안에 NULL hp/atk 가드 추가. 빈/누락 행 발견 시
-- challenge 를 abandoned 로 마무리하고 사용자에게 명시적 에러 반환.
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

  -- 공격 펫 빌드
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

  -- 적 (방어덱 OR NPC) 빌드 — defender 스탯 누락 시 자동승리 방지.
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
          v_gym.type, v_owner_record.defense_pet_types[i], true);
      -- 핵심 가드: 방어덱 스탯 로딩 실패 (slab 삭제 / type 누락 등) →
      -- battle 진입 막고 challenge 종료, 명시적 에러. 자동 승리 차단.
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

  -- enemy_states 가 정확히 3 인지 확인. NPC 모드라도 gym_pokemon 이
  -- 3마리여야 함. 아니면 데이터 결손 → battle 중단.
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

notify pgrst, 'reload schema';
