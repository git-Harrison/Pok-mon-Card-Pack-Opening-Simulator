-- ============================================================
-- eunada / qwer1413 펫 전체 초기화 + 속성별 MUR > UR > SAR 재등록.
--
-- 사용자 요구:
--   "eunada / qwer1413 계정 등록 펫 전부 삭제 후 속성에 맞게 MUR >
--    UR > SAR 순으로 새로 등록. MUR 우선 전부 채우고, 중복이거나
--    속성 MUR 없으면 UR → SAR."
--
-- 단일 트랜잭션 두 단계 (각 유저별 반복):
--   1) main_cards_by_type / main_card_ids 모두 '{}'/'{}' 로 초기화.
--      전시 / 방어덱 미터치 (요청 범위 밖).
--   2) 18 wildType × 3 슬롯 모두 채움 — 빈 자리에 MUR > UR > SAR
--      우선순위로:
--        · 같은 슬롯 내 동일 card_id 중복 X.
--        · 같은 grading_id 가 다른 슬롯/전시/방어덱 에 동시 사용 X
--          (cross-slot 검사).
--        · 보유 free PCL10 슬랩 재사용 우선, 없으면 psa_gradings INSERT.
--        · 카탈로그에 적합 카드가 더 없으면 그 type 만 일부 채우고 종료.
--
-- 룰 (서버 set_pet_for_type 와 일치):
--   - 펫 등록은 wild_type 또는 wild_type_2 일치 시만.
--   - 트레이너/에너지/굿즈 (wild_type null) 은 자동 제외 (rarity 필터 +
--     wild_type 매칭으로).
--   - pet_score 는 compute_user_pet_score 로 일괄 재계산.
--
-- 멱등: 매 실행 시 main_cards_by_type 을 '{}'에서 시작해 동일 결과로
--   재구성. 슬랩은 부족분만 INSERT (보유분 재사용).
--
-- 패턴: 20260710 hun fill + 20260706 hun reset 결합 + min 분 (20260720)
--   과 동일 priority.
-- ============================================================

do $$
declare
  v_target_users constant text[] := array['eunada', 'qwer1413'];
  v_user_login text;
  v_user_id uuid;
  v_used_grading_ids uuid[];
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
  v_pet_inserted int;
  v_total_pets int;
begin
  foreach v_user_login in array v_target_users loop
    select id into v_user_id from users where user_id = v_user_login;
    if not found then
      raise notice '[% pet reset] user 미존재 — skip', v_user_login;
      continue;
    end if;

    -- ── 1) 펫 등록 전체 초기화 ──
    update users
       set main_cards_by_type = '{}'::jsonb,
           main_card_ids      = '{}'::uuid[]
     where id = v_user_id;

    v_pet_inserted := 0;
    v_slots := '{}'::jsonb;

    -- 사용 중 슬랩 풀 — 전시/방어덱은 미터치라 그대로 사용 풀에서 제외.
    v_used_grading_ids := array(
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

    -- ── 2) 18 type × 3 슬롯 새로 채움 ──
    foreach v_type in array v_types loop
      v_existing := '[]'::jsonb;
      v_count := 0;
      v_slot_card_ids := '{}'::text[];

      while v_count < 3 loop
        v_card_id := null;
        v_picked_rarity := null;

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

    select coalesce(sum(jsonb_array_length(value)), 0)::int into v_total_pets
      from jsonb_each(v_slots);

    raise notice '[% pet reset] 신규 슬랩 %장 INSERT, 총 펫 %마리, % 속성',
      v_user_login, v_pet_inserted, v_total_pets,
      (select count(*) from jsonb_object_keys(v_slots));
  end loop;
end $$;

-- 마이그레이션: 20260721_seed_eunada_qwer1413_pet_reset_mur_ur_sar.sql
