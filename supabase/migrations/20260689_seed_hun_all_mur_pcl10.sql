-- ============================================================
-- hun 계정 시드 — 프로젝트 모든 MUR 카드 PCL10 슬랩 1장씩 카드지갑.
--
-- 사용자 요구:
--   "프로젝트에 존재하는 모든 종류의 MUR 카드를 1장씩 추가. 이미
--    있는 카드는 그대로 두고 추가. 카드지갑에만 (도감/펫/체육관/
--    전시 자동 반영 X)."
--
-- source of truth: card_types 테이블 (rarity='MUR' 인 모든 card_id).
-- card_types 는 set 별 시드 마이그레이션 (20260664 sv11 / 20260679 swsh
-- 등) 에서 모든 카탈로그 카드의 (card_id, wild_type, rarity) 매핑을
-- 보유. 본 시드는 그 목록을 직접 참조.
--
-- 정책 (20260668 hun sv11 / 20260682 kim 풀 UR / 20260688 rmstn137
-- sv11w 시드 패턴 그대로):
--   · psa_gradings INSERT (grade=10, rarity='MUR') — 1 row per MUR card.
--   · pokedex_entries 미터치 → 도감 미반영.
--   · users.main_card_ids / main_cards_by_type 미터치 → 펫 자동 등록 X.
--   · gym_ownerships.defense_pet_ids 미터치 → 체육관 방어덱 X.
--   · showcases / showcase_cards 미터치 → 전시 X.
--   · pcl_10_wins += inserted_count (감별 누적 통계 일관성).
--
-- 멱등:
--   · 이미 같은 card_id 의 PCL10 슬랩이 1장 이상 있으면 그 카드만 skip.
--   · "이미 있는 카드는 그대로 두고 종류별로 1장씩 더 추가" — sub-spec.
--
-- 의존성: 20260664 / 20260679 등 card_types 시드.
-- ============================================================

do $$
declare
  v_user_id uuid;
  v_inserted int;
begin
  select id into v_user_id from users where user_id = 'hun';
  if not found then
    raise notice '[hun all-mur seed] user hun 미존재 — skip';
    return;
  end if;

  -- 멱등 일괄 INSERT — card_types 의 MUR 중 hun 미보유 만 1장씩.
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
  select count(*)::int into v_inserted from new_inserts;

  if v_inserted > 0 then
    update users
       set pcl_10_wins = coalesce(pcl_10_wins, 0) + v_inserted
     where id = v_user_id;
    raise notice '[hun all-mur seed] % 종 신규 PCL10 추가 (pcl_10_wins +%)',
      v_inserted, v_inserted;
  else
    raise notice '[hun all-mur seed] 추가할 MUR 없음 (모든 종류 보유 중)';
  end if;
end $$;

notify pgrst, 'reload schema';
