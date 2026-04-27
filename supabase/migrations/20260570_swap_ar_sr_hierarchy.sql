-- ============================================================
-- 사용자 hierarchy 정정 — AR / SR 위치 swap.
--
-- 이전: MUR > UR > SAR > AR > SR > MA > RR > R > U > C   (AR > SR)
-- 이후: MUR > UR > SAR > SR > AR > MA > RR > R > U > C   (SR > AR)
--
-- 영향 함수:
--   1) bulk_sell_price          — AR/SR 단가 swap
--   2) showcase_power           — 전시 전투력 lookup AR/SR swap
--   3) pokedex_rarity_score     — 도감 1장 점수 AR/SR swap
--   4) rarity_score             — 펫 점수 단가 AR/SR swap
--   5) is_sub_ar                — "AR 이하 자동판매" 의미로 AR 포함
--                                 (C, U, R, RR, MA, AR)
--
-- 클라이언트 RARITY_ORDER / tier / BULK_SELL_PRICE 와 mirror — 동시
-- commit 으로 동기화.
-- ============================================================

-- 1) bulk_sell_price
create or replace function bulk_sell_price(p_rarity text) returns int
language sql immutable as $$
  select case p_rarity
    when 'C'   then 25
    when 'U'   then 50
    when 'R'   then 100
    when 'RR'  then 200
    when 'MA'  then 500
    when 'AR'  then 800
    when 'SR'  then 1500
    when 'SAR' then 3000
    when 'UR'  then 5000
    when 'MUR' then 10000
    else 0
  end
$$;

grant execute on function bulk_sell_price(text) to anon, authenticated;

-- 2) showcase_power — (rarity, grade) lookup
-- AR / SR PCL 10 / PCL 9 값 swap. 나머지는 그대로.
create or replace function showcase_power(p_rarity text, p_grade int)
returns int
language sql
immutable
as $$
  select case
    when p_grade not in (9, 10) then 0
    when p_rarity = 'MUR' and p_grade = 10 then 100
    when p_rarity = 'MUR' and p_grade = 9  then 90
    when p_rarity = 'UR'  and p_grade = 10 then 80
    when p_rarity = 'UR'  and p_grade = 9  then 72
    when p_rarity = 'SAR' and p_grade = 10 then 70
    when p_rarity = 'SAR' and p_grade = 9  then 63
    when p_rarity = 'SR'  and p_grade = 10 then 60
    when p_rarity = 'SR'  and p_grade = 9  then 54
    when p_rarity = 'AR'  and p_grade = 10 then 50
    when p_rarity = 'AR'  and p_grade = 9  then 45
    when p_rarity = 'MA'  and p_grade = 10 then 40
    when p_rarity = 'MA'  and p_grade = 9  then 36
    when p_rarity = 'RR'  and p_grade = 10 then 30
    when p_rarity = 'RR'  and p_grade = 9  then 27
    when p_rarity = 'R'   and p_grade = 10 then 20
    when p_rarity = 'R'   and p_grade = 9  then 18
    when p_rarity = 'U'   and p_grade = 10 then 10
    when p_rarity = 'U'   and p_grade = 9  then 9
    when p_rarity = 'C'   and p_grade = 10 then 6
    when p_rarity = 'C'   and p_grade = 9  then 5
    else 0
  end
$$;

grant execute on function showcase_power(text, int) to anon, authenticated;

-- 3) pokedex_rarity_score — 도감 1장당
-- AR / SR swap. 나머지는 그대로.
create or replace function pokedex_rarity_score(p_rarity text)
returns int
language sql
immutable
as $$
  select case p_rarity
    when 'MUR' then 1000
    when 'UR'  then 400
    when 'SAR' then 250
    when 'SR'  then 180
    when 'AR'  then 130
    when 'MA'  then 100
    when 'RR'  then 50
    when 'R'   then 30
    when 'U'   then 15
    when 'C'   then 8
    else 0
  end
$$;

grant execute on function pokedex_rarity_score(text) to anon, authenticated;

-- 4) rarity_score — 펫 점수 단가 (× 10 곱해 펫 점수에 합산)
-- AR / SR swap.
create or replace function rarity_score(p_rarity text)
returns int
language sql
immutable
as $$
  select case p_rarity
    when 'MUR' then 10
    when 'UR'  then 8
    when 'SAR' then 7
    when 'SR'  then 6
    when 'AR'  then 5
    when 'MA'  then 4
    when 'RR'  then 3
    when 'R'   then 2
    when 'U'   then 1
    when 'C'   then 1
    else 0
  end
$$;

grant execute on function rarity_score(text) to anon, authenticated;

-- 5) is_sub_ar — "AR 이하" 자동판매 대상.
-- 새 hierarchy 에서 SR > AR 이라 AR 자체도 sub-AR 의미에 포함됨.
-- (이전 정의 (C,U,R,RR,MA,SR) 에서 SR 빼고 AR 넣음.)
create or replace function is_sub_ar(p_rarity text) returns boolean
language sql immutable as $$
  select p_rarity in ('C', 'U', 'R', 'RR', 'MA', 'AR')
$$;

grant execute on function is_sub_ar(text) to anon, authenticated;

notify pgrst, 'reload schema';
