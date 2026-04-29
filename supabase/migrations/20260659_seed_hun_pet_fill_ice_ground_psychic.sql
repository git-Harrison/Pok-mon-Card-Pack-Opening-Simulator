-- ============================================================
-- hun 펫 빈 슬롯 채움 — 얼음 / 땅 / 에스퍼 3 속성 한정.
--
-- 사용자 요구 (2026-04-29):
--   대상 속성 = {얼음, 땅, 에스퍼}.
--   · 각 속성 슬롯 최대 3 개, 빈 슬롯에만 채움.
--   · 기존 데이터 절대 덮어쓰기 X.
--   · PCL 10 + 속성 매칭 + 카탈로그 카드만.
--   · 우선순위: MUR > UR > SAR > SR.
--   · 같은 속성 슬롯 내 동일 card_id 중복 X.
--
-- 동작 (20260657 패턴, TYPES 만 3 속성으로 한정):
--   1) 3 type 순회.
--   2) 빈 슬롯 수 = 3 - 현재 등록 수.
--   3) card_types(wild_type, rarity ∈ MUR/UR/SAR/SR) AND hun 의 다른
--      type 슬롯에 동일 card_id 없음.
--   4) MUR(1)→UR(2)→SAR(3)→SR(4) → card_id asc.
--   5) hun PCL10 슬랩 있으면 재사용, 없으면 신규 insert.
--   6) main_cards_by_type[type] append + pet_score / pcl_10_wins 갱신.
--
-- 멱등 — 가득 찬 type skip, 후보 없으면 skip.
-- 의존성: 20260619 (main_cards_by_type), 20260642 (card_types).
-- ============================================================

do $$
declare
  v_user_id uuid;
  v_by_type jsonb;
  v_type text;
  v_current_ids uuid[];
  v_already_used_card_ids text[];
  v_needed int;
  v_card record;
  v_grading_id uuid;
  v_new_inserts int := 0;
  v_added_total int := 0;
  TYPES constant text[] := array['얼음', '땅', '에스퍼'];
begin
  select id into v_user_id from users where user_id = 'hun';
  if not found then
    raise notice 'user hun 미존재 — pet fill skip';
    return;
  end if;

  select coalesce(main_cards_by_type, '{}'::jsonb)
    into v_by_type
    from users where id = v_user_id;

  foreach v_type in array TYPES loop
    v_current_ids := array(
      select (e.value)::uuid
        from jsonb_array_elements_text(
          coalesce(v_by_type -> v_type, '[]'::jsonb)
        ) e
    );
    v_needed := 3 - coalesce(array_length(v_current_ids, 1), 0);

    if v_needed <= 0 then
      raise notice '  [%] 이미 가득 — skip', v_type;
      continue;
    end if;

    -- cross-type 중복 검사용 — hun 의 모든 펫 슬롯에 들어간 card_id.
    select coalesce(array_agg(distinct g.card_id), '{}'::text[])
      into v_already_used_card_ids
      from psa_gradings g
     where g.id = any(
       array(
         select unnest(coalesce(main_card_ids, '{}'::uuid[]))
           from users where id = v_user_id
         union
         select unnest(flatten_pet_ids_by_type(v_by_type))
       )
     );

    -- 후보 — wild_type 일치 + 우선순위 정렬.
    for v_card in
      select ct.card_id, ct.rarity
        from card_types ct
       where ct.wild_type = v_type
         and ct.rarity in ('MUR', 'UR', 'SAR', 'SR')
         and not (ct.card_id = any(v_already_used_card_ids))
       order by case ct.rarity
                  when 'MUR' then 1
                  when 'UR'  then 2
                  when 'SAR' then 3
                  when 'SR'  then 4
                  else 99
                end,
                ct.card_id
       limit v_needed
    loop
      v_grading_id := null;
      select id into v_grading_id
        from psa_gradings
       where user_id = v_user_id
         and card_id = v_card.card_id
         and grade = 10
         and not (id = any(coalesce(flatten_pet_ids_by_type(v_by_type), '{}'::uuid[])))
       limit 1;

      if v_grading_id is null then
        insert into psa_gradings (user_id, card_id, grade, rarity)
          values (v_user_id, v_card.card_id, 10, v_card.rarity)
          returning id into v_grading_id;
        v_new_inserts := v_new_inserts + 1;
      end if;

      v_current_ids := v_current_ids || v_grading_id;
      v_already_used_card_ids := v_already_used_card_ids || v_card.card_id;
      v_added_total := v_added_total + 1;
      raise notice '  [%] +% (%) grading=%',
        v_type, v_card.card_id, v_card.rarity, v_grading_id;
    end loop;

    if coalesce(array_length(v_current_ids, 1), 0) > 0 then
      v_by_type := jsonb_set(
        v_by_type, array[v_type], to_jsonb(v_current_ids), true
      );
    end if;
  end loop;

  update users
     set main_cards_by_type = v_by_type
   where id = v_user_id;

  if v_new_inserts > 0 then
    update users
       set pcl_10_wins = coalesce(pcl_10_wins, 0) + v_new_inserts
     where id = v_user_id;
  end if;

  update users
     set pet_score = compute_user_pet_score(v_user_id)
   where id = v_user_id;

  raise notice '얼음/땅/에스퍼 빈 슬롯 채움 완료 — % 슬롯 추가, % 슬랩 신규 insert',
    v_added_total, v_new_inserts;
end $$;

-- ── 검증 (warning only) ──────────────────────────────────
do $$
declare
  v_user_id uuid;
  v_by_type jsonb;
  v_type text;
  v_count int;
  v_bad_type int;
  v_bad_grade int;
  TYPES constant text[] := array['얼음', '땅', '에스퍼'];
begin
  select id, coalesce(main_cards_by_type, '{}'::jsonb)
    into v_user_id, v_by_type
    from users where user_id = 'hun';
  if not found then
    return;
  end if;

  foreach v_type in array TYPES loop
    v_count := jsonb_array_length(coalesce(v_by_type -> v_type, '[]'::jsonb));
    if v_count > 3 then
      raise warning '[verify] type % 등록 % 개 (3 초과)', v_type, v_count;
    end if;

    -- type 일치 검증 — 그 슬롯의 모든 슬랩이 card_types 에서 동일 type
    -- 이어야 함.
    select count(*)::int into v_bad_type
      from psa_gradings g
      join card_types ct on ct.card_id = g.card_id
     where g.id in (
        select (e.value)::uuid
          from jsonb_array_elements_text(coalesce(v_by_type -> v_type, '[]'::jsonb)) e
      )
       and ct.wild_type <> v_type;
    if v_bad_type > 0 then
      raise warning '[verify] type % — 속성 불일치 슬랩 % 개', v_type, v_bad_type;
    end if;

    -- PCL10 검증
    select count(*)::int into v_bad_grade
      from psa_gradings g
     where g.id in (
        select (e.value)::uuid
          from jsonb_array_elements_text(coalesce(v_by_type -> v_type, '[]'::jsonb)) e
      )
       and (g.grade <> 10 or g.user_id <> v_user_id);
    if v_bad_grade > 0 then
      raise warning '[verify] type % — PCL10 아닌 슬랩 % 개', v_type, v_bad_grade;
    end if;

    raise notice '[verify] type % — % 슬롯', v_type, v_count;
  end loop;
end $$;

notify pgrst, 'reload schema';
