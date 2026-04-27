-- ============================================================
-- 펫 등록 전투력 보너스 ×10 → ×15 (조금 상향).
--
-- 기존 (20260519): pet_score = Σ rarity_score(rarity) × 10
--   MUR PCL10 → 100, UR → 80, SAR → 70, MA → 60, SR → 50.
--   (AR 이하는 rarity_score=0 → 0p, 기존 시스템 그대로)
--
-- 변경: 곱셈 인수 10 → 15. (등급별 정액 인상.)
--   MUR PCL10 → 150, UR → 120, SAR → 105, MA → 90, SR → 75.
--   AR 이하는 rarity_score=0 유지 → 0p (기존 게임 의도 유지).
--
-- 영향:
--   1) pet_score_for(uuid[]) — 펫 등록 시 계산 함수
--   2) 모든 기존 유저의 users.pet_score 즉시 재계산
--   3) get_user_activity('pet') 라벨 점수도 ×15 동기화
--
-- center_power 합산에는 자동 반영 (get_user_rankings /
-- gym_compute_user_center_power 가 users.pet_score 를 그대로 더함).
-- ============================================================

-- 1) pet_score_for — 곱셈 ×10 → ×15
create or replace function pet_score_for(p_grading_ids uuid[])
returns int
language sql
stable
set search_path = public, extensions
as $$
  select coalesce(sum(rarity_score(g.rarity) * 15), 0)::int
    from psa_gradings g
   where g.id = any(coalesce(p_grading_ids, '{}'::uuid[]))
     and g.grade = 10
$$;

-- 2) 기존 유저 pet_score 즉시 재계산 — 새 ×15 곱셈으로 1회 갱신.
update users
   set pet_score = pet_score_for(coalesce(main_card_ids, '{}'::uuid[]));

-- 3) get_user_activity('pet') 의 점수 라벨 동기화 (×10 → ×15)
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
      where l.attacker_id = p_user_id and l.success
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
      where l.victim_id = p_user_id and not l.success
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
      where l.victim_id = p_user_id and l.success
      order by l.created_at desc
      limit 5
    ),
    wild as (
      select
        ('야생 승리') as label,
        null::text as card_id,
        coalesce(w.rank_points, 50) as points,
        'wild_win'::text as source,
        w.created_at as occurred_at
      from wild_battles_log w
      where w.user_id = p_user_id
      order by w.created_at desc
      limit 5
    ),
    merged as (
      select * from wins
      union all select * from defs
      union all select * from losses
      union all select * from wild
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
        coalesce(showcase_power(g2.rarity, g2.grade), 0) as points,
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
        coalesce(pokedex_rarity_score(coalesce(p.rarity, '')), 0) as points,
        'pokedex_register'::text as source,
        p.registered_at as occurred_at
      from pokedex_entries p
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
      where l.victim_id = p_user_id and l.success
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
        (rarity_score(g.rarity) * 15)::int as points,
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

grant execute on function pet_score_for(uuid[]) to anon, authenticated;
grant execute on function get_user_activity(uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
