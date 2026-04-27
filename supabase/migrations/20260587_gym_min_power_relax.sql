-- ============================================================
-- 체육관 최소 전투력 완화 — 신규/저전투력 유저도 도전할 수 있게.
--
-- 기존 (Phase 1 시드): EASY 500 / NORMAL 1500-2200 / HARD 3000-3500 /
--                      BOSS 5500-6500 → 신규 유저(center_power 0) 가
--                      모든 체육관에서 underpowered 라 "대결 요청"
--                      버튼이 disabled 로 표시됨.
--
-- 변경: EASY 0 / NORMAL 100 / HARD 500 / BOSS 2000.
-- 의도: EASY 는 누구나 진입 가능, BOSS 는 최소한의 전투력 (펫 등록 +
--       센터 슬랩 1~2 장) 갖춘 유저 대상.
--
-- 기존 시드 row 만 갱신 (id 기준 case). 멱등.
-- ============================================================

update gyms
   set min_power = case difficulty
     when 'EASY'   then 0
     when 'NORMAL' then 100
     when 'HARD'   then 500
     when 'BOSS'   then 2000
     else min_power
   end
 where id in (
   'gym-grass','gym-water','gym-rock','gym-electric',
   'gym-fire','gym-ground','gym-ice','gym-psychic'
 );

notify pgrst, 'reload schema';
