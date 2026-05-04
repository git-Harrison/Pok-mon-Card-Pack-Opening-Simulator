-- ============================================================
-- MUR 카드 dual-type 시스템 — 보조 속성 추가 + 매칭 로직 확장.
--
-- 컨셉:
--   기존 카드 1장 = 1속성 구조를 유지하되 MUR 카드만 예외적으로 보조 속성
--   하나를 더 가질 수 있게 확장. 체육관 속성 룰 (해당 체육관 속성에 맞는
--   카드만 등록/도전) 은 절대 깨지 않음 — MUR 은 두 속성 중 하나가 체육관
--   속성과 일치하면 OK.
--
-- 적용 범위:
--   1) card_types.wild_type_2 컬럼 신설 + 현재 카탈로그의 8장 MUR 매핑.
--   2) helper card_eligible_for_type(card_id, type) — 두 속성 중 하나라도
--      일치하면 true.
--   3) 먹이주기 (get_starter_materials / enhance_my_starter /
--      get_starter_companion_counts) — 같은 속성 검사를 either-type 으로.
--   4) 체육관 방어덱 (set_gym_defense_deck) — 등록 검증을 either-type 으로.
--   5) 체육관 도전덱 (resolve_gym_battle) — 도전 검증을 either-type 으로.
--   6) 체육관 전투 산식 (gym_pet_battle_stats) — type-match ATK 보너스가
--      either-type 일치 시 적용.
--   7) 체육관 전투 시뮬 (resolve_gym_battle 내) — 속성 상성 계산이
--      MUR 의 두 속성 중 유리한 매치업을 채택 (gym_eff_dual helper).
--   8) get_gyms_state — defender_pokemon[] 에 wild_type_2 노출 (UI 배지용).
--
-- 8장 MUR 매핑 (Pokémon canon 기반):
--   m1l-092 메가루카리오     바위 + 강철
--   m1s-092 메가가디안       에스퍼 + 페어리
--   m2-116  메가 리자몽 X    불꽃 + 드래곤
--   m2a-250 메가 망나뇽      얼음 + 드래곤
--   m3-117  메가지가르데     땅 + 드래곤
--   m4-120  메가 개굴닌자    물 + 악
--   sv11b-174 제크로무       드래곤 + 전기
--   sv11w-174 레시라무       드래곤 + 불꽃
--
-- 미반영:
--   - 유저 전투력 기반 추가 stat 보정 — 도입 안 함.
--   - UR/SAR/이하 단일 속성 카드는 기존 그대로 (wild_type_2 = null).
-- ============================================================

-- ── 1) 스키마 ──
alter table card_types
  add column if not exists wild_type_2 text;

-- 두 속성이 같으면 안 됨 — 데이터 정합성 가드.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'card_types_distinct_types'
  ) then
    alter table card_types
      add constraint card_types_distinct_types
      check (wild_type_2 is null or wild_type_2 <> wild_type);
  end if;
end $$;

-- ── 2) 8장 MUR 매핑 (멱등 UPDATE) ──
update card_types set wild_type_2 = '강철'   where card_id = 'm1l-092'   and rarity = 'MUR';
update card_types set wild_type_2 = '페어리' where card_id = 'm1s-092'   and rarity = 'MUR';
update card_types set wild_type_2 = '드래곤' where card_id = 'm2-116'    and rarity = 'MUR';
update card_types set wild_type_2 = '드래곤' where card_id = 'm2a-250'   and rarity = 'MUR';
update card_types set wild_type_2 = '드래곤' where card_id = 'm3-117'    and rarity = 'MUR';
update card_types set wild_type_2 = '악'     where card_id = 'm4-120'    and rarity = 'MUR';
update card_types set wild_type_2 = '전기'   where card_id = 'sv11b-174' and rarity = 'MUR';
update card_types set wild_type_2 = '불꽃'   where card_id = 'sv11w-174' and rarity = 'MUR';

-- ── 3) helper: card 가 특정 속성과 일치하는가 (either-type) ──
create or replace function card_eligible_for_type(p_card_id text, p_type text)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists(
    select 1 from card_types ct
     where ct.card_id = p_card_id
       and (ct.wild_type = p_type or ct.wild_type_2 = p_type)
  );
