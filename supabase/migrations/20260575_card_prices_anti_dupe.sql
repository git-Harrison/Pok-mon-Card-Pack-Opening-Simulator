-- ============================================================
-- 일반 카드 일괄 판매 가격 전반 인하 — 돈복사 차단.
--
-- 이전: C 25 / U 50 / R 100 / RR 200 / MA 500 / AR 800 / SR 1500 /
--   SAR 3000 / UR 5000 / MUR 10000
-- 이후: 전반 ~50% 인하 + low-tier 추가 인하.
--   C 10 / U 25 / R 50 / RR 100 / MA 250 / AR 400 / SR 750 /
--   SAR 1500 / UR 2500 / MUR 5000
--
-- 클라이언트 BULK_SELL_PRICE 와 mirror — 동기화 필수.
-- ============================================================

create or replace function bulk_sell_price(p_rarity text) returns int
language sql immutable as $$
  select case p_rarity
    when 'C'   then 10
    when 'U'   then 25
    when 'R'   then 50
    when 'RR'  then 100
    when 'MA'  then 250
    when 'AR'  then 400
    when 'SR'  then 750
    when 'SAR' then 1500
    when 'UR'  then 2500
    when 'MUR' then 5000
    else 0
  end
$$;

grant execute on function bulk_sell_price(text) to anon, authenticated;

notify pgrst, 'reload schema';
