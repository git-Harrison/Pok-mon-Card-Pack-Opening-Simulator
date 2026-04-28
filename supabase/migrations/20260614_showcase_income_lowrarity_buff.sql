-- ============================================================
-- 전시 수익 전반 상향 + 낮은 희귀도(AR/RR/R/U/C) PCL9·10 신규 적립
-- 추가. 사용자 요청: "낮은 보관함과 낮은 희귀도 PCL10 보상 크게
-- 올리고 나머지도 전부 상향".
--
-- 변경 (30분 주기 / per cycle 기준):
--   기존 (20260612): MUR 300K / UR 180K / SAR 120K / MA 90K / SR 60K
--     · AR/RR/R/U/C 는 0 (전시 슬랩이지만 수익 없음)
--
--   신규: 모든 등급 2x + AR~C 도 의미 있는 값 부여.
--     · MUR  PCL10 600,000 / PCL9 300,000
--     · UR   PCL10 360,000 / PCL9 180,000
--     · SAR  PCL10 240,000 / PCL9 120,000
--     · MA   PCL10 180,000 / PCL9  90,000
--     · SR   PCL10 120,000 / PCL9  60,000
--     · AR   PCL10  80,000 / PCL9  40,000  (신규)
--     · RR   PCL10  50,000 / PCL9  25,000  (신규)
--     · R    PCL10  30,000 / PCL9  15,000  (신규)
--     · U    PCL10  20,000 / PCL9  10,000  (신규)
--     · C    PCL10  15,000 / PCL9   7,500  (신규)
--
--   PCL 6/7/8 은 전시 불가라 실제 적립 안 되지만 함수 시그니처
--   유지 차원에서 비례값 (PCL9의 40%/20%/10%) 유지.
--
-- slab_income_rank = floor(trade / 1200) 그대로 — trade 가 2x 됐으니
-- 랭킹도 자연스럽게 비례 상향. (사용자 요청: "포인트, 랭킹" 모두
-- 상향)
-- ============================================================

create or replace function slab_income_trade(p_rarity text, p_grade int) returns int
language sql immutable as $$
  select case
    -- MUR
    when p_rarity = 'MUR' and p_grade = 10 then 600000
    when p_rarity = 'MUR' and p_grade = 9  then 300000
    when p_rarity = 'MUR' and p_grade = 8  then 120000
    when p_rarity = 'MUR' and p_grade = 7  then  60000
    when p_rarity = 'MUR' and p_grade = 6  then  30000
    -- UR
    when p_rarity = 'UR'  and p_grade = 10 then 360000
    when p_rarity = 'UR'  and p_grade = 9  then 180000
    when p_rarity = 'UR'  and p_grade = 8  then  72000
    when p_rarity = 'UR'  and p_grade = 7  then  36000
    when p_rarity = 'UR'  and p_grade = 6  then  18000
    -- SAR
    when p_rarity = 'SAR' and p_grade = 10 then 240000
    when p_rarity = 'SAR' and p_grade = 9  then 120000
    when p_rarity = 'SAR' and p_grade = 8  then  48000
    when p_rarity = 'SAR' and p_grade = 7  then  24000
    when p_rarity = 'SAR' and p_grade = 6  then  12000
    -- MA
    when p_rarity = 'MA'  and p_grade = 10 then 180000
    when p_rarity = 'MA'  and p_grade = 9  then  90000
    when p_rarity = 'MA'  and p_grade = 8  then  36000
    when p_rarity = 'MA'  and p_grade = 7  then  18000
    when p_rarity = 'MA'  and p_grade = 6  then   9000
    -- SR
    when p_rarity = 'SR'  and p_grade = 10 then 120000
    when p_rarity = 'SR'  and p_grade = 9  then  60000
    when p_rarity = 'SR'  and p_grade = 8  then  24000
    when p_rarity = 'SR'  and p_grade = 7  then  12000
    when p_rarity = 'SR'  and p_grade = 6  then   6000
    -- AR (신규)
    when p_rarity = 'AR'  and p_grade = 10 then  80000
    when p_rarity = 'AR'  and p_grade = 9  then  40000
    when p_rarity = 'AR'  and p_grade = 8  then  16000
    when p_rarity = 'AR'  and p_grade = 7  then   8000
    when p_rarity = 'AR'  and p_grade = 6  then   4000
    -- RR (신규)
    when p_rarity = 'RR'  and p_grade = 10 then  50000
    when p_rarity = 'RR'  and p_grade = 9  then  25000
    when p_rarity = 'RR'  and p_grade = 8  then  10000
    when p_rarity = 'RR'  and p_grade = 7  then   5000
    when p_rarity = 'RR'  and p_grade = 6  then   2500
    -- R (신규)
    when p_rarity = 'R'   and p_grade = 10 then  30000
    when p_rarity = 'R'   and p_grade = 9  then  15000
    when p_rarity = 'R'   and p_grade = 8  then   6000
    when p_rarity = 'R'   and p_grade = 7  then   3000
    when p_rarity = 'R'   and p_grade = 6  then   1500
    -- U (신규)
    when p_rarity = 'U'   and p_grade = 10 then  20000
    when p_rarity = 'U'   and p_grade = 9  then  10000
    when p_rarity = 'U'   and p_grade = 8  then   4000
    when p_rarity = 'U'   and p_grade = 7  then   2000
    when p_rarity = 'U'   and p_grade = 6  then   1000
    -- C (신규)
    when p_rarity = 'C'   and p_grade = 10 then  15000
    when p_rarity = 'C'   and p_grade = 9  then   7500
    when p_rarity = 'C'   and p_grade = 8  then   3000
    when p_rarity = 'C'   and p_grade = 7  then   1500
    when p_rarity = 'C'   and p_grade = 6  then    750
    else 0
  end
$$;

grant execute on function slab_income_trade(text, int) to anon, authenticated;

notify pgrst, 'reload schema';
