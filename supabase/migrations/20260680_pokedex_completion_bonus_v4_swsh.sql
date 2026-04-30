-- ============================================================
-- 도감 세트효과 라운드 4 — 신규 6팩 (S 시리즈) 추가 반영.
--
-- 클라 RARITY_TOTALS / RARITY_COMPLETION_BONUS (src/lib/pokedex.ts) 와 sync 필수.
--
-- 분모 변화 (직전 v3 sv11 → v4 swsh):
--   MUR    8 →   8 (+0)         UR    17 →  61 (+44, +259%)
--   SAR  115 → 184 (+69)        MA     5 →   5 (+0)
--   SR   169 → 243 (+74)        AR   278 → 414 (+136)
--   RR   141 → 253 (+112)       R    154 → 288 (+134)
--   U    397 → 604 (+207)       C    664 → 845 (+181)
--   합계 1948 → 2905 (+957, +49%)
--
-- 보너스 변화 (직전 v3 → v4):
--   MUR  60000 →  90000 (+50%)   UR  28000 → 52000 (+86%)
--   SAR  20000 →  35000 (+75%)   SR  15000 → 26000 (+73%)
--   AR   12000 →  20000 (+67%)   MA   9000 → 15000 (+67%)
--   RR    7000 →  12000 (+71%)   R    5000 →  9000 (+80%)
--   U     3000 →   5000 (+67%)   C    2000 →  4000 (+100%)
--   풀세트 최대 161,000 → 268,000 (+66%, +107k)
--
-- 의도:
--   - 분모 +49% 증가에 맞춰 평균 +66% 상향 — "전체적 상향" 요청 반영
--   - UR/RR/R 등 분모 폭증 등급은 보너스도 +80%대로 매칭
--   - MUR/MA 분모는 그대로지만 전반 상승 차원 +50%/67%
--   - 희귀도 순서 strict 단조 유지: 90 > 52 > 35 > 26 > 20 > 15 > 12 > 9 > 5 > 4
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
    floor(90000 * least(1.0, c.mur::numeric /   8.0))::int
  + floor(52000 * least(1.0, c.ur::numeric  /  61.0))::int
  + floor(35000 * least(1.0, c.sar::numeric / 184.0))::int
  + floor(26000 * least(1.0, c.sr::numeric  / 243.0))::int
  + floor(20000 * least(1.0, c.ar::numeric  / 414.0))::int
  + floor(15000 * least(1.0, c.ma::numeric  /   5.0))::int
  + floor(12000 * least(1.0, c.rr::numeric  / 253.0))::int
  + floor( 9000 * least(1.0, c.r::numeric   / 288.0))::int
  + floor( 5000 * least(1.0, c.u::numeric   / 604.0))::int
  + floor( 4000 * least(1.0, c.c::numeric   / 845.0))::int
  from counts c;
$$;

grant execute on function pokedex_completion_bonus(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
