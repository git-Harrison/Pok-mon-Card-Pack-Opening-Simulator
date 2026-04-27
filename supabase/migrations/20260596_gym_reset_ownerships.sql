-- ============================================================
-- 체육관 점령 일괄 초기화 (사용자 요청).
--
-- 영향:
--   · gym_ownerships          — 모두 DELETE (소유권/보호시간/방어덱 초기화)
--   · gym_challenges (active) — 모두 abandoned 마감 (혹시 매달려있는
--                                관전 도전 정리)
--   · gym_cooldowns           — 모두 DELETE (재도전 쿨타임 초기화 →
--                                전 유저 즉시 도전 가능)
--
-- 보존:
--   · user_gym_medals  — 개인 업적, 그대로 유지.
--   · gym_rewards      — 보상 지급 기록 (감사/디버깅), 그대로 유지.
--   · gym_battle_logs  — 전투 로그 (히스토리), 그대로 유지.
--
-- 멱등 — 재실행 시 이미 비어 있으면 0 row 영향.
-- ============================================================

delete from gym_ownerships;

update gym_challenges
   set status = 'abandoned',
       ended_at = coalesce(ended_at, now()),
       result = coalesce(result, 'admin_reset')
 where status = 'active';

delete from gym_cooldowns;

notify pgrst, 'reload schema';
