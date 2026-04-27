-- ============================================================
-- 경제 밸런스: 야생 승리 랭킹 +50 → +100, 전시 시간당 포인트 2x.
--
-- 1) get_user_rankings 의 rank_score 식에서 wild_wins * 50 → 100.
--    20260564_showcase_power_table.sql 본문 그대로 두고 곱수만 조정.
--
-- 2) slab_income_trade 의 모든 (rarity × grade) 시간당 trade 포인트
--    2배. MUR PCL10 100,000 → 200,000 / SR PCL10 20,000 → 40,000 등.
--
-- 3) slab_income_rank 의 분모 200 → 400 으로 변경. trade 가 2x 됐으므로
--    분모를 같이 2x 해야 시간당 랭킹 적립 (1/200 → 1/400 of new trade
--    = 1/200 of old trade) 가 변동 없음. "게임 포인트만 2배" 요구사항
--    충족.
-- ============================================================

create or replace function slab_income_trade(p_rarity text, p_grade int) returns int
language sql immutable as $$
  select case
    when p_rarity = 'MUR' and p_grade = 10 then 200000
    when p_rarity = 'MUR' and p_grade = 9  then 100000
    when p_rarity = 'MUR' and p_grade = 8  then  40000
    when p_rarity = 'MUR' and p_grade = 7  then  20000
    when p_rarity = 'MUR' and p_grade = 6  then  10000
    when p_rarity = 'UR'  and p_grade = 10 then 120000
    when p_rarity = 'UR'  and p_grade = 9  then  60000
    when p_rarity = 'UR'  and p_grade = 8  then  24000
    when p_rarity = 'UR'  and p_grade = 7  then  12000
    when p_rarity = 'UR'  and p_grade = 6  then   6000
    when p_rarity = 'SAR' and p_grade = 10 then  80000
    when p_rarity = 'SAR' and p_grade = 9  then  40000
    when p_rarity = 'SAR' and p_grade = 8  then  16000
    when p_rarity = 'SAR' and p_grade = 7  then   8000
    when p_rarity = 'SAR' and p_grade = 6  then   4000
    when p_rarity = 'MA'  and p_grade = 10 then  60000
    when p_rarity = 'MA'  and p_grade = 9  then  30000
    when p_rarity = 'MA'  and p_grade = 8  then  12000
    when p_rarity = 'MA'  and p_grade = 7  then   6000
    when p_rarity = 'MA'  and p_grade = 6  then   3000
    when p_rarity = 'SR'  and p_grade = 10 then  40000
    when p_rarity = 'SR'  and p_grade = 9  then  20000
    when p_rarity = 'SR'  and p_grade = 8  then   8000
    when p_rarity = 'SR'  and p_grade = 7  then   4000
    when p_rarity = 'SR'  and p_grade = 6  then   2000
    else 0
  end
$$;

create or replace function slab_income_rank(p_rarity text, p_grade int) returns int
language sql immutable as $$
  select floor(slab_income_trade(p_rarity, p_grade) / 400.0)::int
$$;

grant execute on function slab_income_trade(text, int) to anon, authenticated;
grant execute on function slab_income_rank(text, int) to anon, authenticated;

-- get_user_rankings: wild_wins multiplier 50 → 100. 본문은 20260564
-- 와 동일, 한 줄만 변경.
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
        coalesce(u.wild_wins, 0) * 100
        + coalesce(u.showcase_rank_pts, 0)
        + coalesce((
            select sum(case when l.grade = 10 then 1000 else 500 end)::int
              from sabotage_logs l
             where l.attacker_id = u.id and l.success
          ), 0)
        + coalesce((
            select count(*)::int * 150
              from sabotage_logs l
             where l.victim_id = u.id and not l.success
          ), 0)
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
      coalesce(u.wild_wins, 0) as wild_wins,
      coalesce(u.showcase_rank_pts, 0) as showcase_rank_pts,
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

-- wild_battle_reward 응답에 들어가는 rank_points 값도 50 → 100.
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
    'rank_points', 100,
    'points', v_new_points
  );
end;
$$;

grant execute on function wild_battle_reward(uuid, int) to anon, authenticated;

notify pgrst, 'reload schema';
