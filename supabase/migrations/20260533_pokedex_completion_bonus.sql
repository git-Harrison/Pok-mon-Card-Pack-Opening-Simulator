-- ============================================================
-- 도감 등급 완전 컬렉션 보너스 — 한 등급의 모든 카드를 도감에
-- 박제했을 때 추가 전투력 보너스를 지급한다.
--
-- 등급별 보너스 (per-rarity completion bonus):
--   MUR → +10,000   (총 2 장)
--   UR  →  +6,000   (총 14 장)
--   SAR →  +5,000   (총 70 장)
--   MA  →  +5,000   (총 5 장)
--   SR  →  +5,000   (총 85 장)
--   AR  →  +4,000   (총 74 장)
--   RR  →  +3,000   (총 95 장)
--   R   →  +2,000   (총 98 장)
--   U   →  +1,500   (총 199 장)
--   C   →  +1,500   (총 405 장)
--
-- 카탈로그 총량은 클라이언트의 SETS 데이터에서 산출. DB 에는
-- 카드 카탈로그 테이블이 없으므로 이 함수에서 하드코딩으로
-- 비교한다 (클라이언트 RARITY_TOTALS 와 동기화 필수).
--
-- 모든 DDL/DML 은 idempotent. 기존 함수는 create or replace.
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
    (case when c.mur >= 2   then 10000 else 0 end)
  + (case when c.ur  >= 14  then  6000 else 0 end)
  + (case when c.sar >= 70  then  5000 else 0 end)
  + (case when c.ma  >= 5   then  5000 else 0 end)
  + (case when c.sr  >= 85  then  5000 else 0 end)
  + (case when c.ar  >= 74  then  4000 else 0 end)
  + (case when c.rr  >= 95  then  3000 else 0 end)
  + (case when c.r   >= 98  then  2000 else 0 end)
  + (case when c.u   >= 199 then  1500 else 0 end)
  + (case when c.c   >= 405 then  1500 else 0 end)
  from counts c;
$$;

grant execute on function pokedex_completion_bonus(uuid) to anon, authenticated;

create or replace function get_user_rankings()
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_rows json;
begin
  select coalesce(
    json_agg(r order by r.rank_score desc, r.points desc),
    '[]'::json
  )
    into v_rows
  from (
    select
      u.id,
      u.user_id,
      u.display_name,
      u.age,
      u.points,
      u."character",
      coalesce(u.pet_score, 0) as pet_score,
      coalesce(u.main_card_ids, '{}'::uuid[]) as main_card_ids,
      coalesce((
        select jsonb_agg(
                 jsonb_build_object(
                   'id', g3.id,
                   'card_id', g3.card_id,
                   'grade', g3.grade,
                   'rarity', g3.rarity
                 )
                 order by array_position(u.main_card_ids, g3.id)
               )
          from psa_gradings g3
         where g3.user_id = u.id
           and g3.id = any(coalesce(u.main_card_ids, '{}'::uuid[]))
           and g3.grade = 10
      ), '[]'::jsonb) as main_cards,
      (
        coalesce(u.pcl_10_wins, 0) * 500
        + coalesce((
            select count(*)::int * 3000
              from sabotage_logs l
             where l.attacker_id = u.id and l.success
          ), 0)
        + coalesce((
            select count(*)::int * 50
              from sabotage_logs l
             where l.victim_id = u.id and not l.success
          ), 0)
      ) as rank_score,
      (
        coalesce((
          select sum(rarity_power(g2.rarity) * pcl_power(g2.grade))::int
          from showcase_cards sc
          join user_showcases us on us.id = sc.showcase_id
          join psa_gradings g2 on g2.id = sc.grading_id
          where us.user_id = u.id
        ), 0)
        + pokedex_power_bonus(coalesce(u.pokedex_count, 0))
        + coalesce(pokedex_completion_bonus(u.id), 0)
      ) as center_power,
      coalesce(u.pokedex_count, 0) as pokedex_count,
      pokedex_power_bonus(coalesce(u.pokedex_count, 0)) as pokedex_bonus,
      coalesce(pokedex_completion_bonus(u.id), 0) as pokedex_completion_bonus,
      coalesce(count(g.id), 0)::int as psa_count,
      coalesce(sum(case when g.grade = 10 then 1 else 0 end), 0)::int as psa_10,
      coalesce(sum(case when g.grade = 9  then 1 else 0 end), 0)::int as psa_9,
      coalesce(sum(case when g.grade = 8  then 1 else 0 end), 0)::int as psa_8,
      coalesce(sum(case when g.grade = 7  then 1 else 0 end), 0)::int as psa_7,
      coalesce(sum(case when g.grade = 6  then 1 else 0 end), 0)::int as psa_6,
      coalesce((
        select count(*)::int
        from showcase_cards sc
        join user_showcases us on us.id = sc.showcase_id
        where us.user_id = u.id
      ), 0) as showcase_count,
      coalesce((
        select count(*)::int
        from sabotage_logs l
        where l.attacker_id = u.id and l.success
      ), 0) as sabotage_wins,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', g.id,
            'card_id', g.card_id,
            'grade', g.grade,
            'graded_at', g.graded_at
          )
          order by g.grade desc, g.graded_at desc
        ) filter (where g.id is not null),
        '[]'::jsonb
      ) as gradings
    from users u
    left join psa_gradings g on g.user_id = u.id
    group by u.id
  ) r;
  return v_rows;
end;
$$;

grant execute on function get_user_rankings() to anon, authenticated;

notify pgrst, 'reload schema';
