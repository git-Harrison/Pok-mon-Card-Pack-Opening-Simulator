-- ============================================================
-- 체육관 Phase 2-4 — 전투 엔진 + 보상 + 보호 연장 + 자동 정리
--
-- 모든 중요한 상태 변경은 서버 권위. 클라이언트는 펫 grading_id 3개와
-- 출전 순서만 보낸다. 전투 시뮬레이션, 데미지 계산, 메달 지급, 소유권
-- 변경, 보호 쿨타임, 보상 모두 단일 트랜잭션 안에서 atomically 처리.
--
-- 추가 함수 / RPC:
--   1) gym_type_effectiveness(attacker text, defender text) — JSONB 기반
--      야생 typechart 미러. 정확히 같은 18종 / 같은 배율.
--   2) gym_rarity_stats(rarity) → (hp int, atk int) — 야생 BASE_BY_RARITY
--   3) gym_grade_mult(grade) → numeric — 야생 GRADE_MULT
--   4) gym_pet_battle_stats(grading_id, slot, center_power) →
--      (hp, atk, type, name, rarity, grade) — center_power 비율 보너스
--      포함. slot 1=10%, 2=8%, 3=6% (펫 기본 ATK 의 1.5x 상한).
--   5) gym_compute_user_center_power(user_id) → int — 기존 랭킹 공식과
--      일치 (rarity_power × pcl_power 합 + pokedex_power_bonus +
--      pokedex_completion_bonus + pet_score).
--   6) resolve_gym_battle(user_id, gym_id, challenge_id, pet_grading_ids[3])
--      → json — 전투 시뮬레이션 + 결과 트랜잭션.
--   7) extend_gym_protection(user_id, gym_id) → json — 10,000,000P
--      차감 + 12시간 보호 갱신.
--   8) force_cleanup_stale_gym_challenges() → int — 5분 이상 active 인
--      도전을 자동으로 abandoned 처리. get_gyms_state 가 호출 직전 자동
--      실행.
--   9) get_gyms_state v2 — 1)cleanup 자동 호출 + 2)본인 메달 보유 여부
--      + 3)요약 통계 추가.
--  10) get_user_gym_medals(user_id) → json — 프로필 / 랭킹용 메달 목록.
--
-- 모든 DDL 멱등.
-- ============================================================

-- 1) gym_type_effectiveness — 18종 typechart (야생 typechart.ts 와 정합).
--    값: 0 (무효), 0.5 (별로), 2 (굉장), 1 (보통). 매치 없으면 1.
create or replace function gym_type_effectiveness(
  p_attacker text,
  p_defender text
) returns numeric
language plpgsql
immutable
set search_path = public, extensions
as $$
declare
  v jsonb := '{
    "노말":   {"고스트": 0, "바위": 0.5, "강철": 0.5},
    "불꽃":   {"풀": 2, "얼음": 2, "벌레": 2, "강철": 2, "물": 0.5, "바위": 0.5, "불꽃": 0.5, "드래곤": 0.5},
    "물":     {"불꽃": 2, "땅": 2, "바위": 2, "물": 0.5, "풀": 0.5, "드래곤": 0.5},
    "전기":   {"물": 2, "비행": 2, "풀": 0.5, "전기": 0.5, "드래곤": 0.5, "땅": 0},
    "풀":     {"물": 2, "땅": 2, "바위": 2, "불꽃": 0.5, "풀": 0.5, "독": 0.5, "비행": 0.5, "벌레": 0.5, "드래곤": 0.5, "강철": 0.5},
    "얼음":   {"풀": 2, "땅": 2, "비행": 2, "드래곤": 2, "불꽃": 0.5, "물": 0.5, "얼음": 0.5, "강철": 0.5},
    "격투":   {"노말": 2, "얼음": 2, "바위": 2, "악": 2, "강철": 2, "비행": 0.5, "에스퍼": 0.5, "벌레": 0.5, "페어리": 0.5, "고스트": 0},
    "땅":     {"불꽃": 2, "전기": 2, "독": 2, "바위": 2, "강철": 2, "풀": 0.5, "벌레": 0.5, "비행": 0},
    "비행":   {"풀": 2, "격투": 2, "벌레": 2, "전기": 0.5, "바위": 0.5, "강철": 0.5},
    "에스퍼": {"격투": 2, "독": 2, "강철": 0.5, "악": 0},
    "벌레":   {"풀": 2, "에스퍼": 2, "악": 2, "불꽃": 0.5, "격투": 0.5, "독": 0.5, "비행": 0.5, "고스트": 0.5, "강철": 0.5, "페어리": 0.5},
    "바위":   {"불꽃": 2, "얼음": 2, "비행": 2, "벌레": 2, "격투": 0.5, "땅": 0.5, "강철": 0.5},
    "고스트": {"고스트": 2, "에스퍼": 2, "악": 0.5, "노말": 0},
    "드래곤": {"드래곤": 2, "강철": 0.5, "페어리": 0},
    "악":     {"에스퍼": 2, "고스트": 2, "격투": 0.5, "악": 0.5, "페어리": 0.5},
    "강철":   {"얼음": 2, "바위": 2, "페어리": 2, "불꽃": 0.5, "물": 0.5, "전기": 0.5, "강철": 0.5},
    "페어리": {"격투": 2, "드래곤": 2, "악": 2, "불꽃": 0.5, "독": 0.5, "강철": 0.5},
    "독":     {"풀": 2, "페어리": 2, "독": 0.5, "땅": 0.5, "바위": 0.5, "고스트": 0.5, "강철": 0}
  }'::jsonb;
  v_val numeric;
