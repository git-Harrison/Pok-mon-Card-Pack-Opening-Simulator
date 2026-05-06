-- ============================================================
-- hun 계정 테스트 데이터 — 펫 초기화 + 우선순위 재등록 + MUR 종류별 1장.
--
-- 단일 트랜잭션으로 3단계 처리:
--   1) hun 의 main_cards_by_type / main_card_ids 모두 비움 (전시·방어덱
--      미터치 — 이번 요청 범위 밖).
--   2) hun 의 PCL10 슬랩을 희귀도 우선 (MUR > UR > SAR > SR) 으로 정렬,
--      각 카드의 (wild_type, wild_type_2) 중 빈 자리 있는 type slot 에
--      배치. 같은 card_id 는 1번만 (다른 type slot 에 중복 X). 사용 중
--      (전시/방어덱) 카드는 제외.
--   3) card_types.rarity='MUR' 중 hun 미보유 카드만 PCL10 슬랩 1장씩
--      INSERT (이미 보유 중이면 skip — 종류별 1장 유지).
--
-- 룰 그대로 유지:
--   - 펫 등록은 같은 속성 (1차 또는 2차) 일치 시만 가능.
--   - 트레이너/에너지/굿즈 (wild_type null) 은 펫 후보에서 제외.
--   - 같은 card_id 가 여러 type slot 에 들어가지 않게 (서버 set_pet_for_type
--     의 cross-slot 중복 검사와 일치).
--   - pet_score 는 compute_user_pet_score 로 일괄 재계산.
-- ============================================================

do $$
declare
  v_user_id uuid;
  v_used_ids uuid[] := '{}'::uuid[];
  v_used_card_ids text[] := '{}'::text[];
  v_slots jsonb := '{}'::jsonb;
  v_slab record;
  v_type text;
  v_existing_arr jsonb;
  v_picked_type text;
  v_pet_count int := 0;
  v_inserted_mur int;
begin
  select id into v_user_id from users where user_id = 'hun';
  if not found then
    raise notice '[hun seed] user hun 미존재 — skip';
    return;
  end if;

  -- ── 1) 펫 등록 전체 초기화 ──
  update users
     set main_cards_by_type = '{}'::jsonb,
         main_card_ids = '{}'::uuid[]
   where id = v_user_id;

  -- ── 사용 중 슬랩 (전시 + 방어덱) 수집 — 펫 후보에서 제외 ──
  v_used_ids := array(
    select sc.grading_id
      from showcase_cards sc
      join user_showcases us on us.id = sc.showcase_id
     where us.user_id = v_user_id
       and sc.grading_id is not null
  ) || array(
    select x
      from gym_ownerships go,
           unnest(coalesce(go.defense_pet_ids, '{}'::uuid[])) x
     where go.owner_user_id = v_user_id
       and go.defense_pet_ids is not null
  );

  -- ── 2) 희귀도 우선 펫 슬롯 채우기 ──
  -- 후보 = hun 의 PCL10 슬랩 중 (MUR/UR/SAR/SR) + 사용중 아님 + 카드
  -- 속성 있음 (트레이너 제외). MUR>UR>SAR>SR 순으로 처리해서 높은 등급
  -- 우선 등록.
  for v_slab in
    select g.id, g.card_id, g.rarity, ct.wild_type, ct.wild_type_2
      from psa_gradings g
      join card_types ct on ct.card_id = g.card_id
     where g.user_id = v_user_id
       and g.grade = 10
       and g.rarity in ('MUR','UR','SAR','SR')
       and ct.wild_type is not null
       and not (g.id = any(v_used_ids))
     order by
       case g.rarity
         when 'MUR' then 1 when 'UR'  then 2
         when 'SAR' then 3 when 'SR'  then 4
         else 99
       end,
       g.graded_at
  loop
    -- 같은 card_id 가 이미 다른 slot 에 들어가 있으면 skip
    -- (서버 set_pet_for_type 의 cross-slot 중복 검사와 일관).
    if v_slab.card_id = any(v_used_card_ids) then
      continue;
    end if;

    -- 카드의 가능 type 후보 (1차 우선, 그 다음 2차).
    v_picked_type := null;
    foreach v_type in array
      array_remove(array[v_slab.wild_type, v_slab.wild_type_2], null)
    loop
      v_existing_arr := coalesce(v_slots -> v_type, '[]'::jsonb);
      if jsonb_array_length(v_existing_arr) < 3 then
        v_picked_type := v_type;
        exit;
      end if;
    end loop;

    if v_picked_type is not null then
      v_existing_arr := coalesce(v_slots -> v_picked_type, '[]'::jsonb);
      v_slots := jsonb_set(
        v_slots, array[v_picked_type],
        v_existing_arr || to_jsonb(v_slab.id::text), true
      );
      v_used_card_ids := v_used_card_ids || v_slab.card_id;
      v_pet_count := v_pet_count + 1;
    end if;
  end loop;

  update users
     set main_cards_by_type = v_slots
   where id = v_user_id;

  update users
     set pet_score = compute_user_pet_score(v_user_id)
   where id = v_user_id;

  raise notice '[hun seed] 펫 슬롯 % 마리 등록 (% 속성)',
    v_pet_count,
    (select count(*) from jsonb_object_keys(v_slots));

  -- ── 3) MUR 카드 종류별 1장 카드지갑 보충 ──
  -- 이미 보유 중이면 skip — "종류별 1개 보유" 유지. card_types 의 모든
  -- MUR 카드 중 hun 미보유 분만 INSERT. (20260689 시드 패턴과 동일.)
  with new_inserts as (
    insert into psa_gradings (user_id, card_id, grade, rarity)
    select v_user_id, ct.card_id, 10, 'MUR'
      from card_types ct
     where ct.rarity = 'MUR'
       and not exists (
         select 1 from psa_gradings g
          where g.user_id = v_user_id
            and g.card_id = ct.card_id
            and g.grade = 10
       )
    returning id
  )
  select count(*)::int into v_inserted_mur from new_inserts;

  raise notice '[hun seed] MUR 보충: % 장 신규 INSERT (이미 있는 카드는 skip)',
    v_inserted_mur;

  -- pcl_10_wins 카운트도 일관되게 누적 (20260689 패턴).
  if v_inserted_mur > 0 then
    update users
       set pcl_10_wins = coalesce(pcl_10_wins, 0) + v_inserted_mur
     where id = v_user_id;
  end if;
end $$;

-- 마이그레이션: 20260706_seed_hun_pet_reset_and_mur_kit.sql
