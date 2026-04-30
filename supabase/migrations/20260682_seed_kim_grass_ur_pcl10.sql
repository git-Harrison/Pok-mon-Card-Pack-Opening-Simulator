-- ============================================================
-- kim 계정 시드 — 풀속성 UR PCL10 슬랩 3장 카드지갑 추가.
--
-- 사용자 요구:
--   "kim 카드지갑에 풀속성 UR PCL10 카드 3장 추가. 부족하면 UR 2 + SAR 1.
--    카드지갑(psa_gradings) 에만 — 도감/펫/체육관/전시 미반영."
--
-- 카탈로그 검색 (resolveCardType '풀' + rarity UR):
--   sv8a-233  무쇠잎새 ex
--   sv8a-234  초록가면 오거폰 ex (골드)
--   s6a-088   리피아 VMAX
--   s6a-089   리피아 VMAX (동일명, 다른 시크릿 버전)
--   → 4장 가용 (≥3) 이므로 옵션 1 (UR 3장) 적용.
--   선택: sv8a-233, sv8a-234, s6a-088 (다양성 — sv8a 2 + s6a 1).
--
-- 정책 (20260668 hun sv11 시드와 동일):
--   · psa_gradings INSERT 만 — 슬랩 보유 상태만 생성.
--   · pokedex_entries 미터치 — 도감 등록 안 됨 (PCL10 획득 시 등록 정책
--     은 grading 절차 통해서만; 직접 INSERT 는 도감 미반영).
--   · users.main_card_ids / main_cards_by_type 미터치 — 펫 자동 등록 X.
--   · gym_ownerships.defense_pet_ids 미터치 — 체육관 방어덱 X.
--   · showcases 미터치 — 전시 X.
--   · pcl_10_wins 카운터만 가산 (감별 누적 통계 일관성).
--
-- 멱등:
--   · 동일 card_id 의 PCL10 슬랩 1장 이상 보유 시 해당 카드만 skip.
--
-- 의존성: 20260679 (card_types — S 시리즈 카탈로그 시드).
-- ============================================================

do $$
declare
  v_user_id uuid;
  v_target_cards constant text[] := array[
    'sv8a-233',  -- 무쇠잎새 ex (UR / 풀)
    'sv8a-234',  -- 초록가면 오거폰 ex (골드) (UR / 풀)
    's6a-088'    -- 리피아 VMAX (UR / 풀)
  ];
  v_card_id text;
  v_existing int;
  v_total_inserted int := 0;
begin
  select id into v_user_id from users where user_id = 'kim';
  if not found then
    raise notice '[kim grass ur seed] user kim 미존재 — skip';
    return;
  end if;

  foreach v_card_id in array v_target_cards loop
    -- 카탈로그 검증 — 실제 존재 + UR + 풀속성 인지 확인.
    if not exists (
      select 1 from card_types
       where card_id = v_card_id
         and rarity = 'UR'
         and wild_type = '풀'
    ) then
      raise notice '[kim grass ur seed] card_types 에 % (UR/풀) 없음 — skip',
        v_card_id;
      continue;
    end if;

    -- 멱등 — 이미 동일 card_id PCL10 1장 이상 보유 시 skip.
    select count(*)::int into v_existing
      from psa_gradings
     where user_id = v_user_id
       and card_id = v_card_id
       and grade = 10;

    if v_existing >= 1 then
      raise notice '[kim grass ur seed] card=% 이미 % 장 보유 — skip',
        v_card_id, v_existing;
      continue;
    end if;

    insert into psa_gradings (user_id, card_id, grade, rarity)
      values (v_user_id, v_card_id, 10, 'UR');

    v_total_inserted := v_total_inserted + 1;
    raise notice '[kim grass ur seed] card=% PCL10 1장 추가', v_card_id;
  end loop;

  if v_total_inserted > 0 then
    update users
       set pcl_10_wins = coalesce(pcl_10_wins, 0) + v_total_inserted
     where id = v_user_id;
    raise notice '[kim grass ur seed] 총 % 장 추가 (pcl_10_wins +%)',
      v_total_inserted, v_total_inserted;
  else
    raise notice '[kim grass ur seed] 추가할 슬랩 없음 (모두 이미 보유)';
  end if;
end $$;

notify pgrst, 'reload schema';
