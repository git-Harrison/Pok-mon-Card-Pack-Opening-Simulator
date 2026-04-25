-- ============================================================
-- Wild battle win — fixed 20,000p payout + cumulative ranking +50.
--
-- Adds users.wild_wins counter, increments it inside
-- wild_battle_reward (alongside the points credit), and folds
-- `wild_wins * 50` into get_user_rankings.rank_score.
--
-- Cap on the client-supplied amount stays at 50,000 — the client
-- now sends a flat 20,000 but the cap prevents tampering.
-- ============================================================

alter table users
  add column if not exists wild_wins int not null default 0;

create or replace function wild_battle_reward(
  p_user_id uuid,
  p_amount int
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_amount int := greatest(0, least(50000, coalesce(p_amount, 0)));
  v_new_points int;
begin
  update users
     set points = points + v_amount,
         wild_wins = wild_wins + 1
   where id = p_user_id
   returning points into v_new_points;

  return json_build_object(
    'ok', true,
    'awarded', v_amount,
    'rank_points', 50,
    'points', v_new_points
  );
end;
$$;

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
      (
        coalesce(u.pcl_10_wins, 0) * 500
        + coalesce(u.wild_wins, 0) * 50
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
      coalesce((
        select sum(rarity_power(g2.rarity) * pcl_power(g2.grade))::int
        from showcase_cards sc
        join user_showcases us on us.id = sc.showcase_id
        join psa_gradings g2 on g2.id = sc.grading_id
        where us.user_id = u.id
      ), 0) as center_power,
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

grant execute on function wild_battle_reward(uuid, int) to anon, authenticated;
grant execute on function get_user_rankings() to anon, authenticated;

notify pgrst, 'reload schema';