begin
  v_val := (v -> p_attacker ->> p_defender)::numeric;
  return coalesce(v_val, 1);
exception
  when others then return 1;
end;
$$;

grant execute on function gym_type_effectiveness(text, text) to anon, authenticated;

-- 2) gym_rarity_stats — 야생 BASE_BY_RARITY 미러.
create or replace function gym_rarity_stats(p_rarity text)
returns table(hp int, atk int)
language sql
immutable
set search_path = public
as $$
  select
    case p_rarity
      when 'C'   then 30  when 'U'   then 34  when 'R'   then 38
      when 'RR'  then 42  when 'AR'  then 48  when 'SR'  then 55
      when 'MA'  then 60  when 'SAR' then 70  when 'UR'  then 80
      when 'MUR' then 95  else 30
    end as hp,
    case p_rarity
      when 'C'   then 8   when 'U'   then 9   when 'R'   then 10
      when 'RR'  then 12  when 'AR'  then 13  when 'SR'  then 15
      when 'MA'  then 16  when 'SAR' then 18  when 'UR'  then 20
      when 'MUR' then 24  else 8
    end as atk;
$$;

-- 3) gym_grade_mult — 야생 GRADE_MULT 미러.
create or replace function gym_grade_mult(p_grade int)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case p_grade
    when 10 then 2.0
    when 9  then 1.6
    when 8  then 1.3
    when 7  then 1.1
    else 1.0
  end::numeric;
$$;

-- 4) gym_compute_user_center_power — 기존 랭킹의 center_power 와 동일.
--    (showcase rarity_power × pcl_power) + pokedex_power_bonus +
--    pokedex_completion_bonus + pet_score.
create or replace function gym_compute_user_center_power(p_user_id uuid)
returns int
language sql
stable
set search_path = public, extensions
as $$
  select coalesce((
    select sum(rarity_power(g2.rarity) * pcl_power(g2.grade))::int
      from showcase_cards sc
      join user_showcases us on us.id = sc.showcase_id
      join psa_gradings g2 on g2.id = sc.grading_id
     where us.user_id = p_user_id
  ), 0)
  + pokedex_power_bonus(coalesce((
      select pokedex_count from users where id = p_user_id
    ), 0))
  + coalesce(pokedex_completion_bonus(p_user_id), 0)
  + coalesce((select pet_score from users where id = p_user_id), 0);
$$;

grant execute on function gym_compute_user_center_power(uuid) to anon, authenticated;