$$;

grant execute on function card_eligible_for_type(text, text) to anon, authenticated;

-- ── 4) helper: dual-type 속성 상성 — MUR 가 양쪽에 있어도 유리한 매치업 채택 ──
-- 공격자: 두 속성 중 더 강한 매치업을 고름 (max over atk_t).
-- 방어자: 두 속성 중 더 잘 막는 매치업을 고름 (min over def_t).
-- 결합 = max over atk_t of (min over def_t of eff(atk_t, def_t)).
-- card_id 가 null (NPC) 이면 그 쪽은 단일 속성으로 fallback.
create or replace function gym_eff_dual(
  p_atk_card_id text,
  p_atk_type text,
  p_def_card_id text,
  p_def_type text
) returns numeric
language sql
stable
set search_path = public, extensions
as $$
  with atk_types as (
    select p_atk_type as t
    union
    select ct.wild_type_2
      from card_types ct
     where p_atk_card_id is not null
       and ct.card_id = p_atk_card_id
       and ct.wild_type_2 is not null
  ),
  def_types as (
    select p_def_type as t
    union
    select ct.wild_type_2
      from card_types ct
     where p_def_card_id is not null
       and ct.card_id = p_def_card_id
       and ct.wild_type_2 is not null
  ),
  matrix as (
    select at.t as atype,
           min(gym_type_effectiveness(at.t, dt.t)) as min_eff
      from atk_types at, def_types dt
     group by at.t
  )
  select coalesce(max(min_eff), 1.0) from matrix;
$$;

grant execute on function gym_eff_dual(text, text, text, text) to anon, authenticated;

