-- ============================================================
-- 전체 유저 카드지갑 시드 — 모든 MUR/UR/SAR/SR 카드 PCL10 3장씩.
--
-- 사용자 요구:
--   "모든 계정에 모든 속성 PCL10 MUR, UR, SAR, SR 카드 전부 3장씩
--    카드지갑에 시드로 넣어줘."
--
-- source of truth: card_types (rarity in MUR/UR/SAR/SR).
-- 정책 (20260732 / 20260737 시드 패턴):
--   · psa_gradings INSERT 만 — 도감/펫/방어덱/전시 미터치.
--   · pcl_10_wins += inserted_count (감별 누적 통계 일관성).
--   · 모든 유저 대상 — 예외 없음.
--
-- 스케일: card_types 의 MUR(8) + UR(61) + SAR(184) + SR(243) = 496 종.
--   유저당 INSERT 1488장 (496 × 3). 7 유저 기준 ~10,416 row.
--
-- 멱등 주의: 단순 INSERT — CI checksum 원장이 정상 운영 중엔 1회만 적용.
--   본문 수정 시 재실행되니 의도 없으면 파일 손대지 말 것.
--
-- 의존성: card_types (20260664 / 20260679 등).
-- ============================================================

do $$
declare
  v_user record;
  v_rec record;
  v_user_inserted int;
  v_user_distinct int;
  v_grand_total int := 0;
begin
  for v_user in select id, user_id from users order by user_id
  loop
    v_user_inserted := 0;
    v_user_distinct := 0;

    for v_rec in
      select ct.card_id, ct.rarity
        from card_types ct
       where ct.rarity in ('MUR', 'UR', 'SAR', 'SR')
       order by ct.rarity, ct.card_id
    loop
      insert into psa_gradings (user_id, card_id, grade, rarity)
      select v_user.id, v_rec.card_id, 10, v_rec.rarity
        from generate_series(1, 3);

      v_user_inserted := v_user_inserted + 3;
      v_user_distinct := v_user_distinct + 1;
    end loop;

    if v_user_inserted > 0 then
      update users
         set pcl_10_wins = coalesce(pcl_10_wins, 0) + v_user_inserted
       where id = v_user.id;
    end if;

    raise notice '[seed all-users high-rarity x3] % : % 종 × 3 = % 슬랩 추가',
      v_user.user_id, v_user_distinct, v_user_inserted;
    v_grand_total := v_grand_total + v_user_inserted;
  end loop;

  raise notice '[seed all-users high-rarity x3] 전체 합계: % 슬랩', v_grand_total;
end $$;

notify pgrst, 'reload schema';

-- 마이그레이션: 20260741_seed_all_users_high_rarity_pcl10_x3.sql
