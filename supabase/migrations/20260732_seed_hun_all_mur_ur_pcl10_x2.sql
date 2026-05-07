-- ============================================================
-- hun 카드지갑 시드 — 모든 MUR + UR 카드 PCL10 2장씩 추가.
--
-- 사용자 요구:
--   "hun 계정에 속성별 MUR, UR PCL10 등급 카드 2장씩 시드로 카드지갑에
--    넣어줘."
--
-- source of truth: card_types 테이블 (rarity in ('MUR','UR') 인 모든
-- card_id). card_types 는 set 별 시드 마이그레이션 (20260664 sv11 /
-- 20260679 swsh 등) 에서 모든 카탈로그 카드의 (card_id, wild_type,
-- rarity) 매핑을 보유.
--
-- 정책 (20260725 hun pets x2 / 20260689 all-mur 시드 패턴 그대로):
--   · psa_gradings INSERT (grade=10, rarity 는 card_types 에서 그대로) —
--     card_id × 2 row.
--   · pokedex_entries 미터치 → 도감 미반영.
--   · users.main_card_ids / main_cards_by_type 미터치 → 펫 자동 등록 X.
--   · gym_ownerships.defense_pet_ids 미터치 → 체육관 방어덱 X.
--   · showcases / showcase_cards 미터치 → 전시 X.
--   · pcl_10_wins += inserted_count (감별 누적 통계 일관성).
--
-- 멱등 주의: 단순 INSERT — CI checksum 원장 덕에 정상 운영 중엔 1회만
-- 적용. 본문 수정 시 재실행되니 의도 없으면 손대지 말 것 (이미 hun 이
-- 카드지갑에 같은 종류 보유여도 추가로 +2 됨).
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
  select id into v_user_id from users where user_id = 'hun';
  if not found then
    raise notice '[hun MUR+UR x2 seed] user hun 미존재 — skip';
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

  raise notice '[hun MUR+UR x2 seed] distinct card=% / 추가 슬랩=% (PCL10), pcl_10_wins +%',
    v_distinct_cards, v_total_inserted, v_total_inserted;
end $$;

notify pgrst, 'reload schema';

-- 마이그레이션: 20260732_seed_hun_all_mur_ur_pcl10_x2.sql
