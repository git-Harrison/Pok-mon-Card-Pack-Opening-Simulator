-- ============================================================
-- Ranking v2: include each user's PSA gradings (card_id + grade)
-- so the leaderboard UI can expand a grade chip and show which
-- cards earned that grade.
-- ============================================================

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
      u.age,
      u.points,
      coalesce(sum(case
        when g.grade = 10 then 1000
        when g.grade = 9 then 500
        when g.grade = 8 then 200
        when g.grade in (6, 7) then 100
        else 0
      end), 0)::int as rank_score,
      coalesce(count(g.id), 0)::int as psa_count,
      coalesce(sum(case when g.grade = 10 then 1 else 0 end), 0)::int as psa_10,
      coalesce(sum(case when g.grade = 9 then 1 else 0 end), 0)::int as psa_9,
      coalesce(sum(case when g.grade = 8 then 1 else 0 end), 0)::int as psa_8,
      coalesce(sum(case when g.grade = 7 then 1 else 0 end), 0)::int as psa_7,
      coalesce(sum(case when g.grade = 6 then 1 else 0 end), 0)::int as psa_6,
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
