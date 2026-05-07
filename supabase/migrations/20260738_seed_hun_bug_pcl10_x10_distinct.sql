-- ============================================================
-- hun 시드 — 벌레 속성 PCL10 카드 10장 (최대 다양성) + 벌레 펫 슬롯 보강.
--
-- 사용자 요구:
--   "벌레 속성 체육관에 벌레 방어덱 3개를 등록 못해. hun 계정에 PCL10
--    등급 아무 벌레 속성 카드 10장 넣어줘. 최대한 종류가 다른 포켓몬으로."
--
-- 배경:
--   체육관 풀 정책 (20260733): MUR/UR PCL10 슬랩은 보유 시 풀에 포함,
--   그 외 희귀도 PCL10 슬랩은 펫 등록(main_card_ids ∪ main_cards_by_type)
--   상태일 때만 풀에 포함. 벌레 카탈로그상 MUR/UR 합쳐 distinct card_id
--   가 2종 (m3-117 메가지가르데 / s9a-112 이올브 VMAX) 뿐이라, 펫 슬롯에
--   3종 미등록이면 방어덱 unique<3 으로 막힘. 본 시드는 두 단계로 보강.
--
-- 단계:
--   (1) hun 카드지갑에 distinct 벌레 카드 PCL10 10종 보장. 이미 보유한
--       카드는 카운트, 부족분만 카탈로그 (rarity 우선 + 알파벳) 으로 채움.
--       wild_type='벌레' 또는 wild_type_2='벌레' 모두 포함.
--   (2) hun main_cards_by_type['벌레'] 슬롯이 3마리 미달이면 보유 PCL10
--       벌레 슬랩 중 free (전시/방어덱 미사용) 인 distinct card_id 로
--       채움. 3마리 채울 때까지 fallback. 이미 3마리면 no-op.
--
-- 정책 그대로 유지:
--   · psa_gradings INSERT 만 — 도감/전시/방어덱 미터치 (단계 1).
--   · 펫 슬롯은 main_cards_by_type['벌레'] 만 set, pet_score 재계산.
--   · pcl_10_wins 카운터 += 슬랩 INSERT 분.
--
-- 멱등:
--   · 단계 1 — 이미 distinct ≥10 이면 skip.
--   · 단계 2 — 슬롯이 이미 3마리면 skip. 슬랩 부족이면 부분 채움.
--
-- 의존성: 20260642+ (card_types), 20260703 (wild_type_2), 20260708/20260710
--   (set_pet_for_type cross-slot 룰).
-- ============================================================

do $$
declare
  v_user_id uuid;
  v_target_distinct constant int := 10;
  v_target_pet constant int := 3;
  v_existing_distinct int;
  v_card record;
  v_inserted int := 0;
  v_used_grading_ids uuid[];
  v_existing_pet_arr jsonb;
  v_existing_pet_count int;
  v_pet_card_ids text[];
  v_pet_added int := 0;
  v_picked_grading uuid;
  v_picked_card text;
  v_pet_arr jsonb;
