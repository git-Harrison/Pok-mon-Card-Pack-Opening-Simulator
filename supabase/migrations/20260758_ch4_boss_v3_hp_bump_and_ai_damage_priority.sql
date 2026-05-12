-- ============================================================
-- 체육관 챕터 4 — 보스 밸런스 v3
--
-- 피드백:
--   "보스가 너무 약하다 — HP가 빨리 깎이고, 공격을 잘 안 한다"
--
-- 원인 1: HP 너무 낮음 (Stage 1 = 200k → 강력한 파티가 5~8 라운드에 격파)
-- 원인 2: 비공격 스킬 (debuff/heal/buff) 의 ai_priority 가 공격 스킬보다
--          높아서 자주 시전되고, 보스가 "공격 안 하는" 느낌.
--
-- 수정 1) 보스 HP 상향:
--   Stage 1: 200k →  500k  (×2.5)
--   Stage 2: 500k →  900k  (×1.8)
--   Stage 3: 1M   → 1.4M   (×1.4)
--   Stage 4: 2M   → 1.8M   (전체 50 라운드 cap 내 클리어 가능하게 약간 ↓)
--
-- 수정 2) 보스 스킬 priority 재배치 (damage 위주):
--   AOE        → pri 6  (가장 큼지막한 광역, cd 3 마다 1회)
--   대형 단일타 → pri 5  (큰 한 방, cd 2~4)
--   기본 단일타 → pri 4  (cd 0, 다른 스킬 cd 중일 때 fill)
--   self_heal   → pri 3  (가끔, cd 4)
--   debuff      → pri 1  (거의 안 나옴)
--   광폭화 self_buff (Stage 4 phase 2) → pri 7 (즉시 발동)
--   차원 베기   phase 2  → pri 8 (가장 강한 한 방)
-- ============================================================

-- ── HP 상향 ──
update ch4_bosses set base_hp =  500000 where id = 'ch4-boss-1';
update ch4_bosses set base_hp =  900000 where id = 'ch4-boss-2';
update ch4_bosses set base_hp = 1400000 where id = 'ch4-boss-3';
update ch4_bosses set base_hp = 1800000 where id = 'ch4-boss-4';

-- ── Stage 1 마기라스 priority ──
update ch4_boss_skills set ai_priority = 4 where id = 'ch4-b1-s1';  -- 깨물어부수기 (single 1.0, cd 0)
update ch4_boss_skills set ai_priority = 5 where id = 'ch4-b1-s2';  -- 락 슬라이드   (single 1.4, cd 2)
update ch4_boss_skills set ai_priority = 1 where id = 'ch4-b1-s3';  -- 위협의 포효   (debuff)

-- ── Stage 2 칠색조 priority ──
update ch4_boss_skills set ai_priority = 4 where id = 'ch4-b2-s1';  -- 영혼 베기    (single)
update ch4_boss_skills set ai_priority = 6 where id = 'ch4-b2-s2';  -- 절망의 파동  (aoe)
update ch4_boss_skills set ai_priority = 1 where id = 'ch4-b2-s3';  -- 망각         (debuff)
update ch4_boss_skills set ai_priority = 3 where id = 'ch4-b2-s4';  -- 영혼 흡수    (self_heal)

-- ── Stage 3 레쿠쟈 priority ──
update ch4_boss_skills set ai_priority = 4 where id = 'ch4-b3-s1';  -- 강철 발톱
update ch4_boss_skills set ai_priority = 6 where id = 'ch4-b3-s2';  -- 드래곤 폭풍 (aoe)
update ch4_boss_skills set ai_priority = 3 where id = 'ch4-b3-s3';  -- 대지의 힘 흡수
update ch4_boss_skills set ai_priority = 1 where id = 'ch4-b3-s4';  -- 거룡의 위압 (debuff)

-- ── Stage 4 기라티나 priority ──
update ch4_boss_skills set ai_priority = 4 where id = 'ch4-b4-s1';  -- 섀도 클로
update ch4_boss_skills set ai_priority = 6 where id = 'ch4-b4-s2';  -- 차원의 휘몰아침 (aoe)
update ch4_boss_skills set ai_priority = 1 where id = 'ch4-b4-s3';  -- 어둠의 손길 (debuff)
update ch4_boss_skills set ai_priority = 7 where id = 'ch4-b4-s4';  -- 광폭화 (phase 2)
update ch4_boss_skills set ai_priority = 8 where id = 'ch4-b4-s5';  -- 차원 베기 (phase 2)

notify pgrst, 'reload schema';
