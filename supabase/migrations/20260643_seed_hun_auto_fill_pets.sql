-- ============================================================
-- hun 계정 펫 빈자리 자동 채우기 (사용자 요청)
--
-- 전제: 20260642_card_types_seed.sql 가 먼저 적용되어 card_types
-- 테이블에 카드↔속성 mapping 이 있어야 함.
--
-- 동작:
--   1) hun 의 user_id 조회. 미존재 시 skip.
--   2) hun 의 현재 main_cards_by_type (속성별 등록 펫) 보존.
--   3) 18 속성 각각에 대해:
--      · 빈 슬롯 수 = 3 - 현재 등록 수 (0 이하면 skip)
--      · 후보 풀: hun 이 보유한 PCL10 슬랩 중 해당 속성 + 아직
--        그 속성 슬롯에 안 들어간 + (같은 속성에) 같은 card_id 중복 X
--      · 같은 card_id 의 슬랩이 여러 장이면 가장 좋은 1장만 (per
--        card_id distinct, 희귀도 우선).
--      · 희귀도 우선순위 MUR > UR > SAR > MA > SR > AR > RR > R > U > C.
--      · 빈 슬롯 수만큼 상위 N장 선정 → 슬롯 끝에 append.
--   4) 모두 끝나면 main_cards_by_type 갱신 + pet_score 재계산.
--
-- 멱등성: 재실행해도 이미 채운 슬롯은 건드리지 않음. 나머지가 비어
-- 있으면 추가 채움.
-- ============================================================

do $$
declare
  v_user_id uuid;
  v_by_type jsonb;
  v_type text;
  v_current_ids uuid[];
  v_needed int;
  v_new_ids uuid[];
  v_used_card_ids text[];
  v_combined uuid[];
  v_added_total int := 0;
  TYPES constant text[] := array[
    '노말','불꽃','물','풀','전기','얼음','격투','독','땅',
    '비행','에스퍼','벌레','바위','고스트','드래곤','악','강철','페어리'
  ];
begin
  -- 1) hun 조회.
  select id into v_user_id from users where user_id = 'hun';
  if not found then
    raise notice 'user hun 미존재 — auto-fill skip';
    return;
  end if;

  select coalesce(main_cards_by_type, '{}'::jsonb)
    into v_by_type
    from users where id = v_user_id;

  -- 2) 18 속성 순회.
  foreach v_type in array TYPES loop
    -- 현재 v_type 에 이미 등록된 grading_ids.
    v_current_ids := array(
      select (e.value)::uuid
        from jsonb_array_elements_text(
          coalesce(v_by_type -> v_type, '[]'::jsonb)
        ) e
    );
    v_needed := 3 - coalesce(array_length(v_current_ids, 1), 0);
    if v_needed <= 0 then continue; end if;

    -- 현재 v_type 슬롯에 이미 들어간 card_id 들 (같은 type 내 중복 방지).
    select coalesce(array_agg(g.card_id), '{}'::text[])
      into v_used_card_ids
      from psa_gradings g
     where g.id = any(v_current_ids);

    -- 후보: hun 의 PCL10 슬랩 중 v_type 카드, distinct on card_id
    -- (같은 카드 여러 장 있으면 최고 희귀도 한 장만 → 나머지는
    -- 다른 type 슬롯에 못 들어가니까 일단 첫 후보로).
    select array(
      select id
        from (
          select distinct on (g.card_id)
                 g.id,
                 g.card_id,
                 case g.rarity
                   when 'MUR' then 1 when 'UR'  then 2 when 'SAR' then 3
                   when 'MA'  then 4 when 'SR'  then 5 when 'AR'  then 6
                   when 'RR'  then 7 when 'R'   then 8 when 'U'   then 9
                   when 'C'   then 10 else 99
                 end as rk
            from psa_gradings g
            join card_types ct on ct.card_id = g.card_id
           where g.user_id = v_user_id
             and g.grade = 10
             and ct.wild_type = v_type
             and not (g.id = any(v_current_ids))
             and not (g.card_id = any(v_used_card_ids))
           order by g.card_id,
                    case g.rarity
                      when 'MUR' then 1 when 'UR'  then 2 when 'SAR' then 3
                      when 'MA'  then 4 when 'SR'  then 5 when 'AR'  then 6
                      when 'RR'  then 7 when 'R'   then 8 when 'U'   then 9
                      when 'C'   then 10 else 99
                    end
        ) per_card
       order by rk
       limit v_needed
    ) into v_new_ids;

    if coalesce(array_length(v_new_ids, 1), 0) = 0 then
      continue;
    end if;

    v_combined := v_current_ids || v_new_ids;

    -- main_cards_by_type[v_type] = v_combined 갱신.
    v_by_type := jsonb_set(
      v_by_type,
      array[v_type],
      to_jsonb(v_combined),
      true
    );

    v_added_total := v_added_total + array_length(v_new_ids, 1);
    raise notice '  [%] +% 마리 채움 (총 %)', v_type, array_length(v_new_ids, 1), array_length(v_combined, 1);
  end loop;

  -- 3) users 업데이트 + pet_score 재계산.
  update users
     set main_cards_by_type = v_by_type
   where id = v_user_id;

  update users
     set pet_score = compute_user_pet_score(v_user_id)
   where id = v_user_id;

  raise notice 'hun 펫 자동 채우기 완료: 총 % 마리 추가', v_added_total;
end $$;
