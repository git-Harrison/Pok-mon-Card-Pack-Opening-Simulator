-- ============================================================
-- 랭킹 점수 리밸런스
--
-- 변경:
--   · 야생 승리                +50  (그대로)
--   · 부수기 방어              +50  → +150  (단일)
--   · 부수기 성공              +3,000 → 등급별
--                              · 파괴한 슬랩 PCL 10 → +1,000
--                              · 그 외(PCL 9 등)    → +500
--
-- get_user_rankings 와 get_user_activity 둘 다 동일한 공식으로
-- 갱신해서 활동 피드의 +N점 라벨이 실제 산정과 일치하도록.
-- sabotage_logs.grade 컬럼은 이미 존재 (활동 피드 v3 에서 사용 중).
-- ============================================================

-- 1) get_user_rankings — 부수기 보상 / 방어 보상 갱신
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
        coalesce(u.wild_wins, 0) * 50
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
          select sum(rarity_power(g2.rarity) * pcl_power(g2.grade))::int
          from showcase_cards sc
          join user_showcases us on us.id = sc.showcase_id
          join psa_gradings g2 on g2.id = sc.grading_id
          where us.user_id = u.id
        ), 0)
        + pokedex_power_bonus(coalesce(u.pokedex_count, 0))
        + coalesce(pokedex_completion_bonus(u.id), 0)
        + coalesce(u.pet_score, 0)
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

-- 2) get_user_activity — rank 탭의 wins/defs 항목 점수 라벨도 동기화
create or replace function get_user_activity(
  p_user_id uuid,
  p_tab text
) returns json
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_rows json;
begin
  if p_user_id is null then
    return '[]'::json;
  end if;

  if p_tab = 'rank' then
    with wins as (
      select
        ('부수기 성공' ||
          case when l.grade = 10 then ' (PCL10)'
               when l.grade = 9  then ' (PCL9)'
               else '' end) as label,
        coalesce(l.card_id, '?') as card_id,
        case when l.grade = 10 then 1000 else 500 end as points,
        'sabotage_win'::text as source,
        l.created_at as occurred_at
      from sabotage_logs l
      where l.attacker_id = p_user_id
        and l.success
      order by l.created_at desc
      limit 5
    ),
    defs as (
      select
        ('부수기 방어') as label,
        coalesce(l.card_id, '?') as card_id,
        150 as points,
        'sabotage_defense'::text as source,
        l.created_at as occurred_at
      from sabotage_logs l
      where l.victim_id = p_user_id
        and not l.success
      order by l.created_at desc
      limit 5
    ),
    losses as (
      select
        ('전시 카드 파괴 당함') as label,
        coalesce(l.card_id, '?') as card_id,
        -500 as points,
        'sabotage_loss'::text as source,
        l.created_at as occurred_at
      from sabotage_logs l
      where l.victim_id = p_user_id
        and l.success
      order by l.created_at desc
      limit 5
    ),
    merged as (
      select * from wins
      union all select * from defs
      union all select * from losses
    )
    select coalesce(
      json_agg(
        json_build_object(
          'label', m.label,
          'card_id', m.card_id,
          'points', m.points,
          'source', m.source,
          'occurred_at', m.occurred_at
        )
        order by m.occurred_at desc
      ),
      '[]'::json
    ) into v_rows
    from (
      select * from merged order by occurred_at desc limit 5
    ) m;

  elsif p_tab = 'power' then
    with showcases as (
      select
        ('전시 (' || g2.rarity || ' PCL' || g2.grade || ')') as label,
        g2.card_id as card_id,
        (rarity_power(g2.rarity) * pcl_power(g2.grade))::int as points,
        'showcase_display'::text as source,
        sc.created_at as occurred_at
      from showcase_cards sc
      join user_showcases us on us.id = sc.showcase_id
      join psa_gradings g2 on g2.id = sc.grading_id
      where us.user_id = p_user_id
      order by sc.created_at desc
      limit 5
    ),
    pokedex as (
      select
        ('도감 등록 (' || coalesce(p.rarity, '-') || ')') as label,
        p.card_id as card_id,
        greatest(
          pokedex_power_bonus(rn.idx::int)
            - pokedex_power_bonus((rn.idx - 1)::int),
          0
        )::int as points,
        'pokedex_register'::text as source,
        p.registered_at as occurred_at
      from pokedex_entries p
      join (
        select id, row_number() over (order by registered_at asc) as idx
          from pokedex_entries
         where user_id = p_user_id
      ) rn on rn.id = p.id
      where p.user_id = p_user_id
      order by p.registered_at desc
      limit 5
    ),
    losses as (
      select
        ('센터 카드 파괴 당함 (PCL' || coalesce(l.grade, 0) || ')') as label,
        coalesce(l.card_id, '?') as card_id,
        -coalesce(pcl_power(l.grade), 0) as points,
        'showcase_destroyed'::text as source,
        l.created_at as occurred_at
      from sabotage_logs l
      where l.victim_id = p_user_id
        and l.success
      order by l.created_at desc
      limit 5
    ),
    merged as (
      select * from showcases
      union all select * from pokedex
      union all select * from losses
    )
    select coalesce(
      json_agg(
        json_build_object(
          'label', m.label,
          'card_id', m.card_id,
          'points', m.points,
          'source', m.source,
          'occurred_at', m.occurred_at
        )
        order by m.occurred_at desc
      ),
      '[]'::json
    ) into v_rows
    from (
      select * from merged order by occurred_at desc limit 5
    ) m;

  elsif p_tab = 'pet' then
    select coalesce(
      json_agg(
        json_build_object(
          'label', m.label,
          'card_id', m.card_id,
          'points', m.points,
          'source', m.source,
          'occurred_at', m.occurred_at
        )
        order by m.occurred_at desc
      ),
      '[]'::json
    ) into v_rows
    from (
      select
        ('펫 슬롯 (' || g.rarity || ')') as label,
        g.card_id as card_id,
        (rarity_score(g.rarity) * 10)::int as points,
        'pet_slot'::text as source,
        g.graded_at as occurred_at
      from psa_gradings g
      join users u on u.id = g.user_id
      where g.user_id = p_user_id
        and g.id = any(coalesce(u.main_card_ids, '{}'::uuid[]))
        and g.grade = 10
      order by g.graded_at desc
      limit 5
    ) m;

  else
    return '[]'::json;
  end if;

  return coalesce(v_rows, '[]'::json);
end;
$$;

grant execute on function get_user_activity(uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