begin
  select id into v_user_id from users where user_id = 'hun';
  if not found then
    raise notice '[hun bug x10] user hun 미존재 — skip';
    return;
  end if;

  -- ── (1) 카드지갑 distinct 벌레 PCL10 10종 보장 ──
  select count(distinct g.card_id)::int into v_existing_distinct
    from psa_gradings g
    join card_types ct on ct.card_id = g.card_id
   where g.user_id = v_user_id
     and g.grade = 10
     and (ct.wild_type = '벌레' or ct.wild_type_2 = '벌레');

  if v_existing_distinct < v_target_distinct then
    for v_card in
      select ct.card_id, ct.rarity
        from card_types ct
       where (ct.wild_type = '벌레' or ct.wild_type_2 = '벌레')
         and not exists (
           select 1 from psa_gradings g
            where g.user_id = v_user_id
              and g.card_id = ct.card_id
              and g.grade = 10
         )
       order by
         case ct.rarity
           when 'MUR' then 1 when 'UR' then 2 when 'SAR' then 3 when 'SR' then 4
           when 'MA'  then 5 when 'AR' then 6 when 'RR'  then 7 when 'R'  then 8
           when 'U'   then 9 when 'C'  then 10 else 99 end,
         ct.card_id
       limit (v_target_distinct - v_existing_distinct)
    loop
      insert into psa_gradings (user_id, card_id, grade, rarity)
      values (v_user_id, v_card.card_id, 10, v_card.rarity);
      v_inserted := v_inserted + 1;
    end loop;

    if v_inserted > 0 then
      update users
         set pcl_10_wins = coalesce(pcl_10_wins, 0) + v_inserted
       where id = v_user_id;
    end if;
  end if;

  raise notice '[hun bug x10] 단계1 distinct 기존=% → INSERT=%',
    v_existing_distinct, v_inserted;

  -- ── (2) main_cards_by_type['벌레'] 슬롯 보강 (≤3 까지) ──
  v_existing_pet_arr := coalesce(
    (select main_cards_by_type -> '벌레' from users where id = v_user_id),
    '[]'::jsonb
  );
  v_existing_pet_count := jsonb_array_length(v_existing_pet_arr);

  if v_existing_pet_count >= v_target_pet then
    raise notice '[hun bug x10] 단계2 펫 슬롯 이미 % 마리 — skip',
      v_existing_pet_count;
  else
    -- 사용 중 슬랩 (다른 펫 슬롯 / 전시 / 방어덱) — 펫 풀에서 제외.
    v_used_grading_ids := array(
      select (e.value)::uuid
        from users u,
             jsonb_each(coalesce(u.main_cards_by_type, '{}'::jsonb)) k(key, value),
             jsonb_array_elements_text(k.value) e
       where u.id = v_user_id
    );
    v_used_grading_ids := v_used_grading_ids || array(
      select sc.grading_id from showcase_cards sc
       join user_showcases us on us.id = sc.showcase_id
       where us.user_id = v_user_id and sc.grading_id is not null
    );
    v_used_grading_ids := v_used_grading_ids || array(
      select x from gym_ownerships go,
                unnest(coalesce(go.defense_pet_ids, '{}'::uuid[])) x
       where go.owner_user_id = v_user_id
         and go.defense_pet_ids is not null
    );

    -- 슬롯 안 기존 card_id (중복 방지).
    v_pet_card_ids := array(
      select g.card_id
        from jsonb_array_elements_text(v_existing_pet_arr) e
        join psa_gradings g on g.id = (e.value)::uuid
    );

    while v_existing_pet_count < v_target_pet loop
      v_picked_grading := null;
      v_picked_card := null;

      -- 보유 PCL10 벌레 슬랩 중 free + slot 안 다른 card_id, rarity 우선.
      select g.id, g.card_id into v_picked_grading, v_picked_card
        from psa_gradings g
        join card_types ct on ct.card_id = g.card_id
       where g.user_id = v_user_id
         and g.grade = 10
         and (ct.wild_type = '벌레' or ct.wild_type_2 = '벌레')
         and not (g.id = any(v_used_grading_ids))
         and not (g.card_id = any(v_pet_card_ids))
       order by
         case g.rarity
           when 'MUR' then 1 when 'UR' then 2 when 'SAR' then 3 when 'SR' then 4
           when 'MA'  then 5 when 'AR' then 6 when 'RR'  then 7 when 'R'  then 8
           when 'U'   then 9 when 'C'  then 10 else 99 end,
         g.card_id
       limit 1;

      if v_picked_grading is null then
        exit;  -- 보강 가능한 free 슬랩 더 없음
      end if;

      v_existing_pet_arr := v_existing_pet_arr || to_jsonb(v_picked_grading::text);
      v_used_grading_ids := v_used_grading_ids || v_picked_grading;
      v_pet_card_ids := v_pet_card_ids || v_picked_card;
      v_existing_pet_count := v_existing_pet_count + 1;
      v_pet_added := v_pet_added + 1;
    end loop;

    if v_pet_added > 0 then
      v_pet_arr := coalesce(
        (select main_cards_by_type from users where id = v_user_id),
        '{}'::jsonb
      );
      v_pet_arr := jsonb_set(v_pet_arr, array['벌레'], v_existing_pet_arr, true);

      update users
         set main_cards_by_type = v_pet_arr,
             main_card_ids = array(
               select id from unnest(coalesce(main_card_ids, '{}'::uuid[])) as id
                where not (id::text = any(
                  select e.value from jsonb_array_elements_text(v_existing_pet_arr) e
                ))
             )
       where id = v_user_id;

      update users
         set pet_score = compute_user_pet_score(v_user_id)
       where id = v_user_id;
    end if;

    raise notice '[hun bug x10] 단계2 펫 슬롯 % 마리 추가 (총 %)',
      v_pet_added, v_existing_pet_count;
  end if;
end $$;

notify pgrst, 'reload schema';

-- 마이그레이션: 20260738_seed_hun_bug_pcl10_x10_distinct.sql
