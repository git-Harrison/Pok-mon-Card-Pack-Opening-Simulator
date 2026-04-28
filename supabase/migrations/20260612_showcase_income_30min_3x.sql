-- ============================================================
-- 전시 수익 — 적립 주기 1시간 → 30분, 거래 포인트 3배 (시간당
-- 기준), 랭킹 포인트는 그대로 (시간당 기준).
--
-- 기존 (20260581):
--   slab_income_trade: 시간당 — MUR PCL10 200,000 / UR 120,000 등
--   slab_income_rank: floor(trade / 400) — 시간당 — MUR PCL10 500
--   claim_showcase_income: floor(age / 3600), 1시간 cooldown
--
-- 변경:
--   주기 30분 (1800s).
--   trade per cycle = 시간당 × 1.5 → 시간당 환산 3배 인상.
--     · MUR PCL10 → 300,000 / cycle (시간당 600,000)
--     · UR PCL10  → 180,000 / cycle (시간당 360,000)
--     · SAR PCL10 → 120,000 / cycle (시간당 240,000)
--     · MA PCL10  →  90,000 / cycle (시간당 180,000)
--     · SR PCL10  →  60,000 / cycle (시간당 120,000)
--     PCL 9/8/7/6 도 동일 비율.
--   rank per cycle = 시간당 × 0.5 → 시간당 환산 동일 (인상 없음).
--     분모 1200 으로 통일: floor(slab_income_trade / 1200) → 정확히
--     기존 시간당 rank 의 절반 (1200 = 1800 cycle / 1.5 rank) → 30분
--     주기로 2회 누적 시 시간당 기존값 유지.
-- ============================================================

create or replace function slab_income_trade(p_rarity text, p_grade int) returns int
language sql immutable as $$
  select case
    when p_rarity = 'MUR' and p_grade = 10 then 300000
    when p_rarity = 'MUR' and p_grade = 9  then 150000
    when p_rarity = 'MUR' and p_grade = 8  then  60000
    when p_rarity = 'MUR' and p_grade = 7  then  30000
    when p_rarity = 'MUR' and p_grade = 6  then  15000
    when p_rarity = 'UR'  and p_grade = 10 then 180000
    when p_rarity = 'UR'  and p_grade = 9  then  90000
    when p_rarity = 'UR'  and p_grade = 8  then  36000
    when p_rarity = 'UR'  and p_grade = 7  then  18000
    when p_rarity = 'UR'  and p_grade = 6  then   9000
    when p_rarity = 'SAR' and p_grade = 10 then 120000
    when p_rarity = 'SAR' and p_grade = 9  then  60000
    when p_rarity = 'SAR' and p_grade = 8  then  24000
    when p_rarity = 'SAR' and p_grade = 7  then  12000
    when p_rarity = 'SAR' and p_grade = 6  then   6000
    when p_rarity = 'MA'  and p_grade = 10 then  90000
    when p_rarity = 'MA'  and p_grade = 9  then  45000
    when p_rarity = 'MA'  and p_grade = 8  then  18000
    when p_rarity = 'MA'  and p_grade = 7  then   9000
    when p_rarity = 'MA'  and p_grade = 6  then   4500
    when p_rarity = 'SR'  and p_grade = 10 then  60000
    when p_rarity = 'SR'  and p_grade = 9  then  30000
    when p_rarity = 'SR'  and p_grade = 8  then  12000
    when p_rarity = 'SR'  and p_grade = 7  then   6000
    when p_rarity = 'SR'  and p_grade = 6  then   3000
    else 0
  end
$$;

create or replace function slab_income_rank(p_rarity text, p_grade int) returns int
language sql immutable as $$
  select floor(slab_income_trade(p_rarity, p_grade) / 1200.0)::int
$$;

grant execute on function slab_income_trade(text, int) to anon, authenticated;
grant execute on function slab_income_rank(text, int) to anon, authenticated;

-- claim_showcase_income — 30분 주기. 카드별 독립 적립
-- (20260611 도입한 per-card 흐름 유지).
create or replace function claim_showcase_income(p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_earned bigint := 0;
  v_earned_rank bigint := 0;
  v_new_points int;
  v_card_count int := 0;
  v_min_age numeric := 0;
begin
  select
    count(*),
    coalesce(extract(epoch from min(now() - c.income_claimed_at)), 0)
    into v_card_count, v_min_age
  from showcase_cards c
  join user_showcases s on s.id = c.showcase_id
  where s.user_id = p_user_id;

  if v_card_count = 0 then
    select points into v_new_points from users where id = p_user_id;
    return json_build_object(
      'ok', true,
      'earned', 0,
      'earned_rank', 0,
      'card_count', 0,
      'points', v_new_points,
      'next_claim_in_seconds', 0
    );
  end if;

  select
    coalesce(sum(
      slab_income_trade(g.rarity, g.grade)
      * floor(extract(epoch from (now() - c.income_claimed_at)) / 1800)
    ), 0),
    coalesce(sum(
      slab_income_rank(g.rarity, g.grade)
      * floor(extract(epoch from (now() - c.income_claimed_at)) / 1800)
    ), 0)
  into v_earned, v_earned_rank
  from showcase_cards c
  join user_showcases s on s.id = c.showcase_id
  join psa_gradings g on g.id = c.grading_id
  where s.user_id = p_user_id;

  -- 30분 이상 묵은 카드만 income_claimed_at advance.
  update showcase_cards c
    set income_claimed_at = c.income_claimed_at
      + (floor(extract(epoch from (now() - c.income_claimed_at)) / 1800) * 30
         || ' minutes')::interval
    from user_showcases s
    where c.showcase_id = s.id
      and s.user_id = p_user_id
      and extract(epoch from (now() - c.income_claimed_at)) >= 1800;

  if v_earned > 0 or v_earned_rank > 0 then
    update users
      set points = points + v_earned::int,
          showcase_rank_pts = showcase_rank_pts + v_earned_rank::int
      where id = p_user_id
      returning points into v_new_points;
  else
    select points into v_new_points from users where id = p_user_id;
  end if;

  return json_build_object(
    'ok', true,
    'earned', v_earned::int,
    'earned_rank', v_earned_rank::int,
    'card_count', v_card_count,
    'points', v_new_points,
    'next_claim_in_seconds', greatest(0, 1800 - v_min_age)::int
  );
end;
$$;

grant execute on function claim_showcase_income(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
