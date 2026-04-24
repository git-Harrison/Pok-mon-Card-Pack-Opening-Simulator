-- ============================================================
-- Center combat power (전투력).
--
-- For each displayed slab:
--   power_i = rarity_power(rarity) * pcl_power(grade)
-- A user's `center_power` = sum(power_i) across their showcase slabs.
--
-- Scores:
--   rarity_power:  SR → 5   MA → 6   SAR → 7   UR → 8   MUR → 10
--   pcl_power:     9 → 9    10 → 10
--   (so one MUR 10 slab contributes 100 power; an SR 9 contributes 45.)
-- ============================================================

create or replace function rarity_power(p_rarity text) returns int
language sql immutable as $$
  select case p_rarity
    when 'SR'  then 5
    when 'MA'  then 6
    when 'SAR' then 7
    when 'UR'  then 8
    when 'MUR' then 10
    else 0
  end
$$;

create or replace function pcl_power(p_grade int) returns int
language sql immutable as $$
  select case p_grade
    when 10 then 10
    when 9  then 9
    else 0
  end
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
        coalesce(sum(case
          when g.grade = 10 then 500
          when g.grade = 9  then 350
          when g.grade = 8  then 150
          when g.grade in (6, 7) then 100
          else 0
        end), 0)::int
        + coalesce((
            select count(*)::int * 100
            from sabotage_logs l
            where l.attacker_id = u.id and l.success
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

grant execute on function rarity_power(text) to anon, authenticated;
grant execute on function pcl_power(int) to anon, authenticated;
grant execute on function get_user_rankings() to anon, authenticated;

notify pgrst, 'reload schema';
