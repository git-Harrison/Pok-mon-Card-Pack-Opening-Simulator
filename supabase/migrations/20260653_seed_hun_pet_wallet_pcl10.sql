-- ============================================================
-- hun 계정 시드 — PCL10 MUR/UR/SAR/SR 4종을 펫 슬롯 + 카드 지갑
-- 양쪽에 독립 인스턴스로 보장.
--
-- 사용자 요구:
--   1) 펫 슬롯에 PCL10 MUR / UR / SAR / SR 각 1장씩 등록.
--   2) 동일한 카드를 카드 지갑(card_ownership) 에도 각 1장씩 추가.
--   3) 펫 row 와 지갑 row 는 같은 row 를 공유하면 안 됨 — 각각
--      독립 인스턴스. (실제로는 자연스레 분리: 펫 = psa_gradings,
--      지갑 = card_ownership.)
--
-- 정책 / 멱등성:
--   · 이미 그 등급의 PCL10 슬랩이 hun 펫에 있으면 그 카드를 재사용
--     (skip — 펫 새로 안 만듦). 그래도 지갑 +1 은 보장.
--   · 부족한 등급은 card_types 카탈로그에서 hun 이 펫 등록 안 한
--     card_id 1장 + 그 카드의 wild_type 슬롯에 빈 자리(< 3) 가
--     있는 것을 골라 새 PCL10 슬랩으로 추가.
--   · 슬롯이 다 차서 빈 자리를 못 찾으면 raise notice 후 skip
--     (set_pet_for_type 의 type-당-3마리 가드를 우회하지 않음).
--   · 지갑 += 1 은 select 한 4 card_id 모두 (이미 보유 중이면
--     count + 1, 신규면 row insert).
--
-- 의존성: 20260619 (main_cards_by_type), 20260642 (card_types).
-- 재실행 안전 — 펫 중복 안 생기고, 지갑은 매번 +1 이라 의도적으로
-- 호출하지 않는 한 문제 없음. (CI 는 checksum 변경 시에만 재실행.)
-- ============================================================

do $$
declare
  v_user_id uuid;
  v_by_type jsonb;
  v_pet_ids uuid[];
  v_existing_card_ids text[];
  v_target_rarities constant text[] := array['MUR', 'UR', 'SAR', 'SR'];
  v_rarity text;
  v_chosen_card_ids text[] := '{}'::text[];
  v_card_id text;
  v_card_type text;
  v_grading_id uuid;
  v_current_ids uuid[];
  v_new_inserts int := 0;
begin
  select id, coalesce(main_cards_by_type, '{}'::jsonb)
    into v_user_id, v_by_type
    from users where user_id = 'hun';
  if not found then
    raise notice 'user hun 미존재 — seed skip';
    return;
  end if;

  -- 현재 hun 펫에 등록된 모든 grading_id (legacy + by_type).
  select array_agg(distinct id) into v_pet_ids
    from (
      select unnest(coalesce(main_card_ids, '{}'::uuid[])) as id
        from users where id = v_user_id
      union
      select unnest(flatten_pet_ids_by_type(v_by_type)) as id
    ) t
   where id is not null;
  v_pet_ids := coalesce(v_pet_ids, '{}'::uuid[]);

  -- 그 슬랩들의 card_id 들 (cross-type/legacy 중복 방지용).
  select coalesce(array_agg(distinct g.card_id), '{}'::text[])
    into v_existing_card_ids
    from psa_gradings g
   where g.id = any(v_pet_ids);

  foreach v_rarity in array v_target_rarities loop
    v_card_id := null;
    v_card_type := null;

    -- 1) 그 등급의 PCL10 펫 슬랩이 이미 있으면 그 card_id 재사용.
    select g.card_id into v_card_id
      from psa_gradings g
     where g.id = any(v_pet_ids)
       and g.user_id = v_user_id
       and g.grade = 10
       and g.rarity = v_rarity
     limit 1;

    if v_card_id is not null then
      v_chosen_card_ids := v_chosen_card_ids || v_card_id;
      raise notice '[hun seed] % — 펫 기등록 카드 재사용: %', v_rarity, v_card_id;
      continue;
    end if;

    -- 2) 부족한 등급 — 카탈로그에서 빈 슬롯 가진 wild_type 의
    --    그 등급 카드 1장 선정.
    select ct.card_id, ct.wild_type
      into v_card_id, v_card_type
      from card_types ct
     where ct.rarity = v_rarity
       and not (ct.card_id = any(v_existing_card_ids))
       and coalesce(jsonb_array_length(v_by_type -> ct.wild_type), 0) < 3
     order by ct.card_id
     limit 1;

    if v_card_id is null then
      raise notice '[hun seed] % — 추가 불가 (카탈로그 후보 없음 또는 모든 type 슬롯 가득)', v_rarity;
      continue;
    end if;

    -- 새 PCL10 슬랩 insert + 해당 type 슬롯에 append.
    insert into psa_gradings (user_id, card_id, grade, rarity)
      values (v_user_id, v_card_id, 10, v_rarity)
      returning id into v_grading_id;
    v_new_inserts := v_new_inserts + 1;

    v_current_ids := array(
      select (e.value)::uuid
        from jsonb_array_elements_text(
          coalesce(v_by_type -> v_card_type, '[]'::jsonb)
        ) e
    );
    v_current_ids := v_current_ids || v_grading_id;
    v_by_type := jsonb_set(v_by_type, array[v_card_type], to_jsonb(v_current_ids), true);

    v_existing_card_ids := v_existing_card_ids || v_card_id;
    v_chosen_card_ids := v_chosen_card_ids || v_card_id;
    raise notice '[hun seed] % + 신규 펫 grading=% (type=%, card=%)',
      v_rarity, v_grading_id, v_card_type, v_card_id;
  end loop;

  -- 펫 상태 업데이트 + pet_score 재계산 + pcl_10_wins 가산.
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

  -- 카드 지갑 — 4 card_id 각 +1 (펫 슬랩과 독립된 인스턴스).
  --   psa_gradings (펫 row) ↔ card_ownership (지갑 row) 다른 테이블.
  --   같은 card_id 라도 row 충돌 없음.
  if coalesce(array_length(v_chosen_card_ids, 1), 0) > 0 then
    insert into card_ownership (user_id, card_id, count)
      select v_user_id, c, 1
        from unnest(v_chosen_card_ids) c
      on conflict (user_id, card_id)
        do update set count = card_ownership.count + 1,
                      last_pulled_at = now();
    raise notice '[hun seed] 지갑 + 카드 % 종 (각 +1)',
      coalesce(array_length(v_chosen_card_ids, 1), 0);
  end if;
end $$;

notify pgrst, 'reload schema';
