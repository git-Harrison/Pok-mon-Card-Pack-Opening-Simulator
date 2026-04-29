-- ============================================================
-- 도감 등록 점수 (pokedex_rarity_score) — 재밸런스.
--
-- 사용자 최신 spec:
--   MUR 1,000  UR  400  SAR 250  SR  180  AR  120
--   MA    80  RR   50   R   30   U   15   C    8
--
-- 의도:
--   · 카드 희귀도 strict 단조 (MUR > UR > SAR > SR > AR > MA > RR > R > U > C).
--   · 세트효과 라운드 2 (20260662) 와 같은 방향, 다만 등록 점수는
--     보조 인센티브 역할이라 절대값 변동은 작게.
--
-- 이전 (20260570 swap_ar_sr_hierarchy 적용 후) 대비 변경:
--   AR 130 → 120   MA 100 → 80   (소폭 하향, 격차 정리)
--   나머지 8 등급은 동일 — MUR 1000 / UR 400 / SAR 250 / SR 180 /
--   RR 50 / R 30 / U 15 / C 8.
--
-- 영향:
--   · pokedex_power_bonus(uuid) — 본 함수의 sum 결과 (도감 등록 점수
--     합산). get_user_rankings, get_profile, get_user_activity('power')
--     모두 이 함수를 통해 자동 갱신.
--   · 클라 mirror src/lib/pokedex.ts:POKEDEX_RARITY_SCORE — 동시 commit.
--     (이전엔 mirror 가 AR 180 / SR 130 으로 stale 했음 — 20260570 의
--     swap 이 클라 쪽엔 안 들어감. 이번에 같이 바로잡음.)
-- ============================================================

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
    when 'AR'  then 120
    when 'MA'  then  80
    when 'RR'  then  50
    when 'R'   then  30
    when 'U'   then  15
    when 'C'   then   8
    else 0
  end
$$;

grant execute on function pokedex_rarity_score(text) to anon, authenticated;

notify pgrst, 'reload schema';
