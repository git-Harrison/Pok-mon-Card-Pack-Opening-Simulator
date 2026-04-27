-- ============================================================
-- 클라/서버 감별 eligibility 동기화 + 펫 점수 모든 등급 정의
--
-- 1) is_psa_eligible_rarity:
--    이전: SR/MA/SAR/UR/MUR 5등급만 허용
--    이후: C/U/R/RR/AR/SR/MA/SAR/UR/MUR 전 10등급 허용
--    클라(`src/lib/psa.ts`) 가 이미 전체를 허용하도록 바뀌어 있어
--    서버 측에서만 거부되던 mismatch 를 해소.
--    감별 직후 결과(grade 6~10 분포)는 동일 — eligibility 만 확장.
--
-- 2) rarity_score (펫 점수 단가):
--    이전: SR 5 / MA 6 / SAR 7 / UR 8 / MUR 10 (그 외 0)
--    이후: 모든 등급 정의. 펫 = PCL 10 only 인데 만약 R/RR/AR 같은
--    저등급의 PCL 10 슬랩을 펫 등록하면 0점이 나오던 케이스 제거.
--    값은 showcase_power(rarity, 10) ÷ 10 과 정합성 맞춤
--    (MUR 10 / UR 8 / SAR 7 / AR 6 / SR 5 / MA 4 / RR 3 / R 2 / U 1 / C 0.6→1).
--    총합으로 ×10 곱해지므로 펫 한 장당 점수 = MUR 100, UR 80, SAR 70,
--    AR 60, SR 50, MA 40, RR 30, R 20, U 10, C 6 — showcase 동등 표.
-- ============================================================

create or replace function is_psa_eligible_rarity(p_rarity text)
returns boolean
language sql
immutable
as $$
  select p_rarity in ('C', 'U', 'R', 'RR', 'AR', 'SR', 'MA', 'SAR', 'UR', 'MUR');
$$;

grant execute on function is_psa_eligible_rarity(text) to anon, authenticated;

-- 펫 1장 점수 = rarity_score × 10. showcase_power(rarity, 10) 와 동일하게
-- 맞춰서 펫이 전시보다 약하지 않도록.
create or replace function rarity_score(p_rarity text)
returns int
language sql
immutable
as $$
  select case p_rarity
    when 'MUR' then 10
    when 'UR'  then 8
    when 'SAR' then 7
    when 'AR'  then 6
    when 'SR'  then 5
    when 'MA'  then 4
    when 'RR'  then 3
    when 'R'   then 2
    when 'U'   then 1
    when 'C'   then 1     -- 정수형 — floor(0.6) 대신 1로 통일
    else 0
  end
$$;

grant execute on function rarity_score(text) to anon, authenticated;

notify pgrst, 'reload schema';
