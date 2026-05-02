-- ============================================================
-- 내 포켓몬 — 먹이 재료를 "같은 속성"만 사용 가능하도록 제한.
--
-- 변경:
--   1) get_starter_materials  → 캐릭터 속성과 같은 wild_type 슬랩만 반환.
--      (이전엔 모든 PCL10 MUR/UR/SAR 슬랩을 반환하고 동일 속성에 +3% 보너스만
--      줬음. 이제 다른 속성은 아예 재료 후보에서 제외.)
--   2) enhance_my_starter
--        - 검증 단계에 wild_type = 캐릭터 속성 강제. 다르면 거부.
--        - 동일 속성 +3% 보너스 제거 (모든 재료가 동일 속성이라 의미 없음).
--
-- 멱등: create or replace.
-- ============================================================

-- 1) 재료 후보 — 같은 속성만.
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
    'id',        g.id,
    'card_id',   g.card_id,
    'rarity',    g.rarity,
    'wild_type', ct.wild_type,
    'graded_at', g.graded_at
  ) order by
      case g.rarity when 'MUR' then 0 when 'UR' then 1 when 'SAR' then 2 else 3 end,
      g.card_id), '[]'::json)
    from psa_gradings g
    join card_types ct on ct.card_id = g.card_id
    join me on ct.wild_type = me.wild_type
   where g.user_id = p_user_id
     and g.grade = 10
     and g.rarity in ('MUR','UR','SAR')
     and g.id not in (
       select uid.id from starter_used_grading_ids(p_user_id) uid
        where uid.id is not null
     );
$$;

grant execute on function get_starter_materials(uuid) to anon, authenticated;

-- 2) 강화 RPC — 같은 속성 강제 + 보너스 제거.
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
  if exists (
    select 1 from unnest(p_grading_ids) gid
     where not exists (
       select 1 from psa_gradings g
        join card_types ct on ct.card_id = g.card_id
        where g.id = gid
          and g.user_id = p_user_id
          and g.grade = 10
          and g.rarity in ('MUR','UR','SAR')
          and ct.wild_type = v_meta_type
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

    -- 모든 재료가 같은 속성이라 보너스 분기는 제거.
    -- same_type 필드는 응답 호환성을 위해 항상 true 로 기록.

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

notify pgrst, 'reload schema';
