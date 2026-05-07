-- ============================================================
-- hun 카드지갑 시드 — 현재 펫 등록 카드 전부 PCL10 2장씩 추가.
--
-- 사용자 요구:
--   "hun 계정의 지금 펫으로 등록돼있는 카드들 전부 2장씩 카드지갑에
--    추가로 넣어줘."
--
-- 정책:
--   · main_cards_by_type (현행 by-type) + main_card_ids (legacy) 양쪽
--     에서 distinct card_id 수집.
--   · 각 card_id 별 PCL10 슬랩 2장 INSERT (rarity 는 기존 펫 슬랩 row
--     에서 가져옴 — card_types 와 일치).
--   · 도감/펫/방어덱/전시 미터치 — 카드지갑에만 추가.
--   · pcl_10_wins 카운터 += 추가된 슬랩 수 (감별 누적 통계 일관성).
--
-- 멱등 주의: 이 시드는 "추가" 의도라 단순 INSERT. CI 의 checksum 원장
--   덕분에 정상 운영 중엔 1회만 적용. 파일 본문이 바뀌면 다시 적용되니
--   재실행 의도가 없다면 본문 수정 금지.
-- ============================================================

do $$
declare
  v_user_id uuid;
  v_pet_ids uuid[];
  v_rec record;
  v_total_inserted int := 0;
  v_distinct_cards int := 0;
begin
  select id into v_user_id from users where user_id = 'hun';
  if not found then
    raise notice '[hun pets x2 seed] user hun 미존재 — skip';
    return;
  end if;

  -- 펫 등록 grading_id 목록 — by-type ∪ legacy.
  select coalesce(flatten_pet_ids_by_type(coalesce(main_cards_by_type, '{}'::jsonb)), '{}'::uuid[])
       || coalesce(main_card_ids, '{}'::uuid[])
    into v_pet_ids
    from users where id = v_user_id;

  if coalesce(array_length(v_pet_ids, 1), 0) = 0 then
    raise notice '[hun pets x2 seed] hun 의 펫 등록 카드 없음 — skip';
    return;
  end if;

  -- distinct card_id 별 PCL10 2장 INSERT.
  for v_rec in
    select distinct g.card_id, g.rarity
      from psa_gradings g
     where g.id = any(v_pet_ids)
       and g.user_id = v_user_id
       and g.grade = 10
  loop
    insert into psa_gradings (user_id, card_id, grade, rarity)
    select v_user_id, v_rec.card_id, 10, v_rec.rarity
      from generate_series(1, 2);

    v_total_inserted := v_total_inserted + 2;
    v_distinct_cards := v_distinct_cards + 1;
  end loop;

  if v_total_inserted > 0 then
    update users
       set pcl_10_wins = coalesce(pcl_10_wins, 0) + v_total_inserted
     where id = v_user_id;
  end if;

  raise notice '[hun pets x2 seed] distinct card=% / 추가 슬랩=% (PCL10), pcl_10_wins +%',
    v_distinct_cards, v_total_inserted, v_total_inserted;
end $$;

notify pgrst, 'reload schema';

-- 마이그레이션: 20260725_seed_hun_duplicate_pets_x2.sql
