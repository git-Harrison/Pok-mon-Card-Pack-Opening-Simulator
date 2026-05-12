-- ============================================================
-- 체육관 챕터 4 — 보스 AOE 파워 강화
--
-- 피드백: "보스의 광역 스킬이 너무 약해"
--
-- 현재값 → 변경:
--   ch4-b2-s2 절망의 파동   0.8 → 1.6 (×2.0)
--   ch4-b3-s2 드래곤 폭풍   1.0 → 1.8 (×1.8)
--   ch4-b4-s2 그림자 폭발   1.2 → 2.0 (×1.67)
--
-- engine 의 역할별 AOE 보정 (tank 75% / dealer 120% / supporter 105%) 는
-- 그대로 — 데미지 차등은 의도된 디자인.
-- ============================================================

update ch4_boss_skills set power = 1.6 where id = 'ch4-b2-s2';
update ch4_boss_skills set power = 1.8 where id = 'ch4-b3-s2';
update ch4_boss_skills set power = 2.0 where id = 'ch4-b4-s2';

notify pgrst, 'reload schema';