-- ── 5) get_starter_materials — wild_type_2 도 매칭 + 응답에 노출 ──
-- 20260698 정의 그대로 + (a) WHERE 조건에 wild_type_2 OR + (b) JSON 에
-- wild_type_2 필드 추가.
create or replace function get_starter_materials(p_user_id uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  with
    me as (
      select s.species, starter_species_type(s.species) as wild_type
        from user_starter s
       where s.user_id = p_user_id
    )
  select coalesce(json_agg(jsonb_build_object(
    'id',          g.id,
    'card_id',     g.card_id,
    'rarity',      g.rarity,
    'wild_type',   ct.wild_type,
    'wild_type_2', ct.wild_type_2,
    'graded_at',   g.graded_at
  ) order by
      case g.rarity when 'MUR' then 0 when 'UR' then 1 when 'SAR' then 2 else 3 end,
      g.card_id), '[]'::json)
    from psa_gradings g
    join card_types ct on ct.card_id = g.card_id
    join me on (ct.wild_type = me.wild_type or ct.wild_type_2 = me.wild_type)
   where g.user_id = p_user_id
     and g.grade = 10
     and g.rarity in ('MUR','UR','SAR')
     and g.id not in (
       select uid.id from starter_used_grading_ids(p_user_id) uid
        where uid.id is not null
     );
$$;

grant execute on function get_starter_materials(uuid) to anon, authenticated;

-- ── 6) enhance_my_starter — 같은 속성 검증을 either-type 으로 ──
-- 20260698 본문 그대로 + 검증 단계의 wild_type 매칭만 either-type.
create or replace function enhance_my_starter(
  p_user_id     uuid,
  p_grading_ids uuid[]
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_starter         user_starter%rowtype;
  v_meta_type       text;
  v_used_ids        uuid[];
  v_xp_gained       int := 0;
  v_log             jsonb := '[]'::jsonb;
  v_record          record;
  v_base_exp        int;
  v_roll            numeric;
  v_grade_label     text;
  v_mult            numeric;
  v_per_card_exp    int;
  v_pre_level       int;
  v_pre_stage       int;
  v_total_levels    int := 0;
  v_new_xp          int;
  v_new_level       int;
  v_required        int;
  v_evolved_eligible boolean := false;
  v_evolution_state  text := 'none';
  v_dup_count       int;
  v_input_count     int;
begin
  if p_grading_ids is null
     or coalesce(array_length(p_grading_ids, 1), 0) = 0 then
    return json_build_object('ok', false, 'error', '재료 카드를 선택해 주세요.');
  end if;

  v_input_count := array_length(p_grading_ids, 1);
  select count(distinct gid) into v_dup_count
    from unnest(p_grading_ids) gid;
  if v_dup_count <> v_input_count then
    return json_build_object('ok', false, 'error', '중복된 재료가 있어요.');
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  select * into v_starter from user_starter where user_id = p_user_id for update;
  if not found then
    return json_build_object('ok', false, 'error', '내 포켓몬을 먼저 등록해 주세요.');
  end if;
  if v_starter.level >= 30 then
    return json_build_object('ok', false, 'error', '이미 MAX 레벨이에요.');
  end if;

  v_meta_type := starter_species_type(v_starter.species);
  if v_meta_type is null then
    return json_build_object('ok', false, 'error', '캐릭터 속성을 확인할 수 없어요.');
  end if;

  select array_agg(uid.id) into v_used_ids
    from starter_used_grading_ids(p_user_id) uid
   where uid.id is not null;

  -- 재료 검증: 본인 / PCL10 / MUR/UR/SAR / 사용 중 아님 / 같은 속성
  -- (MUR 은 두 속성 중 하나라도 같으면 OK)
  if exists (
    select 1 from unnest(p_grading_ids) gid
     where not exists (
       select 1 from psa_gradings g
        join card_types ct on ct.card_id = g.card_id
        where g.id = gid
          and g.user_id = p_user_id
          and g.grade = 10
          and g.rarity in ('MUR','UR','SAR')
          and (ct.wild_type = v_meta_type or ct.wild_type_2 = v_meta_type)
     ) or gid = any(coalesce(v_used_ids, '{}'::uuid[]))
  ) then
    return json_build_object(
      'ok', false,
      'error', '같은 속성의 PCL10 카드만 먹이로 사용할 수 있어요.'
    );
  end if;

  v_pre_level := v_starter.level;
  v_pre_stage := v_starter.evolution_stage;

  for v_record in
    select g.id, g.rarity, ct.wild_type
      from unnest(p_grading_ids) gid
      join psa_gradings g on g.id = gid
      left join card_types ct on ct.card_id = g.card_id
  loop
    v_base_exp := case v_record.rarity
      when 'MUR' then 10000
      when 'UR'  then 200
      when 'SAR' then 20
      else 0
    end;

    v_roll := random() * 100;
    if v_roll < 1 then
      v_grade_label := 'crit';     v_mult := 1.5;
    elsif v_roll < 8 then
      v_grade_label := 'great';    v_mult := 1.2;
    else
      v_grade_label := 'normal';   v_mult := 1.0;
    end if;

    v_per_card_exp := floor(v_base_exp * v_mult)::int;
    v_xp_gained    := v_xp_gained + v_per_card_exp;

    v_log := v_log || jsonb_build_object(
      'grading_id', v_record.id,
      'rarity',     v_record.rarity,
      'same_type',  true,
      'grade',      v_grade_label,
      'exp',        v_per_card_exp
    );
  end loop;

  delete from psa_gradings where id = any(p_grading_ids);

  v_new_xp    := v_starter.xp + v_xp_gained;
  v_new_level := v_starter.level;
  while v_new_level < 30 loop
    v_required := starter_level_exp(v_new_level);
    exit when v_required = 0 or v_new_xp < v_required;
    v_new_xp       := v_new_xp - v_required;
    v_new_level    := v_new_level + 1;
    v_total_levels := v_total_levels + 1;
  end loop;
  if v_new_level >= 30 then
    v_new_xp := 0;
  end if;

  update user_starter
     set level = v_new_level,
         xp    = v_new_xp
   where user_id = p_user_id
   returning * into v_starter;

  if v_starter.evolution_stage < starter_max_stage(v_starter.species) then
    if v_starter.evolution_stage = 0 and v_starter.level >= 10 then
      v_evolved_eligible := true;
      v_evolution_state  := 'first';
    elsif v_starter.evolution_stage = 1 and v_starter.level >= 20 then
      v_evolved_eligible := true;
      v_evolution_state  := 'second';
    end if;
  end if;

  return json_build_object(
    'ok',                 true,
    'xp_gained',          v_xp_gained,
    'log',                v_log,
    'pre_level',          v_pre_level,
    'level',              v_starter.level,
    'levels_up',          v_total_levels,
    'xp',                 v_starter.xp,
    'next_exp',           case when v_starter.level < 30 then starter_level_exp(v_starter.level) else 0 end,
    'evolution_stage',    v_starter.evolution_stage,
    'max_stage',          starter_max_stage(v_starter.species),
    'evolution_eligible', v_evolved_eligible,
    'evolution_state',    v_evolution_state,
    'is_max',             v_starter.level >= 30
  );
end;
$$;

grant execute on function enhance_my_starter(uuid, uuid[]) to anon, authenticated;

-- ── 7) get_starter_companion_counts — either-type 카운트 ──
create or replace function get_starter_companion_counts(
  p_user_id uuid,
  p_type    text
) returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mur int;
  v_ur  int;
  v_sar int;
