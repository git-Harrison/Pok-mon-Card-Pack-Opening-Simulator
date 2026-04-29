-- ============================================================
-- 도감 세트효과 분모 갱신 — SV11B + SV11W 348장 추가 반영.
--
-- 클라 RARITY_TOTALS (src/lib/pokedex.ts) 와 sync 필수.
--
-- 변경된 분모 (rarity → total cards):
--   MUR  6 →  8 (+2)        UR  17 (변동 X)
--   SAR  101 → 115 (+14)    SR  153 → 169 (+16)
--   AR   134 → 278 (+144)   MA  5 (변동 X)
--   RR   129 → 141 (+12)    R   134 → 154 (+20)
--   U    334 → 397 (+63)    C   587 → 664 (+77)
--
-- 풀세트 보너스 금액 (per 카드 희귀도) 은 라운드 2 (20260662) 그대로:
--   MUR 60k / UR 28k / SAR 20k / SR 15k / AR 12k / MA 9k
--   RR 7k / R 5k / U 3k / C 2k
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
    floor(60000 * least(1.0, c.mur::numeric / 8.0))::int
  + floor(28000 * least(1.0, c.ur::numeric  / 17.0))::int
  + floor(20000 * least(1.0, c.sar::numeric / 115.0))::int
  + floor(15000 * least(1.0, c.sr::numeric  / 169.0))::int
  + floor(12000 * least(1.0, c.ar::numeric  / 278.0))::int
  + floor( 9000 * least(1.0, c.ma::numeric  / 5.0))::int
  + floor( 7000 * least(1.0, c.rr::numeric  / 141.0))::int
  + floor( 5000 * least(1.0, c.r::numeric   / 154.0))::int
  + floor( 3000 * least(1.0, c.u::numeric   / 397.0))::int
  + floor( 2000 * least(1.0, c.c::numeric   / 664.0))::int
  from counts c;
$$;

grant execute on function pokedex_completion_bonus(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
