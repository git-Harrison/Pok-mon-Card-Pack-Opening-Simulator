-- ============================================================
-- 도감 완전 컬렉션 보너스 — 클라 카탈로그 실측 수치와 동기화 + 상향.
--
-- 진단 (사용자 보고):
--   /pokedex 의 세트효과가 "수치들이 이상하고 개수도 안 맞는다".
--   원인 조사 결과:
--     · src/lib/pokedex.ts 의 RARITY_TOTALS 가 stale (2 세트 이상
--       추가됐는데 미갱신).
--     · supabase/migrations/20260533_pokedex_completion_bonus.sql 의
--       SQL 임계값은 더 stale (m3/m4/sv8a 추가 전 시점 그대로).
--   결과: 클라 UI 의 "X장 → +Yp" 라벨과 서버 보너스 부여 시점이
--   따로 놀고, 임계값도 실제 카탈로그 총량보다 훨씬 작음.
--
-- 카탈로그 실측 (11 세트):
--   MUR  6   UR  17   SAR 101  MA   5   SR  153
--   AR  134  RR 129   R  134   U  334   C  587
--
-- 새 보너스 (클라 RARITY_COMPLETION_BONUS 와 정합):
--   MUR 15000  UR  9000  SAR 8000  MA 5000  SR 7500
--   AR   6500  RR  5500  R   4500  U  3500  C  3000
--
-- 주의: 임계값은 "전부 모은 경우" 만 보너스. 부분 컬렉션 보너스 X.
-- 신규 세트 추가로 임계값이 늘면 기존에 완성됐던 보너스도 자동 회수
-- (pokedex_completion_bonus 가 매 호출마다 재계산하므로).
-- ============================================================

create or replace function pokedex_completion_bonus(p_user_id uuid)
returns int
language sql
stable
set search_path = public, extensions
as $$
  with counts as (
    select
      coalesce(sum(case when rarity = 'MUR' then 1 else 0 end), 0)::int as mur,
      coalesce(sum(case when rarity = 'UR'  then 1 else 0 end), 0)::int as ur,
      coalesce(sum(case when rarity = 'SAR' then 1 else 0 end), 0)::int as sar,
      coalesce(sum(case when rarity = 'MA'  then 1 else 0 end), 0)::int as ma,
      coalesce(sum(case when rarity = 'SR'  then 1 else 0 end), 0)::int as sr,
      coalesce(sum(case when rarity = 'AR'  then 1 else 0 end), 0)::int as ar,
      coalesce(sum(case when rarity = 'RR'  then 1 else 0 end), 0)::int as rr,
      coalesce(sum(case when rarity = 'R'   then 1 else 0 end), 0)::int as r,
      coalesce(sum(case when rarity = 'U'   then 1 else 0 end), 0)::int as u,
      coalesce(sum(case when rarity = 'C'   then 1 else 0 end), 0)::int as c
    from pokedex_entries
    where user_id = p_user_id
  )
  select
    (case when c.mur >= 6   then 15000 else 0 end)
  + (case when c.ur  >= 17  then  9000 else 0 end)
  + (case when c.sar >= 101 then  8000 else 0 end)
  + (case when c.ma  >= 5   then  5000 else 0 end)
  + (case when c.sr  >= 153 then  7500 else 0 end)
  + (case when c.ar  >= 134 then  6500 else 0 end)
  + (case when c.rr  >= 129 then  5500 else 0 end)
  + (case when c.r   >= 134 then  4500 else 0 end)
  + (case when c.u   >= 334 then  3500 else 0 end)
  + (case when c.c   >= 587 then  3000 else 0 end)
  from counts c;
$$;

grant execute on function pokedex_completion_bonus(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
