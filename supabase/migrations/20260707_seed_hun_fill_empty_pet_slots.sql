-- ============================================================
-- hun 펫 빈 슬롯 강제 충전 — 보유 카드 부족 시 시드 슬랩 INSERT.
--
-- 20260706 이 보유 카드 한도 안에서 펫 슬롯을 채웠으나, hun 의 PCL10
-- 카드가 부족해 17 속성에서 일부 슬롯이 비어 있음 (40/54). 본 시드는:
--   - 기존 등록 그대로 유지 (재배치 X).
--   - 빈 슬롯에 대해 MUR > UR > SAR > SR 우선순위로 카탈로그에서 카드
--     픽 → hun 미보유면 PCL10 슬랩 INSERT → 슬롯 등록.
--   - 같은 card_id 가 여러 type slot 에 들어가지 않게 cross-slot 중복 방지.
--   - 사용 중 (전시/방어덱) 카드의 card_id 도 충돌 방지.
--
-- 룰 그대로 유지:
--   - SAR/SR 1차 속성만 / UR/MUR 1차 또는 2차 일치 시 가능.
--   - 트레이너/에너지 (wild_type null) 펫 후보 제외.
--   - pet_score 일괄 재계산.
--
-- 18 wildType 모두 시도 (7 chapter1 + 10 chapter2 + 노말). 각 type 의
-- 슬롯은 최대 3 개까지 채움. 카탈로그에 적합 카드가 더 없으면 그 type 만
-- 일부 채우고 종료.
-- ============================================================

do $$
declare
  v_user_id uuid;
  v_used_card_ids text[] := '{}'::text[];
  v_slots jsonb;
  v_types constant text[] := array[
    '풀','불꽃','물','전기','얼음','바위','땅','에스퍼',
    '격투','독','비행','벌레','고스트','드래곤','악','강철','페어리','노말'
  ];
  v_type text;
  v_existing jsonb;
  v_count int;
  v_rarity_priority constant text[] := array['MUR','UR','SAR','SR'];
  v_rarity text;
  v_card_id text;
  v_existing_grading_id uuid;
  v_new_grading_id uuid;
  v_picked_rarity text;
  v_inserted_total int := 0;
  v_total_pets int;
begin
  select id into v_user_id from users where user_id = 'hun';
  if not found then
    raise notice '[hun fill empties] user hun 미존재 — skip';
    return;
  end if;

  -- 현재 펫 등록된 card_id 들 (유지 대상) + 사용 중 (전시/방어덱) card_id
  -- 들도 충돌 방지 풀에 포함 — 같은 card_id 신규 슬롯 등록 거부.
  v_used_card_ids := array(
    select distinct g.card_id
      from users u
      cross join lateral jsonb_each(coalesce(u.main_cards_by_type, '{}'::jsonb)) k
      cross join lateral jsonb_array_elements_text(k.value) e
      join psa_gradings g on g.id = (e.value)::uuid
     where u.id = v_user_id
  );
  v_used_card_ids := v_used_card_ids || array(
    select distinct g.card_id
      from showcase_cards sc
      join user_showcases us on us.id = sc.showcase_id
      join psa_gradings g on g.id = sc.grading_id
     where us.user_id = v_user_id
       and sc.grading_id is not null
  );
  v_used_card_ids := v_used_card_ids || array(
    select distinct g.card_id
      from gym_ownerships go,
           unnest(coalesce(go.defense_pet_ids, '{}'::uuid[])) pid
      join psa_gradings g on g.id = pid
     where go.owner_user_id = v_user_id
       and go.defense_pet_ids is not null
  );

  -- 현재 슬롯 상태 로드.
  select coalesce(main_cards_by_type, '{}'::jsonb) into v_slots
    from users where id = v_user_id;

  foreach v_type in array v_types loop
    v_existing := coalesce(v_slots -> v_type, '[]'::jsonb);
    v_count := jsonb_array_length(v_existing);

    while v_count < 3 loop
      v_card_id := null;
      v_picked_rarity := null;

      -- 우선순위대로 후보 카드 선택.
      foreach v_rarity in array v_rarity_priority loop
        select ct.card_id, ct.rarity into v_card_id, v_picked_rarity
          from card_types ct
         where ct.rarity = v_rarity
           and (ct.wild_type = v_type or ct.wild_type_2 = v_type)
           and not (ct.card_id = any(v_used_card_ids))
         order by ct.card_id  -- deterministic
         limit 1;
        if v_card_id is not null then
          exit;  -- found
        end if;
      end loop;

      if v_card_id is null then
        -- 이 type 에 채울 카드 더 없음.
        exit;
      end if;

      -- 보유 PCL10 슬랩 (사용 중 아님) 있으면 재사용, 없으면 INSERT.
      select g.id into v_existing_grading_id
        from psa_gradings g
       where g.user_id = v_user_id
         and g.card_id = v_card_id
         and g.grade = 10
         and g.id not in (
           select (e.value)::uuid
             from jsonb_each(coalesce(v_slots, '{}'::jsonb)) k
             cross join jsonb_array_elements_text(k.value) e
         )
         and g.id not in (
           select sc.grading_id
             from showcase_cards sc
             join user_showcases us on us.id = sc.showcase_id
            where us.user_id = v_user_id
              and sc.grading_id is not null
         )
         and g.id not in (
           select pid
             from gym_ownerships go,
                  unnest(coalesce(go.defense_pet_ids, '{}'::uuid[])) pid
            where go.owner_user_id = v_user_id
              and go.defense_pet_ids is not null
         )
       limit 1;

      if v_existing_grading_id is null then
        insert into psa_gradings (user_id, card_id, grade, rarity)
        values (v_user_id, v_card_id, 10, v_picked_rarity)
        returning id into v_new_grading_id;
        v_inserted_total := v_inserted_total + 1;
      else
        v_new_grading_id := v_existing_grading_id;
      end if;

      -- slot 에 추가.
      v_existing := v_existing || to_jsonb(v_new_grading_id::text);
      v_slots := jsonb_set(v_slots, array[v_type], v_existing, true);
      v_used_card_ids := v_used_card_ids || v_card_id;
      v_count := v_count + 1;
    end loop;
  end loop;

  update users
     set main_cards_by_type = v_slots
   where id = v_user_id;

  update users
     set pet_score = compute_user_pet_score(v_user_id)
   where id = v_user_id;

  if v_inserted_total > 0 then
    update users
       set pcl_10_wins = coalesce(pcl_10_wins, 0) + v_inserted_total
     where id = v_user_id;
  end if;

  select sum(jsonb_array_length(value))::int into v_total_pets
    from jsonb_each(v_slots);

  raise notice '[hun fill empties] 신규 슬랩 %장 INSERT, 총 펫 %마리',
    v_inserted_total, v_total_pets;
end $$;

-- 마이그레이션: 20260707_seed_hun_fill_empty_pet_slots.sql
