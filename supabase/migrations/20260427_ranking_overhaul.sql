-- ============================================================
-- Ranking formula overhaul
--
-- Scoring rules (per user request):
--   · Pack-pull cards: 0 rank
--   · PCL grading earn:
--       6 / 7  → +100
--       8      → +150
--       9      → +350
--       10     → +500
--   · Display in center: 0 rank bonus (was +2,000/displayed — dropped)
--   · Successful sabotage (attacker side): +100 each, regardless of grade
--   · Victim side on successful sabotage: the psa_gradings row is
--     already deleted by sabotage_card, so the earn points naturally
--     disappear from the rank_score — that IS the penalty. Numbers
--     match the earn values by design (grade 10 destroyed = −500, etc).
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
