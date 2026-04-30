-- ============================================================
-- rmstn137 계정 시드 — 화이트 플레어 (SV11W) MUR PCL10 슬랩 1장 카드지갑.
--
-- 사용자 요구:
--   "rmstn137 계정 카드지갑에 화이트 플레어 팩에서 나오는 MUR 카드
--    1장 시드. PCL10, 실존 카드 데이터 기준, 카드지갑에만 추가."
--
-- 대상 카드 (실제 존재, card_types DB 검증):
--   · sv11w-174  레시라무 ex (MUR, 드래곤) — 화이트 플레어 #174
--     ※ 본 set 의 유일한 MUR 카드 (BWR-원본 chase).
--
-- 정책 (20260668 hun sv11 시드 / 20260682 kim 풀 UR 시드 패턴 그대로):
--   · psa_gradings INSERT 1장 (grade=10, rarity='MUR').
--   · pokedex_entries 미터치 — 도감 등록 안 됨.
--   · users.main_card_ids / main_cards_by_type 미터치 — 펫 자동 등록 X.
--   · gym_ownerships.defense_pet_ids 미터치 — 체육관 방어덱 X.
--   · showcases / showcase_cards 미터치 — 전시 X.
--   · pcl_10_wins +1 (감별 누적 통계 일관성).
--
-- 멱등 — 이미 같은 card_id 의 PCL10 슬랩이 1장 이상 있으면 skip.
--
-- 의존성: 20260664 (card_types — sv11w 카드 카탈로그 시드).
-- ============================================================

do $$
declare
  v_user_id uuid;
  v_card_id constant text := 'sv11w-174';
  v_existing int;
begin
  select id into v_user_id from users where user_id = 'rmstn137';
  if not found then
    raise notice '[rmstn137 sv11w mur seed] user rmstn137 미존재 — skip';
    return;
  end if;

  if not exists (
    select 1 from card_types
     where card_id = v_card_id and rarity = 'MUR'
  ) then
    raise notice '[rmstn137 sv11w mur seed] card_types 에 % (MUR) 없음 — skip',
      v_card_id;
    return;
  end if;

  select count(*)::int into v_existing
    from psa_gradings
   where user_id = v_user_id
     and card_id = v_card_id
     and grade = 10;

  if v_existing >= 1 then
    raise notice '[rmstn137 sv11w mur seed] card=% 이미 % 장 보유 — skip',
      v_card_id, v_existing;
    return;
  end if;

  insert into psa_gradings (user_id, card_id, grade, rarity)
    values (v_user_id, v_card_id, 10, 'MUR');

  update users
     set pcl_10_wins = coalesce(pcl_10_wins, 0) + 1
   where id = v_user_id;

  raise notice '[rmstn137 sv11w mur seed] card=% PCL10 1장 추가 (pcl_10_wins +1)',
    v_card_id;
end $$;

notify pgrst, 'reload schema';
