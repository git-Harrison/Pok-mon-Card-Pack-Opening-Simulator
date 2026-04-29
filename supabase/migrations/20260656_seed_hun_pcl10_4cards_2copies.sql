-- ============================================================
-- hun 계정 시드 — PCL10 슬랩 4종 × 각 2장 (총 8장) psa_gradings 추가.
--
-- 사용자 요구:
--   "hun 계정에 PCL10 등급 MUR/UR/SAR/SR 카드 종류별 (4종류만 있어도
--    됨 — 이상해씨/이상해꽃/파이리/피카츄 처럼) 2장씩 DB 에 넣어줘."
--
-- 정책:
--   · 등급별 카드 1종 선정 (MUR/UR/SAR/SR 각 1장의 card_id).
--   · 그 카드의 PCL10 슬랩(psa_gradings row) 을 2장씩 insert.
--   · 펫/지갑/도감 등록은 안 함 — 단순 슬랩 보유 상태만 만든다.
--   · pcl_10_wins 카운터 가산 (8장).
--
-- 멱등 보장:
--   · 이미 같은 card_id 의 PCL10 슬랩이 hun 에게 2장 이상 있으면 skip.
--   · 1장만 있으면 1장 추가하여 2장으로 맞춤.
--   · 없으면 2장 insert.
--
-- 카드 선정 우선순위:
--   1) hun 이 이미 펫에 등록한 PCL10 슬랩의 card_id 가 있으면 그걸
--      재사용 (이전 시드 20260653 와 정합성 유지).
--   2) 없으면 card_types 카탈로그에서 정렬상 첫 번째 카드.
--
-- 의존성: 20260642 (card_types).
-- ============================================================

do $$
declare
  v_user_id uuid;
  v_pet_ids uuid[];
  v_target_rarities constant text[] := array['MUR', 'UR', 'SAR', 'SR'];
  v_rarity text;
  v_card_id text;
  v_existing_count int;
  v_to_insert int;
  v_total_inserted int := 0;
begin
  select id into v_user_id from users where user_id = 'hun';
  if not found then
    raise notice 'user hun 미존재 — seed skip';
    return;
  end if;

  -- hun 이 펫에 등록한 grading_id 들 (legacy + by_type).
  select array_agg(distinct id) into v_pet_ids
    from (
      select unnest(coalesce(main_card_ids, '{}'::uuid[])) as id
        from users where id = v_user_id
      union
      select unnest(flatten_pet_ids_by_type(coalesce(main_cards_by_type, '{}'::jsonb)))
        from users where id = v_user_id
    ) t
   where id is not null;
  v_pet_ids := coalesce(v_pet_ids, '{}'::uuid[]);

  foreach v_rarity in array v_target_rarities loop
    v_card_id := null;

    -- (1) 펫 기등록 카드 우선
    select g.card_id into v_card_id
      from psa_gradings g
     where g.id = any(v_pet_ids)
       and g.user_id = v_user_id
       and g.grade = 10
       and g.rarity = v_rarity
     limit 1;

    -- (2) 폴백 — 카탈로그에서 정렬상 첫 카드
    if v_card_id is null then
      select ct.card_id into v_card_id
        from card_types ct
       where ct.rarity = v_rarity
       order by ct.card_id
       limit 1;
    end if;

    if v_card_id is null then
      raise notice '[hun seed v2] % — 카탈로그에 카드 없음', v_rarity;
      continue;
    end if;

    -- 멱등: 이미 보유한 PCL10 슬랩 수 확인
    select count(*)::int into v_existing_count
      from psa_gradings
     where user_id = v_user_id
       and card_id = v_card_id
       and grade = 10;

    v_to_insert := greatest(0, 2 - v_existing_count);

    if v_to_insert = 0 then
      raise notice '[hun seed v2] % card=% — 이미 % 장 보유, skip', v_rarity, v_card_id, v_existing_count;
      continue;
    end if;

    -- 부족분 insert
    insert into psa_gradings (user_id, card_id, grade, rarity)
      select v_user_id, v_card_id, 10, v_rarity
        from generate_series(1, v_to_insert);

    v_total_inserted := v_total_inserted + v_to_insert;
    raise notice '[hun seed v2] % card=% — % 장 신규 insert (보유 %→2)',
      v_rarity, v_card_id, v_to_insert, v_existing_count;
  end loop;

  if v_total_inserted > 0 then
    update users
       set pcl_10_wins = coalesce(pcl_10_wins, 0) + v_total_inserted
     where id = v_user_id;
    raise notice '[hun seed v2] 총 % 장 PCL10 슬랩 추가 (pcl_10_wins +%)',
      v_total_inserted, v_total_inserted;
  else
    raise notice '[hun seed v2] 추가할 슬랩 없음 (모두 이미 2장 이상 보유)';
  end if;
end $$;

notify pgrst, 'reload schema';
