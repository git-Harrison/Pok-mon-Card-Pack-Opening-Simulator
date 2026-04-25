-- ============================================================
-- 시즌 리셋 — 랭킹 카운터 0 / sabotage·gifts·taunts 초기화 /
-- 모든 사용자 포인트를 1,000만p 로 통일.
--
-- 보존되는 것:
--   * users 행 그대로 (캐릭터·닉네임·도감·main_card_ids)
--   * psa_gradings (보유 슬랩)
--   * pokedex_entries
--   * showcase_cards / user_showcases (전시)
--
-- 초기화되는 것:
--   * users.pcl_10_wins = 0
--   * users.wild_wins = 0
--   * users.showcase_rank_pts = 0
--   * users.points = 10,000,000
--   * sabotage_logs 전체 비움
--   * gifts 전체 비움 (대기 중 선물 포함, 24h 일일 한도 윈도우 리셋)
--   * taunts 전체 비움 (24h 한도 윈도우 + 인박스 리셋)
--
-- 재실행해도 결과가 같으므로 idempotent.
-- ============================================================

update users set
  pcl_10_wins      = 0,
  wild_wins        = 0,
  showcase_rank_pts = 0,
  points           = 10000000;

delete from sabotage_logs;
delete from gifts;
delete from taunts;

notify pgrst, 'reload schema';
