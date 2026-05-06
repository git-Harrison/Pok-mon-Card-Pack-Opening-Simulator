-- ============================================================
-- dual-type 도입 후 기존 등록 데이터 재검증·정리.
--
-- 배경:
--   20260703 (dual-type 시스템) + 20260704 (MUR 1차 재지정 + UR 2차 추가)
--   적용으로 MUR 8장의 1차 속성 자체가 바뀌고, UR Pokémon 41장에 2차
--   속성이 추가됨. 그 결과 일부 기존 등록 데이터가 새 룰과 어긋남:
--     - users.main_cards_by_type 의 type slot 에 들어있는 카드의 (1차/2차)
--       어느 쪽도 slot type 과 일치하지 않을 수 있음.
--     - gym_ownerships.defense_pet_ids 에 등록된 카드가 체육관 속성과
--       어느 쪽도 일치하지 않을 수 있음.
--
-- 처리 방향:
--   1) main_cards_by_type 재구성 — 각 type slot 에서 어느 한쪽도 매칭
--      안 되는 카드만 제거 (나머지는 유지). 카드는 psa_gradings 에 그대로
--      있으므로 "순수 보유" 상태로 자동 복귀. pet_score 일괄 재계산.
--   2) gym_ownerships 정리 — 방어덱에 부적격 카드가 1장이라도 있으면
--      defense_pet_ids/defense_pet_types 통째 NULL (점령자가 재셋업).
--      방어덱은 정확히 3장이 있어야 의미가 있으므로 부분 제거 X.
--
-- 추가 픽스:
--   3) set_pet_for_type 검증을 either-type 으로 — 20260644 의 strict
--      primary-only 검사가 UR/MUR 의 wild_type_2 매칭 슬롯 등록을 거부
--      하던 회귀 fix.
--
-- 룰 그대로 유지:
--   - 펫 등록: SAR 1차만 / UR/MUR 1차 또는 2차 일치 시 가능.
--   - 체육관: 동일. 두 속성 모두 다르면 거부.
--   - 유저 전투력 기반 stat 보정 — 도입 안 함.
-- ============================================================

-- ── 1) main_cards_by_type 재구성 ──
do $$
declare
  u_rec record;
  type_rec record;
  new_by_type jsonb;
  valid_ids jsonb;
begin
  for u_rec in
    select id, coalesce(main_cards_by_type, '{}'::jsonb) as by_type
      from users
     where main_cards_by_type is not null
       and main_cards_by_type <> '{}'::jsonb
  loop
    new_by_type := '{}'::jsonb;
    for type_rec in
      select key as type_key, value as type_arr
        from jsonb_each(u_rec.by_type)
    loop
      -- type slot 안의 grading_id 중 (wild_type or wild_type_2 = type_key)
      -- 인 것만 보존. PCL10 + 본인 소유 가드도 유지.
      select coalesce(jsonb_agg(eid.value), '[]'::jsonb) into valid_ids
        from jsonb_array_elements_text(type_rec.type_arr) eid
       where exists (
         select 1 from psa_gradings g
         join card_types ct on ct.card_id = g.card_id
         where g.id = (eid.value)::uuid
           and g.user_id = u_rec.id
           and g.grade = 10
           and (ct.wild_type = type_rec.type_key
                or ct.wild_type_2 = type_rec.type_key)
       );
      if jsonb_array_length(valid_ids) > 0 then
        new_by_type := new_by_type
          || jsonb_build_object(type_rec.type_key, valid_ids);
      end if;
    end loop;
    if new_by_type is distinct from u_rec.by_type then
      update users set main_cards_by_type = new_by_type where id = u_rec.id;
    end if;
  end loop;
end $$;

-- ── 2) 모든 유저 pet_score 재계산 ──
update users set pet_score = compute_user_pet_score(id);

-- ── 3) gym_ownerships defense_pet_ids 재검증 ──
-- 방어덱 안에 부적격 카드가 1장이라도 있으면 통째 NULL → 점령자가
-- "방어덱 미설정" 상태로 변경 (NPC 경로로 도전 진행 가능). 점령 자체는
-- 유지 (gym_ownerships row 는 그대로). 점령자 본인이 새 카드로 다시
-- 셋업하면 됨.
do $$
declare
  o_rec record;
  v_gym_type text;
  v_bad int;
begin
  for o_rec in
    select gym_id, defense_pet_ids
      from gym_ownerships
     where defense_pet_ids is not null
       and coalesce(array_length(defense_pet_ids, 1), 0) > 0
  loop
    select g.type into v_gym_type from gyms g where g.id = o_rec.gym_id;
    if v_gym_type is null then continue; end if;

    select count(*)::int into v_bad
      from unnest(o_rec.defense_pet_ids) as pid
      left join psa_gradings g on g.id = pid
     where g.id is null
        or not card_eligible_for_type(g.card_id, v_gym_type);

    if v_bad > 0 then
      update gym_ownerships
         set defense_pet_ids = null,
             defense_pet_types = null
       where gym_id = o_rec.gym_id;
    end if;
  end loop;
end $$;

-- ── 4) set_pet_for_type — either-type 검증으로 교체 ──
-- 20260644 본문 그대로 + (NEW) type 검증 부분만 wild_type 또는 wild_type_2
-- 일치 허용. SAR 등 wild_type_2 가 null 인 카드는 자동으로 1차만 비교.
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
  v_invalid_count int;
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

    -- ▶ either-type 검증 — 카드의 1차 또는 2차 속성 중 하나라도 slot
    --    type 과 일치해야. 트레이너/null 1차 거부는 그대로 (1차가 null
    --    이면서 2차도 null 이면 양쪽 일치 X).
    select count(*)::int into v_invalid_count
      from psa_gradings g
      left join card_types ct on ct.card_id = g.card_id
     where g.id = any(v_ids)
       and (ct.wild_type is null
            or (ct.wild_type <> p_type
                and (ct.wild_type_2 is null or ct.wild_type_2 <> p_type)));
    if v_invalid_count > 0 then
      return json_build_object('ok', false,
        'error', format(
          '%s 속성 슬롯에는 %s 속성 포켓몬 카드만 등록할 수 있어요. ' ||
          'UR/MUR 은 1차/2차 속성 중 하나라도 일치해야 합니다.',
          p_type, p_type));
    end if;

    -- 같은 card_id 가 다른 type 슬롯에 이미 등록돼 있는지 검사 (그대로).
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

  v_data := coalesce(
    (select main_cards_by_type from users where id = p_user_id),
    '{}'::jsonb
  );
  v_data := jsonb_set(v_data, array[p_type], to_jsonb(v_ids), true);

  update users
     set main_cards_by_type = v_data,
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

notify pgrst, 'reload schema';

-- 마이그레이션: 20260705_dual_type_data_reconciliation.sql