-- 5) gym_pet_battle_stats — 펫 슬롯의 전투 능력치 산출.
--    center_power × {0.10, 0.08, 0.06} 보너스, 펫 기본 ATK 의 1.5x 상한.
--    HP 는 보너스의 절반 (전투 길이 안정성). 체육관 속성과 일치하면
--    추가 ×1.05 공격 (세트 보너스).
--
--    펫 type 은 DB 에 카드 카탈로그가 없어 클라가 매핑해 보내는 값을
--    사용 (CARD_NAME_TO_TYPE 의 한국어 18 타입 중 하나). 서버는
--    유효한 타입인지만 검증. card_id 검증은 별도(grading 소유 + PCL10
--    + main_card_ids 등록).
create or replace function gym_pet_battle_stats(
  p_grading_id uuid,
  p_slot int,
  p_center_power int,
  p_gym_type text,
  p_pet_type text
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
    from psa_gradings g
   where g.id = p_grading_id;
  if not found then
    return;
  end if;

  v_card_name := v_grading.card_id;
  -- 클라가 보낸 type 을 유효성 검사. 매칭 안 되면 '노말' fallback.
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

  v_bonus_ratio := case p_slot
    when 1 then 0.10
    when 2 then 0.08
    when 3 then 0.06
    else 0
  end;
  v_bonus := round(coalesce(p_center_power, 0) * v_bonus_ratio)::int;

  -- 상한 — ATK 보너스는 펫 기본 ATK 의 1.5x 까지, HP 보너스는 절반에
  -- 다시 1.5x 까지. (전투력만으로 모든 결정 안 되도록 cap.)
  v_atk_bonus := least(v_bonus, round(v_base_atk * 1.5)::int);
  v_hp_bonus := least(round(v_bonus * 0.5)::int, round(v_base_hp * 1.5)::int);

  v_final_hp := v_base_hp + v_hp_bonus;
  v_final_atk := v_base_atk + v_atk_bonus;

  -- 체육관 속성과 일치 시 +5% 공격
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

grant execute on function gym_pet_battle_stats(uuid, int, int, text, text) to anon, authenticated;

-- 6) resolve_gym_battle — 전투 시뮬 + 결과 트랜잭션.
--    클라는 펫 grading_id 3개 (slot 1,2,3 출전 순서) 만 보낸다.
--    서버는: 챌린지 검증 → 펫 능력치 산출 → 3:3 시뮬 → 결과 따라
--      WIN: medal insert + ownership upsert (12h protection) + capture
--           reward + challenge won + battle log
--      LOSE: cooldown 10분 + challenge lost + battle log
--    Phase 4 의 무응답 자동 패배는 별도 RPC (force_cleanup_*) 가 처리.
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
  v_enemy record;
  -- 시뮬 상태 — 5MB 상한 충분, 6마리 분량.
  v_pet_states jsonb := '[]'::jsonb;
  v_enemy_states jsonb := '[]'::jsonb;
  v_pet_idx int := 1;
  v_enemy_idx int := 1;
  v_turn_log jsonb := '[]'::jsonb;
  v_turn int := 0;
  v_max_turns constant int := 200;          -- 무한 루프 가드
  v_pet_alive_hp int;
  v_enemy_alive_hp int;
  v_dmg int;
  v_eff numeric;
  v_jitter numeric;
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

  -- 1) 도전 검증
  select * into v_challenge
    from gym_challenges
   where id = p_challenge_id
   for update;
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

  -- 2) 체육관 + 메달 + 펫 ID 검증 (소유권 + PCL10 + 중복 제거)
  select * into v_gym from gyms where id = p_gym_id;
  select * into v_medal from gym_medals where gym_id = p_gym_id;

  select coalesce(main_card_ids, '{}'::uuid[]) into v_main_ids
    from users where id = p_user_id;
  if v_main_ids is null then v_main_ids := '{}'::uuid[]; end if;

  -- 모든 입력 펫 grading 이 user 소유 + PCL10 + 펫 등록 + 서로 다름.
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

  -- 3) center_power 산출
  v_center_power := gym_compute_user_center_power(p_user_id);
  if v_center_power < coalesce(v_gym.min_power, 0) then
    -- active 챌린지 abandoned 마감 후 차단.
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

  -- 4) 펫 3마리 능력치 + 적 3마리 로드. 시뮬용 HP 추적은 jsonb 배열.
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

  for v_enemy in
    select gp.slot, gp.name, gp.type, gp.dex, gp.hp, gp.atk, gp.def, gp.spd
      from gym_pokemon gp
     where gp.gym_id = p_gym_id
     order by gp.slot
  loop
    -- 체육관 속성과 일치하는 적은 +10% 공격
    declare
      v_e_atk int := v_enemy.atk;
    begin
      if v_enemy.type = v_gym.type then
        v_e_atk := round(v_e_atk * 1.10)::int;
      end if;
      v_enemy_states := v_enemy_states || jsonb_build_object(
        'slot', v_enemy.slot,
        'name', v_enemy.name,
        'type', v_enemy.type,
        'dex', v_enemy.dex,
        'hp_max', v_enemy.hp,
        'hp', v_enemy.hp,
        'atk', v_e_atk
      );
    end;
  end loop;

  -- 5) 시뮬 — 슬롯 순으로 1:1, 펫 → 적 → 다음 펫. 동시 공격이 아닌
  --    "이번 턴 누가 먼저" 는 고정 (펫 선공) 이라 결정 단순.
  --    TODO Phase 5 후속: spd 기반 선후공 (현재 펫 타입 카탈로그 미통합
  --    이라 일관 평가 어려움 → 펫 선공 고정).
  while v_pet_idx <= 3 and v_enemy_idx <= 3 and v_turn < v_max_turns loop
    v_turn := v_turn + 1;

    declare
      v_pet_atk_eff numeric;
      v_pet_atk int := (v_pet_states -> (v_pet_idx - 1) ->> 'atk')::int;
      v_pet_type text := v_pet_states -> (v_pet_idx - 1) ->> 'type';
      v_e_atk int := (v_enemy_states -> (v_enemy_idx - 1) ->> 'atk')::int;
      v_e_type text := v_enemy_states -> (v_enemy_idx - 1) ->> 'type';
      v_pet_hp int := (v_pet_states -> (v_pet_idx - 1) ->> 'hp')::int;
      v_e_hp int := (v_enemy_states -> (v_enemy_idx - 1) ->> 'hp')::int;
    begin
      -- 펫 → 적
      v_eff := gym_type_effectiveness(v_pet_type, v_e_type);
      v_jitter := 0.9 + (random() * 0.2);
      v_dmg := round(v_pet_atk * v_eff * v_jitter)::int;
      v_crit := random() < 0.05;
      if v_crit then v_dmg := round(v_dmg * 1.5)::int; end if;
      v_dmg := greatest(case when v_eff = 0 then 0 else 1 end, v_dmg);
      v_e_hp := greatest(0, v_e_hp - v_dmg);
      v_enemy_states := jsonb_set(
        v_enemy_states,
        array[(v_enemy_idx - 1)::text, 'hp'],
        to_jsonb(v_e_hp)
      );
      v_turn_log := v_turn_log || jsonb_build_object(
        'turn', v_turn,
        'side', 'pet',
        'attacker_slot', v_pet_idx,
        'defender_slot', v_enemy_idx,
        'damage', v_dmg,
        'eff', v_eff,
        'crit', v_crit,
        'enemy_hp_left', v_e_hp,
        'pet_hp_left', v_pet_hp
      );
      if v_e_hp <= 0 then
        v_enemy_idx := v_enemy_idx + 1;
        continue;
      end if;

      -- 적 → 펫
      v_eff := gym_type_effectiveness(v_e_type, v_pet_type);
      v_jitter := 0.9 + (random() * 0.2);
      v_dmg := round(v_e_atk * v_eff * v_jitter)::int;
      v_crit := random() < 0.05;
      if v_crit then v_dmg := round(v_dmg * 1.5)::int; end if;
      v_dmg := greatest(case when v_eff = 0 then 0 else 1 end, v_dmg);
      v_pet_hp := greatest(0, v_pet_hp - v_dmg);
      v_pet_states := jsonb_set(
        v_pet_states,
        array[(v_pet_idx - 1)::text, 'hp'],
        to_jsonb(v_pet_hp)
      );
      v_turn_log := v_turn_log || jsonb_build_object(
        'turn', v_turn,
        'side', 'enemy',
        'attacker_slot', v_enemy_idx,
        'defender_slot', v_pet_idx,
        'damage', v_dmg,
        'eff', v_eff,
        'crit', v_crit,
        'enemy_hp_left', v_e_hp,
        'pet_hp_left', v_pet_hp
      );
      if v_pet_hp <= 0 then
        v_pet_idx := v_pet_idx + 1;
        continue;
      end if;
    end;
  end loop;

  -- 6) 결과 판정
  v_pets_alive := 0; v_enemies_alive := 0;
  for i in 0..2 loop
    if (v_pet_states -> i ->> 'hp')::int > 0 then
      v_pets_alive := v_pets_alive + 1;
    end if;
    if (v_enemy_states -> i ->> 'hp')::int > 0 then
      v_enemies_alive := v_enemies_alive + 1;
    end if;
  end loop;
  v_winner := case when v_pets_alive > 0 and v_enemies_alive = 0 then 'won' else 'lost' end;

  -- 7) 결과 반영
  if v_winner = 'won' then
    -- 점령 보상 (난이도별)
    v_difficulty_mult := case v_gym.difficulty
      when 'EASY'   then 1.0
      when 'NORMAL' then 1.6
      when 'HARD'   then 2.4
      when 'BOSS'   then 4.0
      else 1.0
    end;
    v_capture_reward := round(150000 * v_difficulty_mult)::int;

    -- 메달 (이미 보유면 갱신 X — 첫 점령일 때만 earned_at 기록)
    if v_medal.id is not null then
      insert into user_gym_medals (user_id, gym_id, medal_id, used_pets)
        values (
          p_user_id,
          p_gym_id,
          v_medal.id,
          jsonb_build_object('pets', v_pet_states)
        )
        on conflict (user_id, gym_id) do nothing;
    end if;

    -- 소유권 + 12 시간 보호
    v_protection_until := now() + interval '12 hours';
    insert into gym_ownerships (gym_id, owner_user_id, captured_at, protection_until)
      values (p_gym_id, p_user_id, now(), v_protection_until)
      on conflict (gym_id) do update
        set owner_user_id = excluded.owner_user_id,
            captured_at = excluded.captured_at,
            protection_until = excluded.protection_until;

    -- 점령 보상 지급 + 기록
    update users set points = points + v_capture_reward
      where id = p_user_id
      returning points into v_user_points;
    insert into gym_rewards (user_id, gym_id, reward_type, amount)
      values (p_user_id, p_gym_id, 'capture', v_capture_reward);

    -- 챌린지 won 마감
    update gym_challenges
       set status = 'won', ended_at = now(), result = 'won'
     where id = p_challenge_id;
  else
    -- 패배 — 소유권/보호 변경 X. 메달 X. 재도전 쿨타임 8분.
    insert into gym_cooldowns (user_id, gym_id, cooldown_until)
      values (p_user_id, p_gym_id, now() + interval '8 minutes')
      on conflict (user_id, gym_id) do update
        set cooldown_until = excluded.cooldown_until;
    update gym_challenges
       set status = 'lost', ended_at = now(), result = 'lost'
     where id = p_challenge_id;
    select points into v_user_points from users where id = p_user_id;
  end if;

  -- 8) 전투 로그 저장
  insert into gym_battle_logs (
    challenge_id, gym_id, challenger_user_id, defender_user_id,
    result, used_pets, turn_log, started_at
  ) values (
    p_challenge_id, p_gym_id, p_user_id, null,
    v_winner,
    jsonb_build_object('pets', v_pet_states, 'enemies', v_enemy_states),
    v_turn_log,
    v_challenge.started_at
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

-- 7) extend_gym_protection — 10,000,000P 차감 + 12 시간 보호 갱신.
--    조건: 본인 소유 + 보호 끝남 + 다른 도전 없음. 멱등 X (포인트 차감).
create or replace function extend_gym_protection(
  p_user_id uuid,
  p_gym_id text
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_cost constant int := 10000000;
  v_owner record;
  v_user_points int;
  v_active record;
  v_new_until timestamptz;
begin
  if p_user_id is null or p_gym_id is null then
    return json_build_object('ok', false, 'error', '요청이 올바르지 않아요.');
  end if;

  perform pg_advisory_xact_lock(hashtext('gym:' || p_gym_id));

  select * into v_owner
    from gym_ownerships where gym_id = p_gym_id for update;
  if not found then
    return json_build_object('ok', false, 'error', '비점령 체육관입니다.');
  end if;
  if v_owner.owner_user_id <> p_user_id then
    return json_build_object('ok', false, 'error', '체육관 소유자만 보호 연장할 수 있어요.');
  end if;
  if v_owner.protection_until > now() then
    return json_build_object(
      'ok', false,
      'error', '현재 보호 중인 체육관입니다.',
      'protection_until', v_owner.protection_until
    );
  end if;

  -- 도전 중이면 거부
  select * into v_active
    from gym_challenges
   where gym_id = p_gym_id and status = 'active'
   limit 1;
  if found then
    return json_build_object(
      'ok', false,
      'error', '이미 다른 트레이너가 도전 중이에요.'
    );
  end if;

  -- 포인트 차감 + 보호 갱신 (한 트랜잭션)
  select points into v_user_points from users where id = p_user_id for update;
  if coalesce(v_user_points, 0) < v_cost then
    return json_build_object(
      'ok', false,
      'error', '포인트가 부족해요. (10,000,000P 필요)',
      'points', coalesce(v_user_points, 0)
    );
  end if;

  v_new_until := now() + interval '12 hours';
  update users set points = points - v_cost
    where id = p_user_id
    returning points into v_user_points;
  update gym_ownerships set protection_until = v_new_until
    where gym_id = p_gym_id;
  insert into gym_rewards (user_id, gym_id, reward_type, amount)
    values (p_user_id, p_gym_id, 'extension', -v_cost);

  return json_build_object(
    'ok', true,
    'protection_until', v_new_until,
    'points', v_user_points,
    'cost', v_cost
  );
end;
$$;

grant execute on function extend_gym_protection(uuid, text) to anon, authenticated;

-- 8) force_cleanup_stale_gym_challenges — 5 분 이상 active 인 도전을
--    abandoned 처리. get_gyms_state 가 호출될 때마다 자동 실행 →
--    클라/서버 모두 무응답으로 잠긴 체육관이 영구 잠기지 않도록 보장.
create or replace function force_cleanup_stale_gym_challenges()
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_count int;
begin
  with stale as (
    update gym_challenges
       set status = 'abandoned',
           ended_at = now(),
           result = 'timeout'
     where status = 'active'
       and started_at < now() - interval '5 minutes'
    returning id
  )
  select count(*)::int into v_count from stale;
  return coalesce(v_count, 0);
