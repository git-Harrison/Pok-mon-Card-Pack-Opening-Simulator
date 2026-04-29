-- ============================================================
-- hun 펫 빈 슬롯 채움 — 속성별 3 슬롯, MUR > UR > SAR > SR 우선순위.
--
-- 사용자 요구 (2026-04-29 추가):
--   · 펫은 속성별 3 슬롯만 등록 가능
--   · 이미 등록된 슬롯은 유지, 빈 슬롯에만 채움 (절대 덮어쓰기 X)
--   · PCL 10 등급, 속성 매칭, 실제 카탈로그 카드만
--   · 우선순위: MUR > UR > SAR > SR
--   · 동일 card_id 중복 등록 금지 (cross-type 까지 검사)
--   · 펫과 지갑은 독립 인스턴스 유지
--
-- 동작:
--   1) 18 type 순회.
--   2) 각 type 의 빈 슬롯 수 = 3 - 현재 등록 수.
--   3) 후보 카드 = card_types(wild_type=type, rarity ∈ {MUR/UR/SAR/SR})
--      ∧ hun 의 다른 type 슬롯에 동일 card_id 없음.
--   4) 정렬: rarity 우선순위(1=MUR / 2=UR / 3=SAR / 4=SR) → card_id asc.
--   5) 빈 슬롯 수만큼 채움:
--      · hun 의 PCL10 슬랩이 이미 있으면 그 grading_id 재사용 (새 row
--        만들지 않음 — 같은 card_id 의 슬랩 인스턴스를 슬롯에만 매핑).
--      · 없으면 psa_gradings 에 PCL10 row 신규 insert + pcl_10_wins +=1.
--      · main_cards_by_type[type] 배열에 grading_id append.
--   6) pet_score 재계산 (compute_user_pet_score).
--
-- 멱등 — 가득 찬 type 은 skip, 카탈로그 후보 없으면 skip. 재실행해도
-- 같은 카드 중복 등록 안 됨 (cross-type 검사 + 각 type 빈 슬롯만 채움).
--
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
  TYPES constant text[] := array[
    '노말','불꽃','물','풀','전기','얼음','격투','독','땅',
    '비행','에스퍼','벌레','바위','고스트','드래곤','악','강철','페어리'
  ];
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
    -- 현재 type 슬롯에 든 grading_id 들.
    v_current_ids := array(
      select (e.value)::uuid
        from jsonb_array_elements_text(
          coalesce(v_by_type -> v_type, '[]'::jsonb)
        ) e
    );
    v_needed := 3 - coalesce(array_length(v_current_ids, 1), 0);

    -- 가득 찬 type 은 skip — 절대 덮어쓰지 않음.
    if v_needed <= 0 then
      continue;
    end if;

    -- cross-type 중복 검사용 — hun 의 모든 펫 슬롯에 이미 들어간
    -- card_id 들 (legacy + by_type). 같은 card_id 가 다른 슬롯에
    -- 있으면 새 슬롯에 또 못 넣음 (펫 시스템 제약).
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

    -- 카탈로그에서 우선순위 (MUR > UR > SAR > SR) 로 후보 선정.
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
      -- hun 의 PCL10 슬랩이 이미 있으면 재사용, 없으면 새로 insert.
      v_grading_id := null;
      select id into v_grading_id
        from psa_gradings
       where user_id = v_user_id
         and card_id = v_card.card_id
         and grade = 10
         -- 이미 다른 슬롯에 들어간 grading_id 는 제외 (중복 매핑 방지).
         and not (id = any(coalesce(flatten_pet_ids_by_type(v_by_type), '{}'::uuid[])))
       limit 1;

      if v_grading_id is null then
        insert into psa_gradings (user_id, card_id, grade, rarity)
          values (v_user_id, v_card.card_id, 10, v_card.rarity)
          returning id into v_grading_id;
        v_new_inserts := v_new_inserts + 1;
      end if;

      -- 슬롯에 추가.
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

  raise notice 'hun 펫 빈 슬롯 채움 완료 — % 슬롯 추가, % 슬랩 신규 insert',
    v_added_total, v_new_inserts;
end $$;

-- ── 검증 (warning only) ──────────────────────────────────
do $$
declare
  v_user_id uuid;
  v_by_type jsonb;
  v_type text;
  v_count int;
  v_total_slots int := 0;
  v_total_filled int := 0;
  TYPES constant text[] := array[
    '노말','불꽃','물','풀','전기','얼음','격투','독','땅',
    '비행','에스퍼','벌레','바위','고스트','드래곤','악','강철','페어리'
  ];
begin
  select id, coalesce(main_cards_by_type, '{}'::jsonb)
    into v_user_id, v_by_type
    from users where user_id = 'hun';
  if not found then
    return;
  end if;

  foreach v_type in array TYPES loop
    v_count := jsonb_array_length(coalesce(v_by_type -> v_type, '[]'::jsonb));
    v_total_slots := v_total_slots + 3;
    v_total_filled := v_total_filled + v_count;
    if v_count > 3 then
      raise warning '[verify] type % 등록 % 개 (3 초과 — 정합성 위반)', v_type, v_count;
    end if;
  end loop;

  -- 모든 등록 슬랩이 PCL10 인지.
  if exists (
    select 1
      from psa_gradings g
     where g.id = any(flatten_pet_ids_by_type(v_by_type))
       and (g.grade <> 10 or g.user_id <> v_user_id)
  ) then
    raise warning '[verify] hun 펫 슬롯에 PCL10 아닌 슬랩 잔존';
  end if;

  raise notice '[verify] hun 펫 슬롯 % / % 채움 (%.1f%%)',
    v_total_filled, v_total_slots,
    case when v_total_slots > 0
         then round(v_total_filled::numeric * 100 / v_total_slots, 1)
         else 0 end;
end $$;

notify pgrst, 'reload schema';
