-- ============================================================
-- 등급 hierarchy 사용자 정한 순서로 정합:
--   MUR > UR > SAR > AR > SR > MA > RR > R > U > C
--
-- 1) bulk_sell_price 재배열 — 이전엔 AR(500) < SR=MA(1000) 라
--    "MA가 AR보다 비싼" 모순. 새 순서: MA 500 < SR 800 < AR 1500.
-- 2) is_sub_ar 확장 — 이전엔 (C, U, R, RR) 만 sub-AR. 사용자 순서로는
--    SR / MA 도 AR 아래라 sub-AR 에 포함. C, U, R, RR, MA, SR.
--
-- 클라이언트 BULK_SELL_PRICE / RARITY_ORDER / RARITY_STYLE.tier 와
-- mirror — 동시 commit 으로 동기화.
--
-- 점수 함수 (showcase_power / pokedex_rarity_score / rarity_score)
-- 는 이미 사용자 순서대로 매핑돼 있어 별도 변경 불필요.
-- ============================================================

create or replace function bulk_sell_price(p_rarity text) returns int
language sql immutable as $$
  select case p_rarity
    when 'C'   then 25
    when 'U'   then 50
    when 'R'   then 100
    when 'RR'  then 200
    when 'MA'  then 500
    when 'SR'  then 800
    when 'AR'  then 1500
    when 'SAR' then 3000
    when 'UR'  then 5000
    when 'MUR' then 10000
    else 0
  end
$$;

grant execute on function bulk_sell_price(text) to anon, authenticated;

-- "AR 미만" 정의 확장. 사용자 순서로 SR / MA 가 AR 아래라 sub-AR.
create or replace function is_sub_ar(p_rarity text) returns boolean
language sql immutable as $$
  select p_rarity in ('C', 'U', 'R', 'RR', 'MA', 'SR')
$$;

grant execute on function is_sub_ar(text) to anon, authenticated;

notify pgrst, 'reload schema';
