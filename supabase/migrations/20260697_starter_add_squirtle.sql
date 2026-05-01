-- ============================================================
-- 내 포켓몬 — 선택 가능 종에 squirtle(꼬부기) 복귀.
--
-- 변경:
--   1) pick_my_starter allowed list 에 squirtle 추가 (총 11종).
--   2) starter_species_type / starter_max_stage 에 squirtle 매핑 추가.
--      (꼬부기→어니부기→거북왕 — 3단 진화, 속성 물)
--   3) (재실행 안전성) 20260696 의 cleanup DELETE 와 동일한 패턴이지만,
--      squirtle 이 새 화이트리스트에 포함되므로 squirtle row 는 보존.
--      이 마이그레이션은 새 DELETE 를 추가하지 않음 — 기존 squirtle row 가
--      혹시 남아 있다면 그대로 가지고 있음.
--
-- 멱등: create or replace 패턴.
-- ============================================================

-- 1) 종별 속성 — squirtle 추가.
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
    when 'pidgey'     then '비행'
    when 'poliwag'    then '물'
    when 'gastly'     then '고스트'
    when 'chikorita'  then '풀'
    when 'chimchar'   then '불꽃'
    when 'geodude'    then '바위'
    when 'caterpie'   then '벌레'
    else null
  end
$$;

-- 2) 종별 최대 진화 stage — squirtle = 2 (3단 진화).
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
    when 'pidgey'     then 2
    when 'poliwag'    then 2
    when 'gastly'     then 2
    when 'chikorita'  then 2
    when 'chimchar'   then 2
    when 'geodude'    then 2
    when 'caterpie'   then 2
    else 0
  end
$$;

-- 3) pick_my_starter — allowed list 에 squirtle 추가.
create or replace function pick_my_starter(
  p_user_id  uuid,
  p_species  text,
  p_nickname text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing user_starter%rowtype;
  v_clean    text;
  v_taken_by uuid;
  v_allowed  constant text[] := array[
    'pikachu','charmander','squirtle','bulbasaur','pidgey','poliwag',
    'gastly','chikorita','chimchar','geodude','caterpie'
  ];
begin
  if p_species is null or not (p_species = any(v_allowed)) then
    return json_build_object('ok', false, 'error', '선택할 수 없는 포켓몬이에요.');
  end if;

  v_clean := nullif(btrim(coalesce(p_nickname, '')), '');
  if v_clean is null then
    return json_build_object('ok', false, 'error', '이름을 입력해주세요.');
  end if;
  if char_length(v_clean) > 12 then
    return json_build_object('ok', false, 'error', '이름은 12자 이하로 적어주세요.');
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  select * into v_existing from user_starter where user_id = p_user_id;
  if found then
    return json_build_object(
      'ok', false,
      'error', '이미 내 포켓몬을 정했어요.',
      'starter', json_build_object(
        'species',         v_existing.species,
        'nickname',        v_existing.nickname,
        'level',           v_existing.level,
        'caught_at',       v_existing.caught_at,
        'xp',              coalesce(v_existing.xp, 0),
        'evolution_stage', coalesce(v_existing.evolution_stage, 0),
        'next_exp',        case when v_existing.level < 30 then starter_level_exp(v_existing.level) else 0 end,
        'max_stage',       starter_max_stage(v_existing.species),
        'is_max',          v_existing.level >= 30
      )
    );
  end if;

  select user_id into v_taken_by from user_starter where species = p_species;
  if v_taken_by is not null then
    return json_build_object(
      'ok', false,
      'error', '이 포켓몬은 이미 다른 트레이너의 친구예요.'
    );
  end if;

  insert into user_starter (user_id, species, nickname, level)
    values (p_user_id, p_species, v_clean, 1);

  select * into v_existing from user_starter where user_id = p_user_id;
  return json_build_object(
    'ok', true,
    'starter', json_build_object(
      'species',         v_existing.species,
      'nickname',        v_existing.nickname,
      'level',           v_existing.level,
      'caught_at',       v_existing.caught_at,
      'xp',              coalesce(v_existing.xp, 0),
      'evolution_stage', coalesce(v_existing.evolution_stage, 0),
      'next_exp',        case when v_existing.level < 30 then starter_level_exp(v_existing.level) else 0 end,
      'max_stage',       starter_max_stage(v_existing.species),
      'is_max',          v_existing.level >= 30
    )
  );

exception
  when unique_violation then
    return json_build_object(
      'ok', false,
      'error', '이 포켓몬은 방금 다른 트레이너가 데려갔어요.'
    );
end;
$$;

grant execute on function pick_my_starter(uuid, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
