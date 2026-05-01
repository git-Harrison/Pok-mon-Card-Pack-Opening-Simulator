-- ============================================================
-- 내 포켓몬 — 캐릭터 선택 목록 정리.
--
-- 변경:
--   1) 선택 가능 종(species)을 새 10종으로 교체.
--      pikachu / charmander / bulbasaur / pidgey / poliwag /
--      gastly / chikorita / chimchar / geodude / caterpie
--      (기존 squirtle / dratini / piplup / mew / mewtwo 제외)
--   2) 종(species) 별 1유저 — 모든 유저 통틀어 같은 종 중복 선택 불가.
--      → user_starter.species 에 unique constraint.
--   3) 다른 유저가 이미 선택한 종 목록 RPC: get_taken_starter_species().
--   4) starter_species_type / starter_max_stage 매핑에 새 5종 추가.
--      (산식/EXP 테이블/진화 조건 등 기존 로직은 건드리지 않음)
--   5) pick_my_starter — allowed list 갱신 + 종 중복 검사.
--
-- 멱등: 모든 DDL 은 if not exists / create or replace 패턴.
-- ============================================================

-- 0) 새 화이트리스트에 들어 있지 않은 기존 row 정리. unique constraint
-- 부여 전에 정리해야 함. (테스트 등록만 있던 데이터라 영향 미미.)
delete from user_starter
 where species not in (
   'pikachu','charmander','bulbasaur','pidgey','poliwag',
   'gastly','chikorita','chimchar','geodude','caterpie'
 );

-- 1) species unique — 같은 종은 단 1명만 가질 수 있음.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'user_starter_species_unique'
  ) then
    alter table user_starter
      add constraint user_starter_species_unique unique (species);
  end if;
end $$;

-- 2) 종별 속성 — 새 5종 추가, 제거된 5종 매핑은 안전상 유지하지 않음.
create or replace function starter_species_type(p_species text)
returns text
language sql
immutable
as $$
  select case p_species
    when 'pikachu'    then '전기'
    when 'charmander' then '불꽃'
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

-- 3) 종별 최대 진화 stage — 새 5종 추가.
--    pikachu = 1 (피카츄 → 라이츄 — 기존 정책 유지)
--    그 외 9종 = 2 (3단 진화)
create or replace function starter_max_stage(p_species text)
returns int
language sql
immutable
as $$
  select case p_species
    when 'pikachu'    then 1
    when 'charmander' then 2
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

-- 4) 다른 유저(혹은 본인)가 이미 선택한 종 목록.
create or replace function get_taken_starter_species()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    json_agg(species order by species),
    '[]'::json
  )
    from user_starter;
$$;

grant execute on function get_taken_starter_species() to anon, authenticated;

-- 5) pick_my_starter — allowed list 갱신 + 종 중복 거부.
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
    'pikachu','charmander','bulbasaur','pidgey','poliwag',
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

  -- 동시성 — 같은 유저의 중복 호출 직렬화.
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  -- 본인이 이미 등록했는지.
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

  -- 다른 유저가 같은 종을 이미 가져갔는지.
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
  -- unique violation 예방적 캐치 (race condition 시 PG 가 raise).
  when unique_violation then
    return json_build_object(
      'ok', false,
      'error', '이 포켓몬은 방금 다른 트레이너가 데려갔어요.'
    );
end;
$$;

grant execute on function pick_my_starter(uuid, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
