-- ============================================================
-- 체육관 사용자 상태 전체 재초기화 (사용자 요청 — 2회차)
--
-- 20260639 이후 다시 점령/방어덱/메달 데이터가 쌓여 사용자가 "전부
-- 초기화" 다시 요청. 점령자 모두 풀고 방어덱·메달·보상·쿨타임 wipe.
--
-- 보호 시간 정책 확인:
--   · gym_protection_interval() = interval '1 hour' (20260628 에서 설정).
--   · resolve_gym_battle 의 v_protection_until = now() + gym_protection_interval()
--     (20260628 적용 후 변경 없음).
--   · extend_gym_protection 도 +1 hour.
--   → 함수 자체는 이미 1h. 본 마이그레이션에서 함수 추가 변경 없음.
--
-- 초기화 대상 (사용자/세션 상태):
--   · gym_cooldowns / gym_rewards / user_gym_medals /
--     gym_battle_logs / gym_challenges / gym_ownerships
--
-- 유지 (시드/구성):
--   · gyms / gym_pokemon / gym_medals
-- ============================================================

-- 한 번의 TRUNCATE 로 6개 테이블 동시 비움 — gym_battle_logs 가
-- gym_challenges 를 FK 참조하므로 분리 실행 시 RESTRICT 위반 가능.
-- CASCADE 까지 함께 명시해 안전하게 진행.
truncate table
  gym_cooldowns,
  gym_rewards,
  user_gym_medals,
  gym_battle_logs,
  gym_challenges,
  gym_ownerships
cascade;

notify pgrst, 'reload schema';
