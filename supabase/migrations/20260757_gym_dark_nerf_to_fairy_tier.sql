-- ============================================================
-- 악 체육관 (gym-dark) 기본 포켓몬 스탯 하향 — fairy 티어로 맞춤.
--
-- 사용자 피드백: "악 속성 체육관 default 포켓몬이 너무 쌔다."
--
-- 변경 (20260640 → 본 마이그):
--   HP  290/355/430  →  250/305/370  (-14%, fairy 동일)
--   ATK  74/ 90/108  →   63/ 76/ 92  (-14%, fairy 동일)
--
-- 효과:
--   · chapter 3 후반에서 dragon (320/390/475, 82/100/120) 으로 가는 ramp
--     가 살짝 평평해짐. steel (270/330/400, 68/82/100) 과 동급보다 약간
--     아래로 떨어지지만, 사용자 체감상 "악이 너무 쌘 것"이 1순위 이슈.
--   · min_power (4,210,000) / medal_buff (305,000) 은 변경 없음 — 정복
--     보상 가치와 도전 자격 기준은 그대로 유지.
--
-- 멱등: UPDATE 만. 반복 적용해도 결과 동일.
-- ============================================================

update gym_pokemon
   set hp  = case slot when 1 then 250 when 2 then 305 when 3 then 370 end,
       atk = case slot when 1 then  63 when 2 then  76 when 3 then  92 end
 where gym_id = 'gym-dark';

notify pgrst, 'reload schema';

-- 마이그레이션: 20260757_gym_dark_nerf_to_fairy_tier.sql
