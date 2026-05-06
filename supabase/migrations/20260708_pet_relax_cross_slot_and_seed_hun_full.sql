-- ============================================================
-- (1) set_pet_for_type cross-slot card_id 제약 완화
-- (2) hun 펫 슬롯 wipe + MUR>UR>SAR>SR 우선 refill (인스턴스 분리)
-- (3) hun 카드지갑에 모든 MUR/UR 종류별 free 슬랩 1장 보장
--
-- 배경:
--   dual-type 시스템 도입 후 MUR (예: m2-116 메가 리자몽 X = 비행/드래곤)
--   카드를 비행 슬롯과 드래곤 슬롯에 모두 등록하려는 자연스러운 use case
--   가 있는데, set_pet_for_type 의 cross-slot 같은 card_id 검사가 거부.
--   서로 다른 PHYSICAL slab 이라면 허용해야 dual-type 의미가 살아남.
--   본 마이그레이션:
--     · RPC 의 cross-slot card_id 검사 제거 (같은 슬롯 내 grading_id
--       중복 검사는 유지, 서로 다른 슬랩은 허용).
--     · hun 펫 wipe → 18 type × 3 슬롯 채움. 각 슬롯마다 MUR>UR>SAR>SR
--       우선순위로 카탈로그에서 픽. 같은 card_id 가 여러 type 에 매칭
--       되는 경우 슬랩 INSERT 로 별도 인스턴스 생성.
--     · hun 카드지갑에 모든 MUR/UR card_id 마다 "사용 중 아닌 free 슬랩"
--       1장 보장. 펫에 들어간 슬랩은 별개로 카운트 → 추가 INSERT.
--
-- 룰 그대로 유지:
--   - SAR/SR 1차만 / UR/MUR 1차 또는 2차 일치 시 가능.
--   - 트레이너/에너지 (wild_type null) 펫 후보 제외.
--   - 같은 PHYSICAL grading_id 가 여러 슬롯에 들어가는 것은 여전히 거부.
--   - pet_score / pcl_10_wins 일괄 재계산.
-- ============================================================

