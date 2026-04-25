-- ============================================================
-- /users 활동 피드 — 탭별 최근 10건 포인트 이벤트
--
-- /users 페이지에서 유저 행을 펼치면 정적 StatChip 드롭다운 대신
-- "어디서 / 몇 포인트 / 언제" 형태의 최근 활동 10건을 보여주기 위한
-- RPC `get_user_activity(p_user_id, p_tab)` 를 도입한다.
--
-- 반환 형식 (json array, 최신순 desc, 최대 10건):
--   [
--     { "label": "...", "points": 3000, "source": "sabotage_win",
--       "occurred_at": "2026-04-26T12:34:56Z" },
--     ...
--   ]
--
-- 탭별 소스:
--   rank  → psa_gradings(grade=10, +500), sabotage_logs(success
--           attacker, +3000), sabotage_logs(victim 방어, +50)
--   power → showcase_cards (rarity_power × pcl_power),
--           pokedex_entries (등록 후 보너스 증가분)
--   pet   → users.main_card_ids 의 현재 슬랩 (이벤트 로그가
--           존재하지 않아 현재 상태 + slab graded_at 으로 대체)
--
-- 모든 DDL 은 idempotent (`create or replace function`).
-- ============================================================

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
    with grades as (
      select
        ('PCL10 감별 · ' || g.card_id) as label,
        500 as points,
        'pcl10_grade'::text as source,
        g.graded_at as occurred_at
      from psa_gradings g
      where g.user_id = p_user_id
        and g.grade = 10
      order by g.graded_at desc
      limit 10
    ),
    wins as (
      select
        ('부수기 성공 · ' || coalesce(l.card_id, '?')) as label,
        3000 as points,
        'sabotage_win'::text as source,
        l.created_at as occurred_at
      from sabotage_logs l
      where l.attacker_id = p_user_id
        and l.success
      order by l.created_at desc
      limit 10
    ),
    defs as (
      select
        ('부수기 방어 · ' || coalesce(l.card_id, '?')) as label,
        50 as points,
        'sabotage_defense'::text as source,
        l.created_at as occurred_at
      from sabotage_logs l
      where l.victim_id = p_user_id
        and not l.success
      order by l.created_at desc
      limit 10
    ),
    merged as (
      select * from grades
      union all select * from wins
      union all select * from defs
    )
    select coalesce(
      json_agg(
        json_build_object(
          'label', m.label,
          'points', m.points,
          'source', m.source,
          'occurred_at', m.occurred_at
        )
        order by m.occurred_at desc
      ),
      '[]'::json
    ) into v_rows
    from (
      select * from merged order by occurred_at desc limit 10
    ) m;

  elsif p_tab = 'power' then
    with showcases as (
      select
        ('전시 · ' || g2.card_id || ' (' || g2.rarity || ' PCL'
          || g2.grade || ')') as label,
        (rarity_power(g2.rarity) * pcl_power(g2.grade))::int as points,
        'showcase_display'::text as source,
        sc.created_at as occurred_at
      from showcase_cards sc
      join user_showcases us on us.id = sc.showcase_id
      join psa_gradings g2 on g2.id = sc.grading_id
      where us.user_id = p_user_id
      order by sc.created_at desc
      limit 10
    ),
    pokedex as (
      select
        ('도감 등록 · ' || p.card_id
          || ' (' || coalesce(p.rarity, '-') || ')') as label,
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
      limit 10
    ),
    merged as (
      select * from showcases
      union all select * from pokedex
    )
    select coalesce(
      json_agg(
        json_build_object(
          'label', m.label,
          'points', m.points,
          'source', m.source,
          'occurred_at', m.occurred_at
        )
        order by m.occurred_at desc
      ),
      '[]'::json
    ) into v_rows
    from (
      select * from merged order by occurred_at desc limit 10
    ) m;

  elsif p_tab = 'pet' then
    select coalesce(
      json_agg(
        json_build_object(
          'label', m.label,
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
        ('펫 슬롯 · ' || g.card_id || ' (' || g.rarity || ')') as label,
        (rarity_score(g.rarity) * 10)::int as points,
        'pet_slot'::text as source,
        g.graded_at as occurred_at
      from psa_gradings g
      join users u on u.id = g.user_id
      where g.user_id = p_user_id
        and g.id = any(coalesce(u.main_card_ids, '{}'::uuid[]))
        and g.grade = 10
      order by g.graded_at desc
      limit 10
    ) m;

  else
    return '[]'::json;
  end if;

  return coalesce(v_rows, '[]'::json);
end;
$$;

grant execute on function get_user_activity(uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
