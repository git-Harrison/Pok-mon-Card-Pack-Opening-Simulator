-- ============================================================
-- 도감 세트효과 라운드 5 — 라운드 4 (20260680) 후 사용자 피드백:
--   "지금도 부족함. 저등급은 훨씬 더, MUR/UR도 추가 상향".
--
-- 클라 RARITY_COMPLETION_BONUS (src/lib/pokedex.ts) 와 sync 필수.
-- RARITY_TOTALS (분모) 는 v4 그대로 유지 (카탈로그 변동 없음).
--
-- 보너스 변화 (v4 → v5):
--   MUR   90,000 → 150,000 (+67%)    UR   52,000 →  90,000 (+73%)
--   SAR   35,000 →  65,000 (+86%)    SR   26,000 →  50,000 (+92%)
--   AR    20,000 →  40,000 (+100%)   MA   15,000 →  30,000 (+100%)
--   RR    12,000 →  24,000 (+100%)   R     9,000 →  18,000 (+100%)
--   U      5,000 →  10,000 (+100%)   C     4,000 →   8,000 (+100%)
--   풀세트 최대 268,000 → 485,000 (+81%, +217,000)
--
-- 의도:
--   - 저등급(C~SR) 약 2x → "모아볼 가치" 체감 강화
--   - 고등급(SAR/UR/MUR) +73~92% → 상위 압도성 유지
--   - MUR 1장 = C 18.75장 가치 (per-card) — 희귀도 격차 더 강조
--   - 희귀도 순서 strict 단조 유지: 150 > 90 > 65 > 50 > 40 > 30 > 24 > 18 > 10 > 8
--
-- 자동 반영:
--   center_power (랭킹) / profile / 체육관 전투력 모두 동일
--   pokedex_completion_bonus(user_id) 함수를 공유 → 마이그레이션 즉시 반영.
-- ============================================================

create or replace function pokedex_completion_bonus(p_user_id uuid)
returns int
language sql
stable
set search_path = public, extensions
as $$
  with counts as (
    select
      coalesce(sum(case when rarity = 'MUR' then 1 else 0 end), 0)::int as mur,
      coalesce(sum(case when rarity = 'UR'  then 1 else 0 end), 0)::int as ur,
      coalesce(sum(case when rarity = 'SAR' then 1 else 0 end), 0)::int as sar,
      coalesce(sum(case when rarity = 'MA'  then 1 else 0 end), 0)::int as ma,
      coalesce(sum(case when rarity = 'SR'  then 1 else 0 end), 0)::int as sr,
      coalesce(sum(case when rarity = 'AR'  then 1 else 0 end), 0)::int as ar,
      coalesce(sum(case when rarity = 'RR'  then 1 else 0 end), 0)::int as rr,
      coalesce(sum(case when rarity = 'R'   then 1 else 0 end), 0)::int as r,
      coalesce(sum(case when rarity = 'U'   then 1 else 0 end), 0)::int as u,
      coalesce(sum(case when rarity = 'C'   then 1 else 0 end), 0)::int as c
    from pokedex_entries
    where user_id = p_user_id
  )
  select
    floor(150000 * least(1.0, c.mur::numeric /   8.0))::int
  + floor( 90000 * least(1.0, c.ur::numeric  /  61.0))::int
  + floor( 65000 * least(1.0, c.sar::numeric / 184.0))::int
  + floor( 50000 * least(1.0, c.sr::numeric  / 243.0))::int
  + floor( 40000 * least(1.0, c.ar::numeric  / 414.0))::int
  + floor( 30000 * least(1.0, c.ma::numeric  /   5.0))::int
  + floor( 24000 * least(1.0, c.rr::numeric  / 253.0))::int
  + floor( 18000 * least(1.0, c.r::numeric   / 288.0))::int
  + floor( 10000 * least(1.0, c.u::numeric   / 604.0))::int
  + floor(  8000 * least(1.0, c.c::numeric   / 845.0))::int
  from counts c;
$$;

grant execute on function pokedex_completion_bonus(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
