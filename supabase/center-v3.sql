-- ============================================================
-- CENTER v3 — passive income + ranking bonus for displayed cards
--
-- 1. Each displayed card earns 5,000p per hour. Income accrues
--    in whole hours since `income_claimed_at` and is claimed via
--    `claim_showcase_income(user_id)`. After claim, each card's
--    `income_claimed_at` advances by the whole hours consumed
--    so fractional progress carries over (no silent loss).
--
-- 2. Each displayed card adds 2,000 to the user's rank_score.
--    Update `get_user_rankings()` to include that.
-- ============================================================

alter table showcase_cards
  add column if not exists income_claimed_at timestamptz not null default now();

-- ------------------------------------------------------------
-- claim_showcase_income — call whenever the owner opens /center
-- ------------------------------------------------------------
create or replace function claim_showcase_income(p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hours_total bigint := 0;
  v_earned int := 0;
  v_new_points int;
  v_card_count int := 0;
begin
  -- Sum whole hours across all this user's displayed cards.
  select
    coalesce(sum(floor(extract(epoch from (now() - c.income_claimed_at)) / 3600)), 0),
    count(*)
  into v_hours_total, v_card_count
  from showcase_cards c
  join user_showcases s on s.id = c.showcase_id
  where s.user_id = p_user_id;

  v_earned := (v_hours_total * 5000)::int;

  if v_earned > 0 then
    -- Advance each card's claim timestamp by the integer hours it accrued.
    update showcase_cards c
      set income_claimed_at = c.income_claimed_at
        + (floor(extract(epoch from (now() - c.income_claimed_at)) / 3600) || ' hours')::interval
      from user_showcases s
      where c.showcase_id = s.id
        and s.user_id = p_user_id
        and extract(epoch from (now() - c.income_claimed_at)) >= 3600;

    update users set points = points + v_earned
      where id = p_user_id
      returning points into v_new_points;
  else
    select points into v_new_points from users where id = p_user_id;
  end if;

  return json_build_object('ok', true,
    'earned', v_earned,
    'card_count', v_card_count,
    'points', v_new_points);
end;
$$;

-- ------------------------------------------------------------
-- get_user_rankings — add 2,000pt per displayed card
-- ------------------------------------------------------------
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
      coalesce(sum(case
        when g.grade = 10 then 1000
        when g.grade = 9 then 500
        when g.grade = 8 then 200
        when g.grade in (6, 7) then 100
        else 0
      end), 0)::int
      + coalesce((
          select count(*)::int * 2000
          from showcase_cards sc
          join user_showcases us on us.id = sc.showcase_id
          where us.user_id = u.id
        ), 0) as rank_score,
      coalesce(count(g.id), 0)::int as psa_count,
      coalesce(sum(case when g.grade = 10 then 1 else 0 end), 0)::int as psa_10,
      coalesce(sum(case when g.grade = 9 then 1 else 0 end), 0)::int as psa_9,
      coalesce(sum(case when g.grade = 8 then 1 else 0 end), 0)::int as psa_8,
      coalesce(sum(case when g.grade = 7 then 1 else 0 end), 0)::int as psa_7,
      coalesce(sum(case when g.grade = 6 then 1 else 0 end), 0)::int as psa_6,
      coalesce((
        select count(*)::int
        from showcase_cards sc
        join user_showcases us on us.id = sc.showcase_id
        where us.user_id = u.id
      ), 0) as showcase_count,
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

grant execute on function claim_showcase_income(uuid) to anon, authenticated;
grant execute on function get_user_rankings() to anon, authenticated;

notify pgrst, 'reload schema';
