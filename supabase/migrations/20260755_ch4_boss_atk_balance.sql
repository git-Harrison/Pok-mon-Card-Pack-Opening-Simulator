-- ============================================================
-- 체육관 챕터 4 — 보스 ATK 대폭 상향 (밸런스 v2)
--
-- 기존 (시뮬레이션 결과): 보스 1200~3500 ATK × power 1.0 = 1.2k~3.5k dmg/hit
-- 파티 HP 가 200~600k 수준이라 hit 당 0.2~0.8% 만 깎임 → 시각적으로 변화
-- 안 보임. "HP 바가 안 줄어든다" 는 피드백 다수.
--
-- 새 값 (vs 600k HP tank 기준):
--   Stage 1 마기라스   1200 → 15000  (vs 600k = 2.5% / hit, 40hit 격파)
--   Stage 2 칠색조     1800 → 25000  (vs 600k = 4.2% / hit, 24hit)
--   Stage 3 레쿠쟈     2600 → 40000  (vs 600k = 6.7% / hit, 15hit)
--   Stage 4 기라티나   3500 → 60000  (vs 600k = 10%  / hit, 10hit)
--
-- AOE 는 power 0.8~1.2 곱해지므로 약간 줄어듦. phase 2 광폭화 시 ×1.5
-- → 기라티나 광폭화 90000 dmg 발생 가능 (vs 600k = 15% / hit).
--
-- 종료 조건은 그대로 — 전원 사망 OR 50 라운드 timeout = loss.
-- ============================================================

update ch4_bosses set base_atk = 15000 where id = 'ch4-boss-1';
update ch4_bosses set base_atk = 25000 where id = 'ch4-boss-2';
update ch4_bosses set base_atk = 40000 where id = 'ch4-boss-3';
update ch4_bosses set base_atk = 60000 where id = 'ch4-boss-4';

notify pgrst, 'reload schema';
