-- ============================================================
-- 내 포켓몬 — 강화 / 레벨업 / 진화 시스템.
--
-- 데이터:
--   user_starter 에 xp (현재 레벨 누적), evolution_stage (0/1/2) 추가.
--   species 는 base 종 고정. 진화 시 stage 만 증가하고 클라이언트가
--   stage 에 맞는 dex/이름을 매핑(EVOLUTION_LINES).
--
-- 산식:
--   재료 EXP    SAR 20 / UR 200 / MUR 10000
--   동일 속성   재료.wild_type = 캐릭터 속성  →  ×1.03
--   롤          92% 일반 ×1.0 / 7% 대성공 ×1.2 / 1% 초대성공 ×1.5
--   레벨업      starter_level_exp(level) 누적 차감 (기획 그대로)
--   Lv.30 = MAX (이후 강화/진화 거부)
--
-- 진화:
--   stage=0 + level≥10  → 1차 (8종 + pikachu 까지 가능 / mew/mewtwo 제외)
--   stage=1 + level≥20  → 2차 (pikachu 는 1차에서 끝)
--   100% 성공.
-- ============================================================

alter table user_starter
  add column if not exists xp int not null default 0;
alter table user_starter
  add column if not exists evolution_stage int not null default 0;

-- ── 레벨별 필요 EXP 테이블 ──
create or replace function starter_level_exp(p_level int)
returns int
language sql
immutable
as $$
  select case p_level
    when 1  then 1200    when 2  then 1700    when 3  then 2300
    when 4  then 3000    when 5  then 3900    when 6  then 5000
    when 7  then 6300    when 8  then 7800    when 9  then 9500
    when 10 then 12000   when 11 then 15000   when 12 then 18500
    when 13 then 22500   when 14 then 27000   when 15 then 32000
    when 16 then 37500   when 17 then 43500   when 18 then 50000
    when 19 then 57000   when 20 then 70000   when 21 then 83000
    when 22 then 98000   when 23 then 115000  when 24 then 134000
    when 25 then 155000  when 26 then 178000  when 27 then 203000
    when 28 then 230000  when 29 then 260000
    else 0
  end
$$;

-- ── 종별 최대 진화 stage ──
create or replace function starter_max_stage(p_species text)
returns int
language sql
immutable
as $$
  select case p_species
    when 'pikachu'    then 1
    when 'charmander' then 2
    when 'squirtle'   then 2
    when 'bulbasaur'  then 2
    when 'gastly'     then 2
    when 'dratini'    then 2
    when 'pidgey'     then 2
    when 'piplup'     then 2
    when 'mew'        then 0
    when 'mewtwo'     then 0
    else 0
  end
$$;

-- ── 종별 속성 (서버 동일 매핑) ──
create or replace function starter_species_type(p_species text)
returns text
language sql
immutable
as $$
  select case p_species
    when 'pikachu'    then '전기'
    when 'charmander' then '불꽃'
    when 'squirtle'   then '물'
    when 'bulbasaur'  then '풀'
    when 'gastly'     then '고스트'
    when 'dratini'    then '드래곤'
    when 'pidgey'     then '비행'
    when 'piplup'     then '물'
    when 'mew'        then '에스퍼'
    when 'mewtwo'     then '에스퍼'
    else null
  end
$$;