begin
  with used_grading_ids as (
    select unnest(coalesce(u.main_card_ids, '{}'::uuid[])) as id
      from users u where u.id = p_user_id
    union
    select unnest(
      flatten_pet_ids_by_type(coalesce(u.main_cards_by_type, '{}'::jsonb))
    ) from users u where u.id = p_user_id
    union
    select sc.grading_id
      from showcase_cards sc
      join user_showcases us on us.id = sc.showcase_id
     where us.user_id = p_user_id
       and sc.grading_id is not null
    union
    select unnest(coalesce(go.defense_pet_ids, '{}'::uuid[]))
      from gym_ownerships go where go.owner_user_id = p_user_id
  ),
  available_cards as (
    select distinct g.card_id, g.rarity
      from psa_gradings g
      join card_types ct on ct.card_id = g.card_id
     where g.user_id = p_user_id
       and g.grade   = 10
       and (ct.wild_type = p_type or ct.wild_type_2 = p_type)
       and g.rarity in ('MUR', 'UR', 'SAR')
       and g.id not in (select id from used_grading_ids where id is not null)
  )
  select
    coalesce(sum(case when rarity = 'MUR' then 1 else 0 end), 0)::int,
    coalesce(sum(case when rarity = 'UR'  then 1 else 0 end), 0)::int,
    coalesce(sum(case when rarity = 'SAR' then 1 else 0 end), 0)::int
    into v_mur, v_ur, v_sar
    from available_cards;

  return json_build_object(
    'mur', coalesce(v_mur, 0),
    'ur',  coalesce(v_ur,  0),
    'sar', coalesce(v_sar, 0)
  );
end;
$$;

grant execute on function get_starter_companion_counts(uuid, text)
  to anon, authenticated;

-- ── 8) gym_pet_battle_stats — type-match 보너스가 either-type 일치 시 적용 ──
-- 20260700 정의 그대로 + (7) 분기에서 wild_type_2 도 검사.
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
  v_pet_type text;
  v_card_t2 text;
  v_base_hp int;
  v_base_atk int;
  v_hp numeric;
  v_atk numeric;
  v_valid_types constant text[] := array[
    '노말','불꽃','물','풀','전기','얼음','격투','독','땅',
    '비행','에스퍼','벌레','바위','고스트','드래곤','악','강철','페어리'
  ];
