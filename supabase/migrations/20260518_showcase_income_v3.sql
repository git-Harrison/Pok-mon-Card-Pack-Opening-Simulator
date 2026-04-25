create or replace function slab_income_trade(p_rarity text, p_grade int) returns int
language sql immutable as $$
  select case
    when p_rarity = 'MUR' and p_grade = 10 then 100000
    when p_rarity = 'MUR' and p_grade = 9  then  50000
    when p_rarity = 'MUR' and p_grade = 8  then  20000
    when p_rarity = 'MUR' and p_grade = 7  then  10000
    when p_rarity = 'MUR' and p_grade = 6  then   5000
    when p_rarity = 'UR'  and p_grade = 10 then  60000
    when p_rarity = 'UR'  and p_grade = 9  then  30000
    when p_rarity = 'UR'  and p_grade = 8  then  12000
    when p_rarity = 'UR'  and p_grade = 7  then   6000
    when p_rarity = 'UR'  and p_grade = 6  then   3000
    when p_rarity = 'SAR' and p_grade = 10 then  40000
    when p_rarity = 'SAR' and p_grade = 9  then  20000
    when p_rarity = 'SAR' and p_grade = 8  then   8000
    when p_rarity = 'SAR' and p_grade = 7  then   4000
    when p_rarity = 'SAR' and p_grade = 6  then   2000
    when p_rarity = 'MA'  and p_grade = 10 then  30000
    when p_rarity = 'MA'  and p_grade = 9  then  15000
    when p_rarity = 'MA'  and p_grade = 8  then   6000
    when p_rarity = 'MA'  and p_grade = 7  then   3000
    when p_rarity = 'MA'  and p_grade = 6  then   1500
    when p_rarity = 'SR'  and p_grade = 10 then  20000
    when p_rarity = 'SR'  and p_grade = 9  then  10000
    when p_rarity = 'SR'  and p_grade = 8  then   4000
    when p_rarity = 'SR'  and p_grade = 7  then   2000
    when p_rarity = 'SR'  and p_grade = 6  then   1000
    else 0
  end
$$;

create or replace function slab_income_rank(p_rarity text, p_grade int) returns int
language sql immutable as $$
  select floor(slab_income_trade(p_rarity, p_grade) / 200.0)::int
$$;

alter table users
  add column if not exists showcase_rank_pts int not null default 0;

create or replace function claim_showcase_income(p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_earned bigint := 0;
  v_earned_rank bigint := 0;
  v_new_points int;
  v_card_count int := 0;
begin
  select
    coalesce(sum(
      slab_income_trade(g.rarity, g.grade)
      * extract(epoch from (now() - c.income_claimed_at)) / 3600.0
    ), 0),
    coalesce(sum(
      slab_income_rank(g.rarity, g.grade)
      * extract(epoch from (now() - c.income_claimed_at)) / 3600.0
    ), 0),
    count(*)
  into v_earned, v_earned_rank, v_card_count
  from showcase_cards c
  join user_showcases s on s.id = c.showcase_id
  join psa_gradings g on g.id = c.grading_id
  where s.user_id = p_user_id;

  if v_card_count > 0 then
    update showcase_cards c
      set income_claimed_at = now()
      from user_showcases s
      where c.showcase_id = s.id
        and s.user_id = p_user_id;
  end if;

  if v_earned > 0 or v_earned_rank > 0 then
    update users
      set points = points + v_earned::int,
          showcase_rank_pts = showcase_rank_pts + v_earned_rank::int
      where id = p_user_id
      returning points into v_new_points;
  else
    select points into v_new_points from users where id = p_user_id;
  end if;

  return json_build_object('ok', true,
    'earned', v_earned::int,
    'earned_rank', v_earned_rank::int,
    'card_count', v_card_count,
    'points', v_new_points);
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
        + coalesce(u.showcase_rank_pts, 0)
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

grant execute on function slab_income_trade(text, int) to anon, authenticated;
grant execute on function slab_income_rank(text, int) to anon, authenticated;
grant execute on function claim_showcase_income(uuid) to anon, authenticated;
grant execute on function get_user_rankings() to anon, authenticated;

notify pgrst, 'reload schema';
