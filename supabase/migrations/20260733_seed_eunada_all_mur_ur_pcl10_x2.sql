-- ============================================================
-- eunada 카드지갑 시드 — 모든 MUR + UR 카드 PCL10 2장씩 추가.
--
-- 사용자 요구:
--   "eunada 계정에 모든 속성 MUR, UR 카드 2장씩 시드로 카드지갑에
--    넣어줘."
--
-- 20260732 (hun MUR+UR x2) 와 동일 패턴 — 대상 사용자만 변경.
--
-- source of truth: card_types 테이블 (rarity in ('MUR','UR') 인 모든
-- card_id).
--
-- 정책:
--   · psa_gradings INSERT (grade=10, rarity 는 card_types 에서 그대로) —
--     card_id × 2 row.
--   · pokedex_entries 미터치 → 도감 미반영.
--   · users.main_card_ids / main_cards_by_type 미터치 → 펫 자동 등록 X.
--   · gym_ownerships.defense_pet_ids 미터치 → 체육관 방어덱 X.
--   · showcases / showcase_cards 미터치 → 전시 X.
--   · pcl_10_wins += inserted_count (감별 누적 통계 일관성).
--
-- 멱등 주의: 단순 INSERT — CI checksum 원장 덕에 정상 운영 중엔 1회만
-- 적용. 본문 수정 시 재실행되니 의도 없으면 손대지 말 것.
--
-- 의존성: 20260664 / 20260679 등 card_types 시드.
-- ============================================================

do $$
declare
  v_user_id uuid;
  v_rec record;
  v_total_inserted int := 0;
  v_distinct_cards int := 0;
begin
  select id into v_user_id from users where user_id = 'eunada';
  if not found then
    raise notice '[eunada MUR+UR x2 seed] user eunada 미존재 — skip';
    return;
  end if;

  for v_rec in
    select ct.card_id, ct.rarity
      from card_types ct
     where ct.rarity in ('MUR', 'UR')
     order by ct.rarity, ct.card_id
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

  raise notice '[eunada MUR+UR x2 seed] distinct card=% / 추가 슬랩=% (PCL10), pcl_10_wins +%',
    v_distinct_cards, v_total_inserted, v_total_inserted;
end $$;

notify pgrst, 'reload schema';

-- 마이그레이션: 20260733_seed_eunada_all_mur_ur_pcl10_x2.sql
