-- ============================================================
-- hun 계정 빈 슬롯 채우기 — UR 우선, 부족하면 SAR
--
-- 사용자 요청:
--   "hun 계정에 펫 빈슬롯들 UR 로 다 채우고 부족하면 SAR 로 다 채워."
--
-- 정책:
--   · 현재 등록된 펫 (MUR/UR/SAR 등) 은 그대로 보존.
--   · 18 속성 각각 빈 슬롯 수 = 3 - 현재 등록 수.
--   · 빈 슬롯 채우기 우선순위: UR (rarity_rank 1) → SAR (rank 2).
--     SR/MA/AR/RR/R/U/C 는 제외 (사용자 명시).
--   · 후보 풀: hun 의 PCL10 슬랩 중 해당 type 일치 + rarity ∈ {UR, SAR}
--     + 아직 어느 type 슬롯에도 등록 안 된 grading_id + 같은 type
--     안에서 같은 card_id 중복 X.
--   · per card_id distinct (한 카드는 1번만), UR 먼저.
--   · 끝나면 pet_score 재계산.
--
-- 의존성: 20260642 (card_types 테이블), 20260645 (MUR/UR/SAR 1차 채움)
-- 멱등 — 재실행해도 이미 채운 슬롯은 그대로.
-- ============================================================

do $$
declare
  v_user_id uuid;
  v_by_type jsonb;
  v_type text;
  v_current_ids uuid[];
  v_all_used_grading_ids uuid[];
  v_used_card_ids text[];
  v_needed int;
  v_new_ids uuid[];
  v_combined uuid[];
  v_added_total int := 0;
  TYPES constant text[] := array[
    '노말','불꽃','물','풀','전기','얼음','격투','독','땅',
    '비행','에스퍼','벌레','바위','고스트','드래곤','악','강철','페어리'
  ];
begin
  select id into v_user_id from users where user_id = 'hun';
  if not found then
    raise notice 'user hun 미존재 — fill skip';
    return;
  end if;

  select coalesce(main_cards_by_type, '{}'::jsonb)
    into v_by_type
    from users where id = v_user_id;

  -- 모든 type 슬롯에 이미 등록된 grading_id 들 (cross-type 중복 방지).
  v_all_used_grading_ids := flatten_pet_ids_by_type(v_by_type);

  foreach v_type in array TYPES loop
    -- 현재 type 슬롯에 등록된 grading_ids.
    v_current_ids := array(
      select (e.value)::uuid
        from jsonb_array_elements_text(
          coalesce(v_by_type -> v_type, '[]'::jsonb)
        ) e
    );
    v_needed := 3 - coalesce(array_length(v_current_ids, 1), 0);
    if v_needed <= 0 then continue; end if;

    -- 현재 type 에 이미 들어간 card_id (같은 type 내 중복 방지).
    select coalesce(array_agg(g.card_id), '{}'::text[])
      into v_used_card_ids
      from psa_gradings g
     where g.id = any(v_current_ids);

    -- UR 먼저, 그 다음 SAR. distinct on card_id (한 카드 1번만).
    select array(
      select id
        from (
          select distinct on (g.card_id)
                 g.id,
                 g.card_id,
                 case g.rarity
                   when 'UR'  then 1
                   when 'SAR' then 2
                   else 99
                 end as rk
            from psa_gradings g
            join card_types ct on ct.card_id = g.card_id
           where g.user_id = v_user_id
             and g.grade = 10
             and ct.wild_type = v_type
             and g.rarity in ('UR', 'SAR')
             and not (g.id = any(v_all_used_grading_ids))
             and not (g.card_id = any(v_used_card_ids))
           order by g.card_id,
                    case g.rarity
                      when 'UR'  then 1
                      when 'SAR' then 2
                      else 99
                    end
        ) per_card
       order by rk
       limit v_needed
    ) into v_new_ids;

    if coalesce(array_length(v_new_ids, 1), 0) = 0 then
      continue;
    end if;

    v_combined := v_current_ids || v_new_ids;
    v_by_type := jsonb_set(
      v_by_type, array[v_type], to_jsonb(v_combined), true
    );
    -- cross-type 중복 방지를 위해 누적 used 집합도 갱신.
    v_all_used_grading_ids := v_all_used_grading_ids || v_new_ids;
    v_added_total := v_added_total + array_length(v_new_ids, 1);
    raise notice '  [%] +% 추가 (총 %)', v_type, array_length(v_new_ids, 1), array_length(v_combined, 1);
  end loop;

  update users
     set main_cards_by_type = v_by_type
   where id = v_user_id;

  update users
     set pet_score = compute_user_pet_score(v_user_id)
   where id = v_user_id;

  raise notice 'hun 빈 슬롯 채우기 (UR/SAR) 완료: % 마리 추가', v_added_total;
end $$;

notify pgrst, 'reload schema';
