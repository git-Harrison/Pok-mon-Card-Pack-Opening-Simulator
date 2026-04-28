-- ============================================================
-- PCL 슬랩 일괄 판매 가격 2배 인상.
--
-- 기존 (20260574 anti-dupe):
--   PCL 10 = 10,000p / 9 = 5,000p / 8 = 1,000p / 7 = 150p / 6 = 100p
-- 변경:
--   PCL 10 = 20,000p / 9 = 10,000p / 8 = 2,000p / 7 = 300p / 6 = 200p
--
-- bulk_submit_pcl_grading 의 자동판매 분기 / bulk_sell_gradings /
-- record_pack_pulls_batch 모두 이 함수 참조 → 함수 갱신만으로 즉시
-- 모든 곳 반영.
-- ============================================================

create or replace function pcl_sell_price(p_grade int) returns int
language sql immutable as $$
  select case
    when p_grade = 10 then 20000
    when p_grade = 9  then 10000
    when p_grade = 8  then  2000
    when p_grade = 7  then   300
    when p_grade = 6  then   200
    else 0
  end
$$;

grant execute on function pcl_sell_price(int) to anon, authenticated;

notify pgrst, 'reload schema';