-- ── (1) set_pet_for_type — cross-slot 같은 card_id 검사 제거 ──
-- 20260705 본문 그대로 + 마지막 cross-slot card_id 검사 블록만 제거.
-- 같은 PHYSICAL slab (grading_id) 이 여러 슬롯에 들어가는 것은 위에서
-- distinct id 체크로 막혀 있으며, set_pet_for_type 가 한 번에 한 type
-- slot 만 갱신하므로 별도 cross-slot 슬랩 검사는 다른 type slot 의
-- defense_pet_ids/showcase 검사가 cover (pet 슬롯은 아님). 추가 보강
-- 위해 다른 type slot 에 이미 있는 grading_id 도 거부.
create or replace function set_pet_for_type(
  p_user_id uuid,
  p_type text,
  p_grading_ids uuid[]
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ids uuid[];
  v_data jsonb;
  v_valid_count int;
  v_displayed int;
  v_def int;
  v_score int;
  v_invalid_count int;
  v_other_slot_dup int;
begin
  if p_user_id is null then
    return json_build_object('ok', false, 'error', '인증 필요.');
  end if;
  if p_type is null or length(p_type) = 0 then
    return json_build_object('ok', false, 'error', '속성을 지정해주세요.');
  end if;

  v_ids := coalesce(p_grading_ids, '{}'::uuid[]);
  if coalesce(array_length(v_ids, 1), 0) > 3 then
    return json_build_object('ok', false,
      'error', '한 속성에 최대 3마리까지만 등록할 수 있어요.');
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  if array_length(v_ids, 1) is not null then
    if (select count(distinct id) from unnest(v_ids) as id) <> array_length(v_ids, 1) then
      return json_build_object('ok', false, 'error', '같은 슬랩을 두 슬롯에 넣을 수 없어요.');
    end if;

    select count(*)::int into v_valid_count
      from psa_gradings g
     where g.id = any(v_ids) and g.user_id = p_user_id and g.grade = 10;
    if v_valid_count <> array_length(v_ids, 1) then
      return json_build_object('ok', false, 'error',
        '본인의 PCL10 슬랩만 펫으로 등록할 수 있어요.');
    end if;

    select count(*)::int into v_displayed
      from showcase_cards where grading_id = any(v_ids);
    if v_displayed > 0 then
      return json_build_object('ok', false, 'error',
        '전시 중인 슬랩은 펫으로 등록할 수 없어요.');
    end if;

    select count(*)::int into v_def
      from gym_ownerships
     where owner_user_id = p_user_id and defense_pet_ids && v_ids;
    if v_def > 0 then
      return json_build_object('ok', false, 'error',
        '방어 덱에 등록된 슬랩이 포함돼 있어요. 방어 덱 해제 후 다시 시도하세요.');
    end if;

    -- type 검증 — wild_type 또는 wild_type_2 = p_type 이면 OK.
    select count(*)::int into v_invalid_count
      from psa_gradings g
      left join card_types ct on ct.card_id = g.card_id
     where g.id = any(v_ids)
       and (ct.wild_type is null
            or (ct.wild_type <> p_type
                and (ct.wild_type_2 is null or ct.wild_type_2 <> p_type)));
    if v_invalid_count > 0 then
      return json_build_object('ok', false,
        'error', format(
          '%s 속성 슬롯에는 %s 속성 포켓몬 카드만 등록할 수 있어요. ' ||
          'UR/MUR 은 1차/2차 속성 중 하나라도 일치해야 합니다.',
          p_type, p_type));
    end if;

    -- 같은 PHYSICAL grading_id 가 다른 type slot 에 이미 있는지 검사
    -- (slab 자체 중복은 여전히 거부). 단 같은 card_id 의 다른 슬랩은 OK
    -- (dual-type MUR 가 두 type 슬롯에 각각 인스턴스로 등록 가능).
    select count(*)::int into v_other_slot_dup
      from users u,
           jsonb_each(coalesce(u.main_cards_by_type, '{}'::jsonb)) k(key, value),
           jsonb_array_elements_text(k.value) e
     where u.id = p_user_id
       and k.key <> p_type
       and (e.value)::uuid = any(v_ids);
    if v_other_slot_dup > 0 then
      return json_build_object('ok', false, 'error',
        '같은 슬랩이 다른 속성 슬롯에 이미 있어요. (같은 카드 종류는 다른 인스턴스를 사용해 주세요)');
    end if;
  end if;

  v_data := coalesce(
    (select main_cards_by_type from users where id = p_user_id),
    '{}'::jsonb
  );
  v_data := jsonb_set(v_data, array[p_type], to_jsonb(v_ids), true);

  update users
     set main_cards_by_type = v_data,
         main_card_ids = array(
           select id from unnest(coalesce(main_card_ids, '{}'::uuid[])) as id
            where not (id = any(v_ids))
         )
   where id = p_user_id;

  v_score := compute_user_pet_score(p_user_id);
  update users set pet_score = v_score where id = p_user_id;

  return json_build_object('ok', true,
    'main_cards_by_type', v_data,
    'pet_score', v_score);
end;
$$;

grant execute on function set_pet_for_type(uuid, text, uuid[]) to anon, authenticated;

-- ── (2) hun 펫 wipe + (3) refill + 카드지갑 MUR/UR 보유 보장 ──
do $$
declare
  v_user_id uuid;
  v_used_grading_ids uuid[] := '{}'::uuid[];
  v_slots jsonb := '{}'::jsonb;
  v_types constant text[] := array[
    '풀','불꽃','물','전기','얼음','바위','땅','에스퍼',
    '격투','독','비행','벌레','고스트','드래곤','악','강철','페어리','노말'
  ];
  v_type text;
  v_count int;
  v_slot_card_ids text[];
  v_rarity_priority constant text[] := array['MUR','UR','SAR','SR'];
  v_rarity text;
  v_card_id text;
  v_picked_rarity text;
  v_existing_grading_id uuid;
  v_new_grading_id uuid;
  v_existing_arr jsonb;
  v_pet_inserted int := 0;
  v_wallet_inserted int := 0;
  v_total_pets int;
  v_card_rec record;
begin
  select id into v_user_id from users where user_id = 'hun';
  if not found then
    raise notice '[hun reset+refill+wallet] user hun 미존재 — skip';
    return;
  end if;

  -- ── (2a) 펫 등록 wipe ──
  update users set main_cards_by_type = '{}'::jsonb,
                   main_card_ids = '{}'::uuid[]
   where id = v_user_id;

  -- 사용 중 슬랩 (전시/방어덱) — 펫 풀에서 제외
  v_used_grading_ids := array(
    select sc.grading_id from showcase_cards sc
     join user_showcases us on us.id = sc.showcase_id
     where us.user_id = v_user_id and sc.grading_id is not null
  ) || array(
    select x from gym_ownerships go,
              unnest(coalesce(go.defense_pet_ids, '{}'::uuid[])) x
     where go.owner_user_id = v_user_id
       and go.defense_pet_ids is not null
  );

  -- ── (2b) 펫 슬롯 채우기 — 18 type × 3 슬롯 ──
  foreach v_type in array v_types loop
    v_count := 0;
    v_slot_card_ids := '{}'::text[];
    v_existing_arr := '[]'::jsonb;

    while v_count < 3 loop
      v_card_id := null;
      v_picked_rarity := null;

      -- MUR > UR > SAR > SR 우선 — 같은 slot 내 card_id 중복 방지.
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

      -- 보유 PCL10 슬랩 중 free (다른 슬롯 / 전시 / 방어덱 미사용) 픽,
      -- 없으면 INSERT.
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

      v_existing_arr := v_existing_arr || to_jsonb(v_new_grading_id::text);
      v_used_grading_ids := v_used_grading_ids || v_new_grading_id;
      v_slot_card_ids := v_slot_card_ids || v_card_id;
      v_count := v_count + 1;
    end loop;

    if v_count > 0 then
      v_slots := jsonb_set(v_slots, array[v_type], v_existing_arr, true);
    end if;
  end loop;

  update users set main_cards_by_type = v_slots where id = v_user_id;

  -- ── (3) 카드지갑 MUR/UR 종류별 free 슬랩 1장 보장 ──
  -- 각 MUR/UR card_id 에 대해, 사용 중 아닌 free 슬랩이 1장 이상 있는지
  -- 확인 → 없으면 INSERT. 펫에 들어간 슬랩은 카운트 X (사용 중이라 wallet
  -- 의 "순수 보유" 로 안 보임).
  for v_card_rec in
    select ct.card_id, ct.rarity
      from card_types ct
     where ct.rarity in ('MUR','UR')
     order by ct.card_id
  loop
    if exists (
      select 1 from psa_gradings g
       where g.user_id = v_user_id
         and g.card_id = v_card_rec.card_id
         and g.grade = 10
         and not (g.id = any(v_used_grading_ids))  -- 펫/전시/방어덱 미사용
    ) then
      continue;  -- 이미 free 슬랩 보유
    end if;

    insert into psa_gradings (user_id, card_id, grade, rarity)
    values (v_user_id, v_card_rec.card_id, 10, v_card_rec.rarity);
    v_wallet_inserted := v_wallet_inserted + 1;
  end loop;

  -- pet_score / pcl_10_wins 재계산
  update users set pet_score = compute_user_pet_score(v_user_id)
   where id = v_user_id;
  if (v_pet_inserted + v_wallet_inserted) > 0 then
    update users
       set pcl_10_wins = coalesce(pcl_10_wins, 0)
                       + v_pet_inserted + v_wallet_inserted
     where id = v_user_id;
  end if;

  select sum(jsonb_array_length(value))::int into v_total_pets
    from jsonb_each(v_slots);

  raise notice '[hun reset+refill+wallet] 펫 INSERT % / wallet INSERT % / 펫 슬롯 %마리, % 속성',
    v_pet_inserted, v_wallet_inserted, v_total_pets,
    (select count(*) from jsonb_object_keys(v_slots));
end $$;

notify pgrst, 'reload schema';

-- 마이그레이션: 20260708_pet_relax_cross_slot_and_seed_hun_full.sql
