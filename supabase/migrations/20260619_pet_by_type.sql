-- ============================================================
-- 펫 등록 구조 변경 — 전체 10개 → 속성별 3개씩 (spec 2-1).
--
-- 사용자 스펙:
--   "펫 등록 방식을 속성별 등록 구조로. 속성별로 펫 최대 3개씩.
--    예: 불 속성 3개, 물 속성 3개, 풀 속성 3개 등."
--
-- 18 type × 3 = 최대 54 슬롯 (실제로는 보유 카드 한도). 카드 type 은
-- DB 가 모름 (client SETS 데이터에만 있음) — 새 RPC 가 type 인자를
-- 받아 검증.
--
-- 데이터 모델: users.main_cards_by_type jsonb { "type": [uuid, ...] }.
-- 기존 main_card_ids 컬럼은 호환 위해 유지 (전환기). compute_user_pet
-- _score 가 두 컬럼 union 으로 계산 → 전환 중 pet_score 손실 없음.
-- 사용자가 새 구조로 펫 재등록하면 set_pet_for_type 가 main_card_ids
-- 에서도 자동 제거.
-- ============================================================

-- 1) 새 컬럼.
alter table users
  add column if not exists main_cards_by_type jsonb not null default '{}'::jsonb;

create index if not exists users_main_cards_by_type_gin
  on users using gin (main_cards_by_type);

-- 2) 헬퍼 — main_cards_by_type 의 모든 uuid 평탄화.
create or replace function flatten_pet_ids_by_type(p_data jsonb)
returns uuid[]
language sql
immutable
as $$
  select coalesce(array_agg(distinct (e.value)::uuid), '{}'::uuid[])
    from jsonb_each(coalesce(p_data, '{}'::jsonb)) k(key, val),
         jsonb_array_elements_text(val) e(value);
$$;

-- 3) compute_user_pet_score — main_card_ids ∪ main_cards_by_type.
--    spec 1-5: 방어덱 카드는 제외 (이미 main_card_ids/by_type 에 안 들어감).
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
    select unnest(flatten_pet_ids_by_type(main_cards_by_type)) as id
      from users where id = p_user_id
  )
  select coalesce(sum(rarity_score(g.rarity) * 15), 0)::int
    from psa_gradings g
   where g.id in (select id from all_ids)
     and g.grade = 10;
$$;

grant execute on function compute_user_pet_score(uuid) to anon, authenticated;

-- 4) set_pet_for_type — 한 type 의 슬롯 3 모두 atomic 갱신.
--    p_grading_ids 의 길이는 0~3. 각 ID 가 본인 PCL10 + 미전시 + 비방어덱.
--    같은 type 에 같은 카드 ID 중복 금지 (다른 type 에는 가능 — 속성
--    필터는 클라가 이미 거름).
create or replace function set_pet_for_type(
  p_user_id uuid,
  p_type text,
  p_grading_ids uuid[]
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ids uuid[];
  v_data jsonb;
  v_valid_count int;
  v_displayed int;
  v_def int;
  v_score int;
begin
  if p_user_id is null then
    return json_build_object('ok', false, 'error', '인증 필요.');
  end if;
  if p_type is null or length(p_type) = 0 then
    return json_build_object('ok', false, 'error', '속성을 지정해주세요.');
  end if;

  v_ids := coalesce(p_grading_ids, '{}'::uuid[]);
  if coalesce(array_length(v_ids, 1), 0) > 3 then
    return json_build_object('ok', false,
      'error', '한 속성에 최대 3마리까지만 등록할 수 있어요.');
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  if array_length(v_ids, 1) is not null then
    -- 중복 ID 거부.
    if (select count(distinct id) from unnest(v_ids) as id) <> array_length(v_ids, 1) then
      return json_build_object('ok', false, 'error', '같은 슬랩을 두 슬롯에 넣을 수 없어요.');
    end if;

    select count(*)::int into v_valid_count
      from psa_gradings g
     where g.id = any(v_ids) and g.user_id = p_user_id and g.grade = 10;
    if v_valid_count <> array_length(v_ids, 1) then
      return json_build_object('ok', false, 'error',
        '본인의 PCL10 슬랩만 펫으로 등록할 수 있어요.');
    end if;

    select count(*)::int into v_displayed
      from showcase_cards where grading_id = any(v_ids);
    if v_displayed > 0 then
      return json_build_object('ok', false, 'error',
        '전시 중인 슬랩은 펫으로 등록할 수 없어요.');
    end if;

    select count(*)::int into v_def
      from gym_ownerships
     where owner_user_id = p_user_id and defense_pet_ids && v_ids;
    if v_def > 0 then
      return json_build_object('ok', false, 'error',
        '방어 덱에 등록된 슬랩이 포함돼 있어요. 방어 덱 해제 후 다시 시도하세요.');
    end if;

    -- 같은 card_id 가 다른 type 슬롯에 이미 등록돼 있는지 검사.
    if exists (
      select 1
        from psa_gradings g_new
        join (
          select (e.value)::uuid as other_id, k.key as other_type
            from users u,
                 jsonb_each(coalesce(u.main_cards_by_type, '{}'::jsonb)) k(key, value),
                 jsonb_array_elements_text(k.value) e
           where u.id = p_user_id
        ) others on others.other_type <> p_type
        join psa_gradings g_other on g_other.id = others.other_id
       where g_new.id = any(v_ids)
         and g_new.card_id = g_other.card_id
         and g_new.id <> g_other.id
    ) then
      return json_build_object('ok', false, 'error',
        '같은 카드가 다른 속성 슬롯에 이미 있어요.');
    end if;
  end if;

  -- 갱신 — 신규/구 카드 union 에서 빠진 것 main_card_ids 에서도 청소.
  v_data := coalesce(
    (select main_cards_by_type from users where id = p_user_id),
    '{}'::jsonb
  );
  v_data := jsonb_set(v_data, array[p_type], to_jsonb(v_ids), true);

  update users
     set main_cards_by_type = v_data,
         -- 기존 main_card_ids 에서도 새 type slot 에 들어간 것 빼기.
         main_card_ids = array(
           select id from unnest(coalesce(main_card_ids, '{}'::uuid[])) as id
            where not (id = any(v_ids))
         )
   where id = p_user_id;

  v_score := compute_user_pet_score(p_user_id);
  update users set pet_score = v_score where id = p_user_id;

  return json_build_object('ok', true,
    'main_cards_by_type', v_data,
    'pet_score', v_score);
end;
$$;

grant execute on function set_pet_for_type(uuid, text, uuid[]) to anon, authenticated;

-- 5) get_main_cards_by_type — 클라 fetch 용.
create or replace function get_main_cards_by_type(p_user_id uuid)
returns json
language sql
stable
set search_path = public, extensions
as $$
  select coalesce(main_cards_by_type, '{}'::jsonb)::json
    from users where id = p_user_id;
