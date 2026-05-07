-- ============================================================
-- 모든 유저 시드 — 속성별 MUR 카드 PCL10 슬랩 5장씩 카드지갑.
--
-- 사용자 요구:
--   "모든 유저에게 PCL10등급 속성별로 MUR 카드 5장씩 카드지갑에 시드로
--    넣어줘"
--
-- 정책:
--   · 18 wildType × 사용자 별로 — 그 type 에 eligible (wild_type 또는
--     wild_type_2 일치) 한 MUR card_id 들에 대해 각 5장 보유 보장.
--   · MUR 이 dual-type (예: m3-117 = 땅/벌레) 인 경우 두 type 모두에서
--     eligible 로 잡혀 5장 보유 보장 — 결과적으로 5장 (중복 카운트 X,
--     멱등 INSERT 가 부족분만 채움).
--   · 카탈로그에 그 type 에 해당하는 MUR 가 0 개면 그 type 스킵 (예: 풀/
--     불꽃/물/전기/얼음/바위/에스퍼 — 현재 MUR 카탈로그에 미존재).
--   · psa_gradings INSERT 만. main_card_ids / main_cards_by_type / 도감
--     / 전시 / 방어덱 미터치.
--   · pcl_10_wins 카운터 += 추가된 슬랩 수 (감별 누적 통계 일관성).
--
-- 멱등:
--   · per (user, card_id) 부족분만 INSERT. 이미 ≥5 보유 시 skip.
--   · 본 시드 재실행 시 (CI checksum 변경) 변동 없음 — 누적 5장 유지.
--
-- 의존성: 20260642+ (card_types 테이블), 20260703 (wild_type_2 컬럼).
-- ============================================================

do $$
declare
  v_target_per_card constant int := 5;
  v_types constant text[] := array[
    '풀','불꽃','물','전기','얼음','바위','땅','에스퍼',
    '격투','독','비행','벌레','고스트','드래곤','악','강철','페어리','노말'
  ];
  v_user record;
  v_type text;
  v_card record;
  v_existing int;
  v_to_insert int;
  v_user_inserted int;
  v_total_inserted int := 0;
  v_users_touched int := 0;
begin
  for v_user in select id from users loop
    v_user_inserted := 0;

    foreach v_type in array v_types loop
      for v_card in
        select ct.card_id
          from card_types ct
         where ct.rarity = 'MUR'
           and (ct.wild_type = v_type or ct.wild_type_2 = v_type)
         order by ct.card_id
      loop
        select count(*)::int into v_existing
          from psa_gradings
         where user_id = v_user.id
           and card_id = v_card.card_id
           and grade = 10;

        v_to_insert := v_target_per_card - v_existing;
        if v_to_insert <= 0 then continue; end if;

        insert into psa_gradings (user_id, card_id, grade, rarity)
        select v_user.id, v_card.card_id, 10, 'MUR'
          from generate_series(1, v_to_insert);

        v_user_inserted := v_user_inserted + v_to_insert;
      end loop;
    end loop;

    if v_user_inserted > 0 then
      update users
         set pcl_10_wins = coalesce(pcl_10_wins, 0) + v_user_inserted
       where id = v_user.id;
      v_total_inserted := v_total_inserted + v_user_inserted;
      v_users_touched := v_users_touched + 1;
    end if;
  end loop;

  raise notice '[all-users MUR x5] users touched=% / 총 INSERT 슬랩=%',
    v_users_touched, v_total_inserted;
end $$;

notify pgrst, 'reload schema';

-- 마이그레이션: 20260737_seed_all_users_mur_pcl10_x5.sql
