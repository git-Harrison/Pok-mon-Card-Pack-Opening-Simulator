-- ============================================================
-- legacy main_card_ids 사용 경로 정리.
--
-- spec 2-1 (펫 속성별 3 슬롯) 이 도입된 후 main_card_ids 는 호환
-- 컬럼으로만 유지. 새 사용자/등록은 모두 main_cards_by_type 사용.
-- 하지만 일부 함수가 여전히 main_card_ids 만 읽음 (전환기 호환).
-- 이번 단계: 컬럼 자체 drop 은 하지 않고 (외부 의존성 risk),
-- 모든 데이터를 main_cards_by_type 으로 옮기고 main_card_ids 를 비움
-- (zero-out). 이후 컬럼은 빈 채로 남아 호환만 유지.
--
-- migrate 절차:
--   1) main_card_ids 에 들어있는 PCL10 슬랩을 by_type 으로 옮김
--      (이미 by_type 에 있는 카드는 skip).
--   2) main_card_ids 를 빈 배열로 reset.
--   3) compute_user_pet_score 재계산 (값은 동일 — union 이라 영향 X).
--
-- 카드 type 매핑은 SQL 에서 직접 못 하므로 (CARD_NAME_TO_TYPE 은 클라
-- 코드), 이 마이그레이션은 main_card_ids → 단일 'unknown' 버킷으로
-- 옮기는 대신 그대로 유지. 클라 ProfileView 가 mount 시 자동
-- 마이그레이션 (이전에 추가된 useEffect) 으로 type 분류 처리.
-- 따라서 이 마이그레이션은:
--   · 함수 audit + 호환 보강만 진행.
-- ============================================================

-- 1) get_user_rankings — main_cards 응답이 main_card_ids 와 by_type 모두
--    포괄하도록 (현재 main_card_ids 만 읽음). 랭킹 펫 표시 정확화.
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
      -- main_cards 응답: legacy + by_type 모든 등록 펫 union 평탄화.
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
          order by m.earned_at desc)
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
        + (select count(*)::int * 10000 from user_gym_medals where user_id = u.id)
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
      coalesce(jsonb_agg(jsonb_build_object(
        'id', g.id, 'card_id', g.card_id, 'grade', g.grade, 'graded_at', g.graded_at)
        order by g.grade desc, g.graded_at desc)
        filter (where g.id is not null), '[]'::jsonb) as gradings
    from users u
    left join psa_gradings g on g.user_id = u.id
    group by u.id
  ) r;
  return v_rows;
end;
$$;

grant execute on function get_user_rankings() to anon, authenticated;

notify pgrst, 'reload schema';
