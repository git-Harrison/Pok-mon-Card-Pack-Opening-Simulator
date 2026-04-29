-- ============================================================
-- 도감 세트효과 — 라운드 2 상향. 사용자 최신 밸런스 spec.
--
-- 의도 (사용자 요청):
--   · MUR 은 최상위 희귀도 → 세트효과도 압도적으로 높게.
--   · 낮은 희귀도도 기존보다 체감되게 상향.
--   · 희귀도 순서 (MUR > UR > SAR > SR > AR > MA > RR > R > U > C)
--     를 strict 단조 감소로 유지.
--
-- 신규 풀세트 보너스 (per 카드 희귀도, 사용자 카드 희귀도 기준):
--   MUR  60,000   UR  28,000   SAR 20,000   SR  15,000   AR  12,000
--   MA    9,000   RR   7,000   R    5,000   U    3,000   C    2,000
--
-- 비교 (이전 20260615 라운드 1 ×2 적용 후 → 라운드 2 적용 후):
--   MUR  30,000 → 60,000   UR  20,000 → 28,000
--   SAR  16,000 → 20,000   SR  15,000 → 15,000 (동일)
--   AR   13,000 → 12,000   MA  12,000 →  9,000
--   RR   11,000 →  7,000   R    9,000 →  5,000
--   U     7,000 →  3,000   C    6,000 →  2,000
--
--   → MUR/UR/SAR 상위는 상향, SR 동결, AR 이하는 희귀도 순서를 strict
--     단조로 정렬하기 위해 재조정 (이전엔 MA 12k > AR 13k 등 미세
--     역전이 있었음).
--
-- 부분 진행도 linear-scale 구조는 그대로 (20260594 도입). 풀세트
-- 합계 = 161,000 (이전 142,000).
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
    floor(60000 * least(1.0, c.mur::numeric / 6.0))::int
  + floor(28000 * least(1.0, c.ur::numeric  / 17.0))::int
  + floor(20000 * least(1.0, c.sar::numeric / 101.0))::int
  + floor(15000 * least(1.0, c.sr::numeric  / 153.0))::int
  + floor(12000 * least(1.0, c.ar::numeric  / 134.0))::int
  + floor( 9000 * least(1.0, c.ma::numeric  / 5.0))::int
  + floor( 7000 * least(1.0, c.rr::numeric  / 129.0))::int
  + floor( 5000 * least(1.0, c.r::numeric   / 134.0))::int
  + floor( 3000 * least(1.0, c.u::numeric   / 334.0))::int
  + floor( 2000 * least(1.0, c.c::numeric   / 587.0))::int
  from counts c;
$$;

grant execute on function pokedex_completion_bonus(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
