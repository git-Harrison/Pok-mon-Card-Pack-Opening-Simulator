-- ============================================================
-- Wallet bulk-sell price cut (요청: 50% 이상 낮춤).
-- PCL 단가가 server-authoritative이므로 여기서 업데이트.
-- 일반 카드 단가는 클라이언트가 payload에 직접 보냄 → lib/rarity.ts.
-- ============================================================

create or replace function pcl_sell_price(p_grade int) returns int
language sql immutable as $$
  select case
    when p_grade = 10 then 40000
    when p_grade = 9  then 20000
    when p_grade = 8  then  4000
    when p_grade in (6, 7) then 2000
    else 0
  end
$$;

notify pgrst, 'reload schema';
