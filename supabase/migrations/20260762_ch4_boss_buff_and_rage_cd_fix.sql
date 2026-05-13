-- ============================================================
-- 체육관 챕터 4 — 보스 1/2/3 강화 + 광폭화 cd 버그 수정
--
-- 피드백:
--   1) "1, 2, 3 보스 너무 쉬워" → HP/ATK 상향
--   2) "마지막 보스 광역 스킬 사용 시 데미지가 안 들어감"
--      근본 원인: Stage 4 phase 2 광폭화 (s4 self_buff) cd_turns=0
--        → 매 라운드 self_buff spam (ai_priority 7 > AOE 6)
--        → AOE s2 가 영원히 발동 안 됨
--      수정: 광폭화 cd_turns 0 → 99 (phase 2 진입 시 1회만)
--
-- HP / ATK:
--   Stage 1   500k → 1.0M ,  15k → 22k
--   Stage 2   900k → 1.6M ,  25k → 35k
--   Stage 3   1.4M → 2.2M ,  40k → 52k
--   Stage 4   1.8M (유지) , 60k (유지)
-- ============================================================

update ch4_bosses set base_hp = 1000000, base_atk = 22000 where id = 'ch4-boss-1';
update ch4_bosses set base_hp = 1600000, base_atk = 35000 where id = 'ch4-boss-2';
update ch4_bosses set base_hp = 2200000, base_atk = 52000 where id = 'ch4-boss-3';

update ch4_boss_skills set cooldown_turns = 99 where id = 'ch4-b4-s4';

notify pgrst, 'reload schema';
