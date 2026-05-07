-- ============================================================
-- 체육관 1회 승리 보너스 단가 2000 → 10000 (5x).
--
-- 사용자 보고:
--   "+2000 은 너무 약함. 10000 으로 올려줘."
--
-- 변경:
--   gym_win_power_per_kill() 반환값만 2000 → 10000.
--
-- 자동 반영 (live read):
--   user_gym_win_power_bonus(uid) = win_count × gym_win_power_per_kill()
--   라 매 호출마다 단가를 read. gym_compute_user_center_power · get_profile
--   · get_user_rankings 모두 즉시 반영. 기존 승수도 소급 적용 (영구
--   누적 정책 그대로 — count 기반이라 자연스러움).
--
-- 멱등 — CREATE OR REPLACE 만 사용.
-- ============================================================

create or replace function gym_win_power_per_kill()
returns int language sql immutable as $$ select 10000 $$;

grant execute on function gym_win_power_per_kill() to anon, authenticated;

notify pgrst, 'reload schema';

-- 마이그레이션: 20260730_gym_win_power_per_kill_bump_10k.sql
