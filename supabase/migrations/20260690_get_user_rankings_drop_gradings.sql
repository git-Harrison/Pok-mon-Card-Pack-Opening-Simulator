-- ============================================================
-- get_user_rankings — 사용되지 않는 gradings jsonb_agg 필드 제거.
--
-- 증상:
--   /wild 등 페이지 진입 시 (HomeView 백그라운드 prefetch 또는 UsersView
--   에서 호출) POST .../rpc/get_user_rankings → 500 Internal Server Error.
--
-- 원인:
--   20260687 PCL cap 20,000 → 100,000 상향 + 20260689 (hun all-MUR) /
--   20260688 (rmstn137 sv11w) 등 대량 시드 이후, get_user_rankings 의
--     coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'card_id', g.card_id,
--       'grade', g.grade, 'graded_at', g.graded_at)
--       order by g.grade desc, g.graded_at desc)
--       filter (where g.id is not null), '[]'::jsonb) as gradings
--   가 모든 유저의 모든 psa_gradings row 를 통째 직렬화. 단일 응답
--   페이로드가 다 MB 단위로 폭증, PostgREST statement_timeout 도달.
--
-- 분석:
--   본 필드 (RankingRow.gradings) 는 src/lib/db.ts 타입 정의엔 있으나
--   클라이언트 컴포넌트(HomeView / UsersView / 그 외) 어디에서도 참조
--   하지 않음 (grep .gradings\b 결과 0 hit). 죽은 데이터.
--   psa_count / psa_10..psa_6 의 grade 별 count 만 클라가 사용 → 그건
--   유지 (count(g.id), sum(case ...) 모두 jsonb_agg 가 아니라 cheap).
--
-- 변경:
--   20260666 정의에서 gradings 컬럼 한 줄만 제거. 다른 필드 (rank_score
--   / center_power / pokedex / pet / medal_buff / gym_medals 정렬 등)
--   는 그대로.
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
      u.id, u.user_id, u.display_name, u.age, u.points, u."character",
      coalesce(u.pet_score, 0) as pet_score,
      coalesce(u.main_card_ids, '{}'::uuid[]) as main_card_ids,
      coalesce((
        select jsonb_agg(distinct jsonb_build_object(
          'id', g3.id, 'card_id', g3.card_id,
          'grade', g3.grade, 'rarity', g3.rarity))
        from psa_gradings g3
       where g3.user_id = u.id
         and g3.grade = 10
         and (
           g3.id = any(coalesce(u.main_card_ids, '{}'::uuid[]))
           or g3.id = any(flatten_pet_ids_by_type(coalesce(u.main_cards_by_type, '{}'::jsonb)))
         )
      ), '[]'::jsonb) as main_cards,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'gym_id', m.gym_id,
          'gym_name', g.name,
          'gym_type', g.type,
          'gym_difficulty', g.difficulty,
          'medal_name', gm.name,
          'earned_at', m.earned_at)
          order by
            case g.type
              when '풀'     then 0
              when '불꽃'   then 1
              when '물'     then 2
              when '전기'   then 3
              when '얼음'   then 4
              when '바위'   then 5
              when '땅'     then 6
              when '에스퍼' then 7
              else 8
            end,
            m.earned_at desc)
        from user_gym_medals m
        join gyms g on g.id = m.gym_id
        join gym_medals gm on gm.id = m.medal_id
       where m.user_id = u.id
      ), '[]'::jsonb) as gym_medals,
      (
        coalesce(u.wild_wins, 0) * 100
        + coalesce(u.showcase_rank_pts, 0)
        + coalesce(u.gym_daily_rank_pts, 0)
        + coalesce((select sum(case when l.grade = 10 then 1000 else 500 end)::int
              from sabotage_logs l where l.attacker_id = u.id and l.success), 0)
        + coalesce((select count(*)::int * 150 from sabotage_logs l
              where l.victim_id = u.id and not l.success), 0)
      ) as rank_score,
      (
        coalesce((
          select sum(showcase_power(g2.rarity, g2.grade))::int
          from showcase_cards sc
          join user_showcases us on us.id = sc.showcase_id
          join psa_gradings g2 on g2.id = sc.grading_id
          where us.user_id = u.id
        ), 0)
        + pokedex_power_bonus(u.id)
        + coalesce(pokedex_completion_bonus(u.id), 0)
        + coalesce(u.pet_score, 0)
        + coalesce((
            select sum(gym_medal_buff(g.id))::int
              from user_gym_medals m
              join gyms g on g.id = m.gym_id
             where m.user_id = u.id
          ), 0)
      ) as center_power,
      coalesce(u.pokedex_count, 0) as pokedex_count,
      pokedex_power_bonus(u.id) as pokedex_bonus,
      coalesce(pokedex_completion_bonus(u.id), 0) as pokedex_completion_bonus,
      u.last_seen_at,
      extract(epoch from (now() - u.last_seen_at)) as seconds_since_seen,
      coalesce(count(g.id), 0)::int as psa_count,
      coalesce(sum(case when g.grade = 10 then 1 else 0 end), 0)::int as psa_10,
      coalesce(sum(case when g.grade = 9  then 1 else 0 end), 0)::int as psa_9,
      coalesce(sum(case when g.grade = 8  then 1 else 0 end), 0)::int as psa_8,
      coalesce(sum(case when g.grade = 7  then 1 else 0 end), 0)::int as psa_7,
      coalesce(sum(case when g.grade = 6  then 1 else 0 end), 0)::int as psa_6,
      coalesce((select count(*)::int from showcase_cards sc
                 join user_showcases us on us.id = sc.showcase_id
                where us.user_id = u.id), 0) as showcase_count,
      coalesce((select count(*)::int from sabotage_logs l
                where l.attacker_id = u.id and l.success), 0) as sabotage_wins,
      coalesce(u.wild_wins, 0) as wild_wins,
      coalesce(u.showcase_rank_pts, 0) as showcase_rank_pts,
      coalesce(u.gym_daily_rank_pts, 0) as gym_daily_rank_pts,
      (select count(*)::int from gym_ownerships where owner_user_id = u.id) as gym_count,
      (select count(*)::int from user_gym_medals where user_id = u.id) as medal_count,
      coalesce((
        select sum(gym_medal_buff(g.id))::int
          from user_gym_medals m
          join gyms g on g.id = m.gym_id
         where m.user_id = u.id
      ), 0) as medal_buff
    from users u
    left join psa_gradings g on g.user_id = u.id
    group by u.id
  ) r;
  return v_rows;
end;
$$;

grant execute on function get_user_rankings() to anon, authenticated;

notify pgrst, 'reload schema';
