-- ============================================================
-- 펫 등록 type 검증 강화 + legacy main_card_ids 청소
--
-- 사용자 보고:
--   /users 펫 랭킹 탭에서 Switch (sv2a-209, 트레이너 카드, type=null)
--   가 등록 펫으로 노출. main_cards_by_type 에는 없는데 main_card_ids
--   (legacy) 에 박혀있어서 get_user_rankings 가 main_cards 에 포함시킴.
--
-- 근본 원인:
--   set_pet_for_type 가 "본인 PCL10 + 미전시 + 비방어덱 + 중복금지"
--   는 검증하지만 카드의 wild_type 이 null (트레이너/에너지/굿즈/
--   스타디움) 인 경우 또는 slot type 과 불일치하는 경우를 거부 안 함.
--   클라가 잘못된 호출을 하면 그대로 저장됨.
--
-- 픽스:
--   1) 모든 유저의 main_card_ids (legacy) 에서 wild_type IS NULL 인
--      카드 제거 + main_cards_by_type 안에 들어간 것도 제거 (중복).
--      pet_score 일괄 재계산.
--   2) set_pet_for_type 에 type 검증 추가:
--      · 등록하려는 모든 카드는 card_types 에 wild_type 이 NULL 이
--        아니어야 함 (포켓몬 카드만).
--      · 카드의 wild_type 이 슬롯 type 과 정확히 일치해야 함.
--      → 트레이너/잘못된 속성 슬롯 시도 시 에러 반환.
--
-- 의존성: 20260642 (card_types 테이블 seed) 가 먼저 적용되어 있어야 함.
-- ============================================================

-- ── 1) 모든 유저의 main_card_ids 청소 ──────────────────────

-- 1a) main_cards_by_type 에 이미 들어간 ID 는 main_card_ids 에서 제거.
update users u
   set main_card_ids = array(
     select id
       from unnest(coalesce(u.main_card_ids, '{}'::uuid[])) as id
      where not (id = any(flatten_pet_ids_by_type(coalesce(u.main_cards_by_type, '{}'::jsonb))))
   )
 where coalesce(array_length(u.main_card_ids, 1), 0) > 0;

-- 1b) main_card_ids 에 남아있는 카드 중 트레이너/null-type 카드 제거.
--     card_types 에 wild_type IS NULL 인 grading 들 모두 빼기.
update users u
   set main_card_ids = array(
     select id
       from unnest(coalesce(u.main_card_ids, '{}'::uuid[])) as id
      where exists (
        select 1
          from psa_gradings g
          join card_types ct on ct.card_id = g.card_id
         where g.id = id
           and ct.wild_type is not null
      )
   )
 where coalesce(array_length(u.main_card_ids, 1), 0) > 0;

-- 1c) 모든 유저 pet_score 재계산.
update users
   set pet_score = compute_user_pet_score(id);

-- ── 2) set_pet_for_type 에 type 검증 추가 ──────────────────

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

    -- ▶ NEW: 카드 type 검증 — 트레이너/null type 거부 + slot type 일치.
    select count(*)::int into v_invalid_count
      from psa_gradings g
      left join card_types ct on ct.card_id = g.card_id
     where g.id = any(v_ids)
       and (ct.wild_type is null or ct.wild_type <> p_type);
    if v_invalid_count > 0 then
      return json_build_object('ok', false,
        'error', format(
          '%s 속성 슬롯에는 %s 속성 포켓몬 카드만 등록할 수 있어요. ' ||
          '트레이너/에너지/굿즈는 펫으로 등록할 수 없습니다.',
          p_type, p_type));
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

  -- 갱신.
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
