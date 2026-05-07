-- ============================================================
-- 메달 전투력 상향 — Ch1 +30k / Ch2 +40k / Ch3 +60k.
--
-- 사용자 요구:
--   "체육관 승리 시 영구 지급 메달의 전투력 수치 전부 상향. 최소 +30k.
--    상향 즉시 보유 유저 전투력에 실시간 반영."
--
-- 변경 (Ch 단위 차등 — 후반일수록 더 큼):
--   Ch1 (+30k 균일):
--     풀     +10,000 → +40,000
--     물     +12,000 → +42,000
--     바위   +15,000 → +45,000
--     전기   +18,000 → +48,000
--     불꽃   +22,000 → +52,000
--     땅     +26,000 → +56,000
--     얼음   +31,000 → +61,000
--     에스퍼 +36,000 → +66,000
--   Ch2 (+40k 균일):
--     노말   +45,000 → +85,000
--     격투   +55,000 → +95,000
--     벌레   +70,000 → +110,000
--   Ch3 (+60k 균일):
--     독       +90,000 → +150,000
--     비행    +110,000 → +170,000
--     고스트  +135,000 → +195,000
--     페어리  +165,000 → +225,000
--     강철    +200,000 → +260,000
--     악      +245,000 → +305,000
--     드래곤  +300,000 → +360,000
--   Ch4 / unknown — fallback 10,000 → 40,000 (Ch1 풀 floor 와 동일).
--
-- 풀세트 메달 보유 시 합 (1,425,000 → 2,145,000, +720k).
--
-- 즉시 반영 경로 (모두 live read, 캐시 없음):
--   - get_profile.gym_buff / center_power
--   - get_user_rankings.medal_buff / center_power
--   - gym_compute_user_center_power (체육관 진입 / 방어자 stats)
-- 마이그레이션 적용 시 즉시 모든 보유 유저의 전투력에 반영.
--
-- 호출부 / 시그니처 / 파라미터 이름 모두 그대로 — CREATE OR REPLACE
-- 만으로 본문 교체 (PG 의 파라미터 이름 변경 거부 회피).
--
-- 시그니처: gym_medal_buff(p_difficulty text)  ← 의미는 gym_id 지만
-- 호환을 위해 식별자 유지 (20260638 주석 참조).
-- ============================================================

create or replace function gym_medal_buff(p_difficulty text)
returns int
language sql
immutable
set search_path = public
as $$
  select case p_difficulty
    -- Ch1 (+30k)
    when 'gym-grass'    then  40000
    when 'gym-water'    then  42000
    when 'gym-rock'     then  45000
    when 'gym-electric' then  48000
    when 'gym-fire'     then  52000
    when 'gym-ground'   then  56000
    when 'gym-ice'      then  61000
    when 'gym-psychic'  then  66000
    -- Ch2 (+40k)
    when 'gym-normal'   then  85000
    when 'gym-fighting' then  95000
    when 'gym-bug'      then 110000
    -- Ch3 (+60k)
    when 'gym-poison'   then 150000
    when 'gym-flying'   then 170000
    when 'gym-ghost'    then 195000
    when 'gym-fairy'    then 225000
    when 'gym-steel'    then 260000
    when 'gym-dark'     then 305000
    when 'gym-dragon'   then 360000
    -- Ch4 / 알 수 없는 gym — Ch1 풀 floor 와 맞춤 (기존 10000 → 40000).
    else 40000
  end::int;
$$;

grant execute on function gym_medal_buff(text) to anon, authenticated;

notify pgrst, 'reload schema';

-- 마이그레이션: 20260724_gym_medal_buff_uplift_ch_progressive.sql
