-- ============================================================
-- 체육관 사용자 상태 데이터 전체 초기화
--
-- 사용자 보고: 보호 쿨타임이 아직 3시간으로 표시됨 ("1시간 23분"
-- 처럼 1시간 초과 잔여시간). 원인: 보호시간 1h 마이그레이션(20260628)
-- 이전에 점령된 체육관의 gym_ownerships.protection_until 컬럼이
-- 이전 3시간 timestamp 로 박혀있음. 함수는 이미 1시간으로 정상이지만
-- 기존 row 의 stamp 값은 자동으로 갱신되지 않음.
--
-- 사용자 요청: 체육관 DB 초기화. 모든 점령/도전/전투/메달/보상/쿨타임
-- 사용자 상태 wipe. 다음 점령부터 1시간 protection 로 신규 기록.
--
-- 초기화 대상 (사용자/세션 데이터):
--   · gym_cooldowns     — 일일 보상 쿨타임
--   · gym_rewards       — 보상 청구 기록
--   · user_gym_medals   — 획득 메달
--   · gym_battle_logs   — 전투 로그
--   · gym_challenges    — 도전 기록 (active/종료 모두)
--   · gym_ownerships    — 점령 상태
--
-- 유지 (시드/구성 데이터 — 절대 wipe 안 함):
--   · gyms              — 18개 체육관 정의 (위치/이름/min_power 등)
--   · gym_pokemon       — default NPC 시드
--   · gym_medals        — 메달 템플릿
--
-- 후속 영향:
--   · 모든 유저의 center_power 가 메달 buff 합산에서 0 이 됨 →
--     pet_score, showcase, pokedex 만 남음. 자연스러운 변화.
--   · 점령 상태 0 → 모든 체육관이 default NPC 도전 가능 상태로 복귀.
--
-- 멱등성: truncate 는 항상 빈 상태로 만들므로 재실행 안전.
-- ============================================================

-- 의존 순서대로 비움. 다른 테이블에서 이들을 참조하는 FK 는 없음
-- (확인: showcases / sabotage / wallet 등 무관) → cascade 불요.
truncate table gym_cooldowns;
truncate table gym_rewards;
truncate table user_gym_medals;
truncate table gym_battle_logs;
truncate table gym_challenges;
truncate table gym_ownerships;

notify pgrst, 'reload schema';
