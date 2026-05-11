-- ============================================================
-- 도감 세트효과 라운드 6 — v5 합계 ~694k → 목표 ~1,000k
--
-- per-card (pokedex_power_bonus) 는 현 밸런스 유지 (209,330)
-- 세트효과 (pokedex_completion_bonus) 만 1.66x 상향 → ~804,000
-- 풀완료 시 도감 합계 보너스 ≈ 1,013,330 (= 209,330 + 804,000)
--
-- 의도:
--   - per-card 는 컬렉션 크기에 선형 비례 → 이미 균형 잡힘
--   - 세트효과 = "풀완료 마일스톤 보상" → 더 큰 한방으로 동기 강화
--   - 고/중/저 모두 비례 상향, 희귀도 순서 strict 단조 유지
--
-- 보너스 변화 (v5 → v6):
--   MUR  150,000 → 250,000 (+67%)    UR    90,000 → 150,000 (+67%)
--   SAR   65,000 → 110,000 (+69%)    SR    50,000 →  85,000 (+70%)
--   AR    40,000 →  65,000 (+63%)    MA    30,000 →  50,000 (+67%)
--   RR    24,000 →  38,000 (+58%)    R     18,000 →  28,000 (+56%)
--   U     10,000 →  16,000 (+60%)    C      8,000 →  12,000 (+50%)
--   풀세트 최대 485,000 → 804,000 (+66%, +319,000)
--
-- 클라 RARITY_COMPLETION_BONUS (src/lib/pokedex.ts) 와 sync 필수.
-- RARITY_TOTALS (분모) 는 v4/v5 그대로 유지 (카탈로그 변동 없음).
--
-- 희귀도 순서 strict 단조: 250 > 150 > 110 > 85 > 65 > 50 > 38 > 28 > 16 > 12
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
    floor(250000 * least(1.0, c.mur::numeric /   8.0))::int
  + floor(150000 * least(1.0, c.ur::numeric  /  61.0))::int
  + floor(110000 * least(1.0, c.sar::numeric / 184.0))::int
  + floor( 85000 * least(1.0, c.sr::numeric  / 243.0))::int
  + floor( 65000 * least(1.0, c.ar::numeric  / 414.0))::int
  + floor( 50000 * least(1.0, c.ma::numeric  /   5.0))::int
  + floor( 38000 * least(1.0, c.rr::numeric  / 253.0))::int
  + floor( 28000 * least(1.0, c.r::numeric   / 288.0))::int
  + floor( 16000 * least(1.0, c.u::numeric   / 604.0))::int
  + floor( 12000 * least(1.0, c.c::numeric   / 845.0))::int
  from counts c;
$$;

grant execute on function pokedex_completion_bonus(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