-- ── 사용 중 grading_id 집합 (펫/전시/방어덱) ──
create or replace function starter_used_grading_ids(p_user_id uuid)
returns table(id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select unnest(coalesce(u.main_card_ids, '{}'::uuid[]))
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
    from gym_ownerships go where go.owner_user_id = p_user_id;
$$;

grant execute on function starter_used_grading_ids(uuid) to anon, authenticated;

-- ── 재료 후보 목록 ──
create or replace function get_starter_materials(p_user_id uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(json_agg(jsonb_build_object(
    'id',        g.id,
    'card_id',   g.card_id,
    'rarity',    g.rarity,
    'wild_type', ct.wild_type,
    'graded_at', g.graded_at
  ) order by
      case g.rarity when 'MUR' then 0 when 'UR' then 1 when 'SAR' then 2 else 3 end,
      g.card_id), '[]'::json)
    from psa_gradings g
    left join card_types ct on ct.card_id = g.card_id
   where g.user_id = p_user_id
     and g.grade = 10
     and g.rarity in ('MUR','UR','SAR')
     and g.id not in (
       select uid.id from starter_used_grading_ids(p_user_id) uid
        where uid.id is not null
     );
$$;

grant execute on function get_starter_materials(uuid) to anon, authenticated;

-- ── get_my_starter — xp / evolution_stage 포함 ──
create or replace function get_my_starter(p_user_id uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select json_build_object(
       'species',          s.species,
       'nickname',         s.nickname,
       'level',            s.level,
       'caught_at',        s.caught_at,
       'xp',               coalesce(s.xp, 0),
       'evolution_stage',  coalesce(s.evolution_stage, 0),
       'next_exp',         case when s.level < 30 then starter_level_exp(s.level) else 0 end,
       'max_stage',        starter_max_stage(s.species),
       'is_max',           s.level >= 30
     )
       from user_starter s where s.user_id = p_user_id),
    null::json
  );
$$;

grant execute on function get_my_starter(uuid) to anon, authenticated;

-- ── 강화 RPC ──
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
  v_same_type       boolean;
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

  select array_agg(uid.id) into v_used_ids
    from starter_used_grading_ids(p_user_id) uid
   where uid.id is not null;

  -- 재료 검증: 본인 / PCL10 / MUR/UR/SAR / 사용 중 아님
  if exists (
    select 1 from unnest(p_grading_ids) gid
     where not exists (
       select 1 from psa_gradings g
        where g.id = gid
          and g.user_id = p_user_id
          and g.grade = 10
          and g.rarity in ('MUR','UR','SAR')
     ) or gid = any(coalesce(v_used_ids, '{}'::uuid[]))
  ) then
    return json_build_object('ok', false, 'error', '사용할 수 없는 재료가 포함되어 있어요.');
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

    v_same_type := (v_record.wild_type = v_meta_type);
    if v_same_type then
      v_base_exp := floor(v_base_exp * 1.03)::int;
    end if;

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
      'same_type',  v_same_type,
      'grade',      v_grade_label,
      'exp',        v_per_card_exp
    );
  end loop;

  delete from psa_gradings where id = any(p_grading_ids);

  -- 레벨업 누적
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

  -- 진화 가능 여부 (stage 미만 + level 도달)
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

-- ── 진화 RPC ──
create or replace function evolve_my_starter(p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_starter user_starter%rowtype;
  v_max     int;
  v_can     boolean := false;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  select * into v_starter from user_starter where user_id = p_user_id for update;
  if not found then
    return json_build_object('ok', false, 'error', '내 포켓몬을 먼저 등록해 주세요.');
  end if;

  v_max := starter_max_stage(v_starter.species);
  if v_starter.evolution_stage >= v_max then
    return json_build_object('ok', false, 'error', '더 이상 진화할 수 없어요.');
  end if;

  if v_starter.evolution_stage = 0 and v_starter.level >= 10 then
    v_can := true;
  elsif v_starter.evolution_stage = 1 and v_starter.level >= 20 then
    v_can := true;
  end if;

  if not v_can then
    return json_build_object('ok', false, 'error', '진화할 수 있는 레벨이 아니에요.');
  end if;

  update user_starter
     set evolution_stage = evolution_stage + 1
   where user_id = p_user_id
   returning * into v_starter;

  return json_build_object(
    'ok',              true,
    'evolution_stage', v_starter.evolution_stage,
    'level',           v_starter.level
  );
end;
$$;

grant execute on function evolve_my_starter(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
