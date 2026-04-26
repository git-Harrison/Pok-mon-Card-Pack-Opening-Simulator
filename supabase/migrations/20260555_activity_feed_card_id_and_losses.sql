-- ============================================================
-- /users 활동 피드 + /center 일괄 전시 정책 보정
--
-- 1) bulk_create_showcases: 같은 card_id 가 도감에 등록되었다는 이유로
--    다른 슬랩까지 거부하던 검사 제거. 도감 등록은 source_grading_id
--    슬랩만 삭제하므로 같은 카드의 다른 슬랩 사본은 정상 보유 상태,
--    전시도 가능해야 함.
--
-- 2) get_user_activity: 라벨에 카드 코드(m2-086 등)를 박아 보내던 것을,
--    `card_id` 필드를 별도로 노출해서 클라이언트가 포켓몬 한글 이름
--    으로 치환할 수 있게 한다. 라벨은 카드 정보가 없는 일반 이벤트의
--    폴백으로만 사용.
--
-- 3) get_user_activity rank 탭에 "사보타지 당함 (success)" 손실 이벤트
--    추가. 음수 points 로 노출하여 "랭킹/점수가 -된 것" 도 보이게.
--    label = "전시 카드 파괴 · <card_id> (PCL<grade>)",
--    points = -500 (PCL 슬랩 1장 손실의 표준 표기와 동일 magnitude).
--
-- 4) get_user_activity power 탭에 "센터 카드 파괴" 손실 이벤트 추가
--    (rarity 정보가 sabotage_logs 에 없어 정확한 rarity_power 계산은
--    불가, 보수적으로 -pcl_power(grade) 만 차감 표기).
-- ============================================================

-- 1) 도감 카드 전시 검사 제거
create or replace function bulk_create_showcases(
  p_user_id uuid,
  p_showcase_type text,
  p_grading_ids uuid[]
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_price int;
  v_count int;
  v_total_cost bigint;
  v_points int;
  v_new_points int;
  v_main_ids uuid[];
  v_grading record;
  v_used_cells int[];
  v_cell int;
  v_slot_x int;
  v_slot_y int;
  v_new_showcase uuid;
  v_created int := 0;
  v_total_cells constant int := 36; -- 6x6
begin
  if p_user_id is null then
    return json_build_object('ok', false, 'error', '요청이 올바르지 않아요.');
  end if;

  if p_showcase_type is null
     or p_showcase_type = 'vault'
     or showcase_price(p_showcase_type) is null then
    return json_build_object('ok', false, 'error', '존재하지 않는 보관함 종류예요.');
  end if;

  if p_grading_ids is null or array_length(p_grading_ids, 1) is null then
    return json_build_object('ok', false, 'error', '전시할 슬랩을 선택해 주세요.');
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  v_price := showcase_price(p_showcase_type);
  v_count := array_length(p_grading_ids, 1);
  v_total_cost := v_price::bigint * v_count;

  select points, coalesce(main_card_ids, '{}'::uuid[])
    into v_points, v_main_ids
  from users
  where id = p_user_id
  for update;
  if not found then
    return json_build_object('ok', false, 'error', '사용자를 찾을 수 없어요.');
  end if;
  if v_points < v_total_cost then
    return json_build_object('ok', false, 'error', '포인트가 부족해요.');
  end if;

  select array_agg(slot_y * 6 + slot_x)
    into v_used_cells
    from user_showcases
   where user_id = p_user_id;
  v_used_cells := coalesce(v_used_cells, '{}'::int[]);
  if v_total_cells - coalesce(array_length(v_used_cells, 1), 0) < v_count then
    return json_build_object(
      'ok', false,
      'error', '빈 자리가 부족해요.'
    );
  end if;

  for v_grading in
    select t.id as input_id, g.id, g.grade, g.card_id, g.user_id, t.ord
      from unnest(p_grading_ids) with ordinality as t(id, ord)
      left join psa_gradings g on g.id = t.id
     order by t.ord
  loop
    if v_grading.id is null or v_grading.user_id <> p_user_id then
      return json_build_object('ok', false, 'error', '소유하지 않은 슬랩이 포함돼 있어요.');
    end if;

    if v_grading.grade not in (9, 10) then
      return json_build_object('ok', false, 'error', 'PCL 9·10 슬랩만 전시 가능해요.');
    end if;

    if v_grading.id = any(v_main_ids) then
      return json_build_object('ok', false, 'error', '펫으로 등록된 슬랩은 전시할 수 없어요.');
    end if;

    if exists (select 1 from showcase_cards sc where sc.grading_id = v_grading.id) then
      return json_build_object('ok', false, 'error', '이미 전시 중인 슬랩이 포함돼 있어요.');
    end if;

    -- (도감 등록 검사 제거됨 — 도감 등록은 source_grading_id 슬랩만 삭제
    --  하므로 같은 card_id 의 다른 슬랩 사본은 정상 보유 + 전시 가능.)

    if exists (
      select 1 from gifts gf
       where gf.grading_id = v_grading.id
         and gf.status = 'pending'
         and gf.expires_at > now()
    ) then
      return json_build_object('ok', false, 'error', '선물 대기 중인 슬랩이 포함돼 있어요.');
    end if;

    v_cell := null;
    for i in 0 .. v_total_cells - 1 loop
      if not (i = any(v_used_cells)) then
        v_cell := i;
        exit;
      end if;
    end loop;
    if v_cell is null then
      return json_build_object('ok', false, 'error', '빈 자리가 부족해요.');
    end if;
    v_used_cells := v_used_cells || v_cell;
    v_slot_x := v_cell % 6;
    v_slot_y := v_cell / 6;

    insert into user_showcases (user_id, showcase_type, slot_x, slot_y)
      values (p_user_id, p_showcase_type, v_slot_x, v_slot_y)
      returning id into v_new_showcase;

    insert into showcase_cards (showcase_id, slot_index, grading_id)
      values (v_new_showcase, 0, v_grading.id);

    v_created := v_created + 1;
  end loop;

  update users set points = points - v_total_cost
    where id = p_user_id
    returning points into v_new_points;

  return json_build_object(
    'ok', true,
    'created_count', v_created,
    'total_cost', v_total_cost,
    'points', v_new_points
  );
end;
$$;

grant execute on function bulk_create_showcases(uuid, text, uuid[]) to anon, authenticated;

-- 2) + 3) + 4) get_user_activity 재작성: card_id 별도 노출 + 손실 이벤트
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
        ('PCL10 감별') as label,
        g.card_id as card_id,
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
        ('부수기 성공') as label,
        coalesce(l.card_id, '?') as card_id,
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
        ('부수기 방어') as label,
        coalesce(l.card_id, '?') as card_id,
        50 as points,
        'sabotage_defense'::text as source,
        l.created_at as occurred_at
      from sabotage_logs l
      where l.victim_id = p_user_id
        and not l.success
      order by l.created_at desc
      limit 10
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
      limit 10
    ),
    merged as (
      select * from grades
      union all select * from wins
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
      select * from merged order by occurred_at desc limit 10
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
      limit 10
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
      limit 10
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
      limit 10
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
      select * from merged order by occurred_at desc limit 10
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
