-- ============================================================
-- Wallet bulk-sell 추가 인하 (v2).
-- 일괄판매 = "정리용" 컨셉 강화. 상인 · 선물 · 센터 수익이 훨씬 나은
-- 밸런스로 재조정.
-- ============================================================

create or replace function pcl_sell_price(p_grade int) returns int
language sql immutable as $$
  select case
    when p_grade = 10 then 20000
    when p_grade = 9  then 10000
    when p_grade = 8  then  2000
    when p_grade in (6, 7) then 1000
    else 0
  end
$$;

notify pgrst, 'reload schema';