$$;

grant execute on function get_main_cards_by_type(uuid) to anon, authenticated;

-- 6) get_profile 도 main_cards_by_type 노출 + main_cards_by_type 내
--    슬랩의 hydrated 정보 (card_id/rarity/grade) 를 전달.
create or replace function get_profile(p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_character text;
  v_ids uuid[];
  v_pet_score int;
  v_cards jsonb;
  v_by_type jsonb;
  v_by_type_cards jsonb;
  v_center_power int := 0;
  v_pokedex_count int := 0;
  v_pokedex_bonus int := 0;
  v_pokedex_completion int := 0;
  v_gym_buff int := 0;
begin
  select "character", main_card_ids,
         coalesce(pet_score, 0),
         coalesce(pokedex_count, 0),
         coalesce(main_cards_by_type, '{}'::jsonb)
    into v_character, v_ids, v_pet_score, v_pokedex_count, v_by_type
    from users
   where id = p_user_id;
  if not found then
    return json_build_object('ok', false, 'error', '사용자를 찾을 수 없습니다.');
  end if;

  v_ids := coalesce(v_ids, '{}'::uuid[]);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', g.id, 'card_id', g.card_id,
           'grade', g.grade, 'rarity', g.rarity,
           'graded_at', g.graded_at
         ) order by array_position(v_ids, g.id)), '[]'::jsonb)
    into v_cards
    from psa_gradings g
   where g.id = any(v_ids)
     and g.user_id = p_user_id
     and g.grade = 10;

  -- by_type 의 각 type 슬롯을 hydrated 카드 정보로 변환.
  -- { "type": [ {id, card_id, rarity, grade}, ... ] }.
  select coalesce(jsonb_object_agg(t.key, t.cards), '{}'::jsonb)
    into v_by_type_cards
    from (
      select k.key,
             coalesce(
               (select jsonb_agg(
                  jsonb_build_object(
                    'id', g.id, 'card_id', g.card_id,
                    'rarity', g.rarity, 'grade', g.grade,
                    'graded_at', g.graded_at
                  )
                  order by array_position(
                    array(select (e.value)::uuid from jsonb_array_elements_text(k.value) e),
                    g.id
                  )
                )
                from psa_gradings g
                where g.user_id = p_user_id
                  and g.id in (
                    select (e.value)::uuid
                      from jsonb_array_elements_text(k.value) e
                  )),
               '[]'::jsonb
             ) as cards
        from jsonb_each(coalesce(v_by_type, '{}'::jsonb)) k(key, value)
    ) t;

  select compute_user_pet_score(p_user_id) into v_pet_score;
  update users set pet_score = v_pet_score where id = p_user_id;

  select coalesce(sum(showcase_power(g2.rarity, g2.grade))::int, 0)
    into v_center_power
    from showcase_cards sc
    join user_showcases us on us.id = sc.showcase_id
    join psa_gradings g2 on g2.id = sc.grading_id
   where us.user_id = p_user_id;

  begin v_pokedex_bonus := pokedex_power_bonus(p_user_id);
  exception when undefined_function then v_pokedex_bonus := 0; end;
  begin v_pokedex_completion := coalesce(pokedex_completion_bonus(p_user_id), 0);
  exception when undefined_function then v_pokedex_completion := 0; end;

  -- 보유 메달 1개당 +10,000.
  select count(*)::int * 10000 into v_gym_buff
    from user_gym_medals where user_id = p_user_id;

  return json_build_object(
    'ok', true,
    'character', v_character,
    'character_locked', v_character is not null,
    'main_card_ids', to_jsonb(v_ids),
    'main_cards', v_cards,
    'main_cards_by_type', coalesce(v_by_type_cards, '{}'::jsonb),
    'pet_score', v_pet_score,
    'center_power',
      v_center_power
      + v_pokedex_bonus
      + v_pokedex_completion
      + coalesce(v_pet_score, 0)
      + v_gym_buff,
    'pokedex_count', v_pokedex_count,
    'pokedex_bonus', v_pokedex_bonus,
    'pokedex_completion_bonus', v_pokedex_completion,
    'gym_buff', v_gym_buff);
end;
$$;

grant execute on function get_profile(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
