-- ============================================================
-- 도감 완전 컬렉션 보너스 — 부분 진행도 비례 지급으로 변경.
--
-- 문제:
--   20260592 가 임계값을 카탈로그 실측 (587 C / 153 SR 등) 으로 올렸음.
--   이전 임계값(405 C / 85 SR ...) 으로 완성됐던 유저는 새 임계값
--   미달 → 보너스 전부 0 으로 떨어짐. 사용자가 "체육관 전투 후 전투력
--   떨어졌다" 보고한 실제 원인.
--
-- 변경:
--   완성/미완성 binary 가 아닌 진행률 비례 (linear scaled).
--     partial_bonus = full_bonus × min(1, count/total)
--   예) SR 76/153 → 7500 × 0.5 = 3750p (이전: 0p).
--   완성 시: full_bonus 그대로.
--
-- 유저 입장 효과:
--   · 부분 진행도가 즉시 환산되어 진척도 = 보상 직결.
--   · 신규 세트 추가로 임계값 늘어도 보너스 비례 감소만, 완전 회수 X.
--   · 기존 완전 컬렉션 유저는 변동 없음 (ratio=1).
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
    -- 각 등급별: floor(full_bonus × min(1, count/total))
    floor(15000 * least(1.0, c.mur::numeric / 6.0))::int
  + floor( 9000 * least(1.0, c.ur::numeric  / 17.0))::int
  + floor( 8000 * least(1.0, c.sar::numeric / 101.0))::int
  + floor( 5000 * least(1.0, c.ma::numeric  / 5.0))::int
  + floor( 7500 * least(1.0, c.sr::numeric  / 153.0))::int
  + floor( 6500 * least(1.0, c.ar::numeric  / 134.0))::int
  + floor( 5500 * least(1.0, c.rr::numeric  / 129.0))::int
  + floor( 4500 * least(1.0, c.r::numeric   / 134.0))::int
  + floor( 3500 * least(1.0, c.u::numeric   / 334.0))::int
  + floor( 3000 * least(1.0, c.c::numeric   / 587.0))::int
  from counts c;
$$;

grant execute on function pokedex_completion_bonus(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
