-- ============================================================
-- PCL 슬랩 일괄 판매 가격 대폭 인하 — 돈복사 차단.
--
-- 이전: PCL 10=200k / 9=100k / 8=20k / 6·7=10k.
--   감별 1회 기대 환산: 0.005×200k + 0.035×100k + 0.08×20k +
--                       0.18×10k = 7,900p
--   박스(30k~50k, 150장 카드) 전체 감별 시: 150 × 7,900 ≈ 1,185,000p
--   → 박스당 ROI 약 25~40배. 명백한 돈복사 exploit.
--
-- 이후: PCL 10=10k / 9=5k / 8=1k / 6·7=500.
--   감별 1회 기대 환산: 0.005×10k + 0.035×5k + 0.08×1k +
--                       0.18×500 = 395p
--   박스 전체 감별 시: 150 × 395 ≈ 59,250p
--   → 박스당 ROI 약 1.5~2배. 정상적인 게임 진행 보상 수준.
--   PCL 9/10 은 여전히 chase 가치 (lottery 성격) 보존.
--
-- bulk_submit_pcl_grading / bulk_sell_gradings / record_pack_pulls_batch
-- 모두 이 함수를 참조하므로 함수 갱신만으로 즉시 모든 곳 반영.
-- ============================================================

create or replace function pcl_sell_price(p_grade int) returns int
language sql immutable as $$
  select case
    when p_grade = 10 then 10000
    when p_grade = 9  then 5000
    when p_grade = 8  then 1000
    when p_grade = 7  then 150
    when p_grade = 6  then 100
    else 0
  end
$$;

grant execute on function pcl_sell_price(int) to anon, authenticated;

notify pgrst, 'reload schema';
