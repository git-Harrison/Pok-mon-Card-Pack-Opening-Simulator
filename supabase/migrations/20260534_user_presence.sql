-- ============================================================
-- 사용자 온라인 상태 (last_seen_at)
--   · users.last_seen_at 컬럼을 추가해 마지막 활동 시각을 기록.
--   · touch_last_seen RPC 로 클라이언트가 주기적으로 touch.
--   · get_user_rankings 가 seconds_since_seen 을 함께 반환해
--     /users 화면에서 5분 이내 활동 유저에게 초록 점을 표시.
-- 모든 DDL/DML 은 idempotent.
-- ============================================================

alter table users
  add column if not exists last_seen_at timestamptz not null default now();

create or replace function touch_last_seen(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update users set last_seen_at = now() where id = p_user_id;
$$;

grant execute on function touch_last_seen(uuid) to anon, authenticated;

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
      u.last_seen_at,
      extract(epoch from (now() - u.last_seen_at)) as seconds_since_seen,
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