begin
  select g.id, g.card_id, g.grade, g.rarity into v_grading
    from psa_gradings g where g.id = p_grading_id;
  if not found then return; end if;

  if v_grading.grade is null or v_grading.grade <> gym_required_grade() then
    return;
  end if;

  if p_pet_type = any(v_valid_types) then
    v_pet_type := p_pet_type;
  else
    v_pet_type := '노말';
  end if;

  -- MUR dual-type 보조 속성 (없으면 null).
  select ct.wild_type_2 into v_card_t2
    from card_types ct where ct.card_id = v_grading.card_id;

  select gs.hp, gs.atk into v_base_hp, v_base_atk
    from gym_rarity_base_stats(v_grading.rarity) gs;

  v_hp  := v_base_hp::numeric;
  v_atk := v_base_atk::numeric;

  if p_is_defender then
    v_hp  := v_hp  * gym_defender_hp_multiplier();
    v_atk := v_atk * gym_defender_atk_multiplier();
  else
    v_hp  := v_hp  * gym_attacker_hp_multiplier();
    v_atk := v_atk * gym_attacker_atk_multiplier();
  end if;

  if v_grading.rarity = 'MUR' and not p_is_defender then
    v_atk := v_atk * gym_mur_attack_multiplier();
  end if;

  -- (7) 체육관 속성 일치 ATK 보너스 — MUR 은 두 속성 중 하나라도 일치하면 적용.
  if v_pet_type = p_gym_type
     or (v_card_t2 is not null and v_card_t2 = p_gym_type) then
    v_atk := v_atk * gym_type_match_multiplier();
  end if;

  if v_grading.rarity = 'MUR' and p_is_defender then
    v_hp  := v_hp  * gym_mur_defender_hp_multiplier();
    v_atk := v_atk * gym_mur_defender_atk_multiplier();
  end if;

  hp := round(v_hp)::int;
  atk := round(v_atk)::int;
  type := v_pet_type;
  name := v_grading.card_id;
  rarity := v_grading.rarity;
  grade := v_grading.grade;
  card_id := v_grading.card_id;
  return next;
end;
$$;

grant execute on function gym_pet_battle_stats(uuid, int, int, text, text, boolean)
  to anon, authenticated;
grant execute on function gym_pet_battle_stats(uuid, int, int, text, text)
  to anon, authenticated;

-- ── 9) set_gym_defense_deck — either-type 등록 허용 + 저장은 gym.type 으로 ──
-- 20260620 본문 그대로 + 검증 변경 + p_pet_types 를 정규화.
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

  -- 카드의 두 속성 중 하나라도 체육관 속성과 같아야 등록 가능.
  -- 정규화: 등록 후 defense_pet_types 에는 일관되게 gym.type 을 저장
  -- (실제 매칭이 일어난 속성). UI 가 복잡한 분기를 안 해도 됨.
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

-- ── 10) resolve_gym_battle — either-type 도전덱 검증 + dual-type eff 사용 ──
-- 20260686 본문 그대로 + (a) 도전덱 검증 + (b) 시뮬 v_eff 계산.
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

  -- 도전덱 카드의 두 속성 중 하나라도 체육관 속성과 같아야 함.
  -- p_pet_types 는 무시하고 card_eligible_for_type 으로 검증, 정규화.
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

  -- 턴 시뮬 — 20260660 turn-order fix 그대로. eff 계산만 dual-type 헬퍼
  -- 로 교체 (MUR 가 양쪽 어디에 있어도 유리한 매치업 채택).
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

-- ── 11) get_gyms_state — defender_pokemon[] 에 wild_type_2 노출 ──
-- 20260700 정의 그대로 + jsonb_build_object 에 wild_type_2 한 줄 추가.
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
        'has_defense_deck',
          (o.defense_pet_ids is not null
            and coalesce(array_length(o.defense_pet_ids, 1), 0) = 3),
        'defender_pokemon',
          case when o.defense_pet_ids is not null
                and coalesce(array_length(o.defense_pet_ids, 1), 0) = 3
          then (
            select coalesce(jsonb_agg(jsonb_build_object(
              'slot', t.idx,
              'grading_id', t.pid,
              'card_id', g2.card_id,
              'type', o.defense_pet_types[t.idx],
              -- MUR 보조 속성 (없으면 null) — UI 두 배지 렌더링용.
              'wild_type_2',
                case when g2.id is null then null
                else (select ct2.wild_type_2 from card_types ct2
                       where ct2.card_id = g2.card_id) end,
              'rarity', g2.rarity, 'grade', g2.grade,
              'display_hp',
                case when g2.id is null then null
                else (select ds.hp from gym_defender_display_stats(
                  g2.rarity, g2.grade,
                  o.defense_pet_types[t.idx], g.type) ds) end,
              'display_atk',
                case when g2.id is null then null
                else (select ds.atk from gym_defender_display_stats(
                  g2.rarity, g2.grade,
                  o.defense_pet_types[t.idx], g.type) ds) end
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

notify pgrst, 'reload schema';

-- 마이그레이션: 20260703_mur_dual_type.sql
