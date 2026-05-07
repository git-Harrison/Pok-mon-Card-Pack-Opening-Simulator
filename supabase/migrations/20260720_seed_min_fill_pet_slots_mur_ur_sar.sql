-- ============================================================
-- min 펫 빈 슬롯 충전 — MUR > UR > SAR 우선순위.
--
-- 사용자 요구:
--   "min 계정 펫 등록 빈 슬롯이 있으면 MUR > UR > SAR 순으로 채움.
--    MUR 로 우선 전부 채우고, 중복이거나 속성에 맞는 MUR 카드가 없으면
--    UR, 그 다음 SAR."
--
-- 패턴: 20260710_seed_hun_idempotent_fill_pet_slots 와 동일. 차이점:
--   · user_id = 'min'
--   · rarity priority = [MUR, UR, SAR]  (hun 버전의 SR 제외)
--
-- 동작:
--   · 기존 등록된 펫 슬롯은 절대 미터치.
--   · 18 wildType × 3 슬롯 중 빈 자리만 채움.
--   · 빈 슬롯 1개 채울 때 — 같은 슬롯 내 미사용 card_id 중 MUR 우선
--     → 없으면 UR → 없으면 SAR. (동일 카드 중복 방지)
--   · 보유 free PCL10 슬랩 있으면 재사용, 없으면 psa_gradings INSERT.
--   · 같은 grading_id 가 다른 슬롯/전시/방어덱 에 들어가지 않게 cross-slot
--     검사.
--   · 카탈로그에 적합 카드가 더 없으면 그 type 만 일부 채우고 종료.
--
-- 멱등: 이미 모두 차 있으면 INSERT 0, no-op.
-- ============================================================

do $$
declare
  v_user_id uuid;
  v_used_grading_ids uuid[] := '{}'::uuid[];
  v_slots jsonb;
  v_types constant text[] := array[
    '풀','불꽃','물','전기','얼음','바위','땅','에스퍼',
    '격투','독','비행','벌레','고스트','드래곤','악','강철','페어리','노말'
  ];
  v_type text;
  v_existing jsonb;
  v_count int;
  v_slot_card_ids text[];
  v_rarity_priority constant text[] := array['MUR','UR','SAR'];
  v_rarity text;
  v_card_id text;
  v_picked_rarity text;
  v_existing_grading_id uuid;
  v_new_grading_id uuid;
  v_pet_inserted int := 0;
  v_total_pets int;
begin
  select id into v_user_id from users where user_id = 'min';
  if not found then
    raise notice '[min fill empties] user min 미존재 — skip';
    return;
  end if;

  -- 사용 중 슬랩 풀 — 같은 grading_id 가 두 곳에 들어가는 것 방지.
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

  select coalesce(main_cards_by_type, '{}'::jsonb) into v_slots
    from users where id = v_user_id;

  foreach v_type in array v_types loop
    v_existing := coalesce(v_slots -> v_type, '[]'::jsonb);
    v_count := jsonb_array_length(v_existing);

    -- 이 슬롯의 기존 card_id 목록 — 동일 슬롯 내 중복 방지.
    v_slot_card_ids := array(
      select g.card_id
        from jsonb_array_elements_text(v_existing) e
        join psa_gradings g on g.id = (e.value)::uuid
    );

    while v_count < 3 loop
      v_card_id := null;
      v_picked_rarity := null;

      -- MUR → UR → SAR 순으로 후보 탐색. 같은 슬롯 내 미사용 card_id 중
      -- (wild_type 또는 wild_type_2 일치) 첫번째 카드 채택.
      foreach v_rarity in array v_rarity_priority loop
        select ct.card_id, ct.rarity into v_card_id, v_picked_rarity
          from card_types ct
         where ct.rarity = v_rarity
           and (ct.wild_type = v_type or ct.wild_type_2 = v_type)
           and not (ct.card_id = any(v_slot_card_ids))
         order by ct.card_id
         limit 1;
        if v_card_id is not null then exit; end if;
      end loop;

      if v_card_id is null then exit; end if;

      -- 보유 free PCL10 슬랩 재사용 (전시/방어덱/타슬롯 미사용) → 없으면 INSERT.
      select g.id into v_existing_grading_id
        from psa_gradings g
       where g.user_id = v_user_id
         and g.card_id = v_card_id
         and g.grade = 10
         and not (g.id = any(v_used_grading_ids))
       limit 1;

      if v_existing_grading_id is null then
        insert into psa_gradings (user_id, card_id, grade, rarity)
        values (v_user_id, v_card_id, 10, v_picked_rarity)
        returning id into v_new_grading_id;
        v_pet_inserted := v_pet_inserted + 1;
      else
        v_new_grading_id := v_existing_grading_id;
      end if;

      v_existing := v_existing || to_jsonb(v_new_grading_id::text);
      v_used_grading_ids := v_used_grading_ids || v_new_grading_id;
      v_slot_card_ids := v_slot_card_ids || v_card_id;
      v_count := v_count + 1;
    end loop;

    if v_count > 0 then
      v_slots := jsonb_set(v_slots, array[v_type], v_existing, true);
    end if;
  end loop;

  update users set main_cards_by_type = v_slots where id = v_user_id;
  update users set pet_score = compute_user_pet_score(v_user_id) where id = v_user_id;

  if v_pet_inserted > 0 then
    update users set pcl_10_wins = coalesce(pcl_10_wins, 0) + v_pet_inserted
     where id = v_user_id;
  end if;

  select sum(jsonb_array_length(value))::int into v_total_pets
    from jsonb_each(v_slots);

  raise notice '[min fill empties] 신규 슬랩 %장 INSERT, 총 펫 %마리, % 속성',
    v_pet_inserted, v_total_pets,
    (select count(*) from jsonb_object_keys(v_slots));
end $$;

-- 마이그레이션: 20260720_seed_min_fill_pet_slots_mur_ur_sar.sql