end;
$$;

grant execute on function force_cleanup_stale_gym_challenges() to anon, authenticated;

-- 9) get_gyms_state v2 — cleanup 자동 호출 + 본인 메달 보유 여부.
create or replace function get_gyms_state(p_user_id uuid default null)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_rows json;
begin
  -- 호출 시마다 stale 자동 청소 — 어떤 클라가 안 들어와도 5분 후 다른
  -- 클라가 새로고침할 때 정리됨.
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
        'captured_at', o.captured_at,
        'protection_until', o.protection_until
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

-- 10) get_user_gym_medals — 프로필 / 랭킹 / 다른 유저 프로필에서 사용.
create or replace function get_user_gym_medals(p_user_id uuid)
returns json
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(
    json_agg(json_build_object(
      'gym_id', m.gym_id,
      'gym_name', g.name,
      'gym_type', g.type,
      'gym_difficulty', g.difficulty,
      'medal_id', gm.id,
      'medal_name', gm.name,
      'medal_description', gm.description,
      'earned_at', m.earned_at,
      'used_pets', m.used_pets,
      'currently_owned', (
        select o.owner_user_id = p_user_id
          from gym_ownerships o where o.gym_id = m.gym_id
      )
    ) order by m.earned_at desc),
    '[]'::json
  )
  from user_gym_medals m
  join gyms g on g.id = m.gym_id
  join gym_medals gm on gm.id = m.medal_id
  where m.user_id = p_user_id;
$$;

grant execute on function get_user_gym_medals(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
