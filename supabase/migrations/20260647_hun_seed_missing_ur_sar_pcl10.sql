-- ============================================================
-- hun 빈 펫 슬롯에 UR/SAR PCL10 슬랩 시드 + 등록
--
-- 사용자 요청:
--   "인벤 부족이면 직접 채워주라니까. 보유한 카드에서 채우는 게
--    아니라."
--   → 카탈로그(card_types) 에서 해당 속성의 UR/SAR 카드를 골라
--    hun 의 psa_gradings 에 새 PCL10 슬랩으로 추가하고, main_cards_by_type
--    의 빈 슬롯에 등록.
--
-- 정책:
--   · 18 속성 순회. 각 type 의 빈 슬롯 수 = 3 - 현재 등록 수.
--   · 후보: card_types 에서 wild_type = type, rarity ∈ {UR, SAR},
--     hun 의 다른 슬롯에 같은 card_id 가 등록되어 있지 않은 것.
--   · 정렬: UR 먼저(1) → SAR(2). card_id 사전순 tiebreak.
--   · 빈 슬롯 수만큼 선정.
--   · 각 선정 카드:
--      - hun 이 이미 PCL10 슬랩을 갖고 있으면 그것을 재사용 (멱등).
--      - 없으면 psa_gradings 에 새 row insert + pcl_10_wins +=1.
--   · main_cards_by_type 에 추가.
--   · pet_score 재계산.
--
-- 의존성: 20260642 (card_types). 멱등 — 재실행해도 같은 카드 중복
-- 시드/등록 안 함.
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
    raise notice 'user hun 미존재 — seed skip';
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
    if v_needed <= 0 then continue; end if;

    -- 현재 hun 의 모든 type 슬롯에 들어간 card_id 들 (cross-type 중복
    -- 방지). 같은 card_id 가 다른 type 에 있으면 새로 등록 X.
    select coalesce(array_agg(distinct g.card_id), '{}'::text[])
      into v_already_used_card_ids
      from psa_gradings g
     where g.id = any(flatten_pet_ids_by_type(v_by_type));

    -- 카탈로그에서 해당 type 의 UR/SAR 카드 선정.
    for v_card in
      select ct.card_id, ct.rarity
        from card_types ct
       where ct.wild_type = v_type
         and ct.rarity in ('UR', 'SAR')
         and not (ct.card_id = any(v_already_used_card_ids))
       order by case ct.rarity
                  when 'UR'  then 1
                  when 'SAR' then 2
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
      raise notice '  [%] +% (%) grading=%', v_type, v_card.card_id, v_card.rarity, v_grading_id;
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

  raise notice 'hun 빈 슬롯 UR/SAR 시드+등록 완료: % 마리 슬롯, % 장 신규 insert',
    v_added_total, v_new_inserts;
end $$;

notify pgrst, 'reload schema';
