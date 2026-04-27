-- ============================================================
-- 도감 등록 전투력 산식 — 누적 곡선 → 등급별 평탄화
--
-- 이전:
--   pokedex_power_bonus(count int) — 1~30+ 엔트리 수 곡선.
--   엔트리 1장당 한계값이 5~14등급에 따라 다르고 등급(rarity)
--   과 독립.
--
-- 이후:
--   pokedex_power_bonus(uuid) — 사용자 도감 항목을 등급별로
--   합산. 등급별 정액:
--     MUR 1,000  UR 400  SAR 250  AR 180  SR 130
--     MA  100    RR  50  R   30   U  15   C  8
--   (사용자가 준 범위 내 라운드 값. UR 400=350~450, SAR 250=220~300,
--    AR 180=150~200, SR 130=110~150, MA 100=80~110, RR 50=40~70,
--    R 30=25~40, U 15=10~20, C 8=5~10.)
--
--   pokedex_rarity_score(text) 헬퍼로 분리해 활동 피드도
--   정확한 한계값을 라벨로 노출.
--
-- 영향 RPC:
--   1) get_user_rankings — center_power, pokedex_bonus 필드
--   2) get_profile      — center_power 합산
--   3) get_user_activity('power') — 도감 등록 이벤트 점수 라벨
--
-- 구 시그니처(int) 는 안 쓰는 곳이 없도록 정리 후 drop.
-- ============================================================

-- 1) 등급별 점수 헬퍼
create or replace function pokedex_rarity_score(p_rarity text)
returns int
language sql
immutable
as $$
  select case p_rarity
    when 'MUR' then 1000
    when 'UR'  then 400
    when 'SAR' then 250
    when 'AR'  then 180
    when 'SR'  then 130
    when 'MA'  then 100
    when 'RR'  then 50
    when 'R'   then 30
    when 'U'   then 15
    when 'C'   then 8
    else 0
  end
$$;

grant execute on function pokedex_rarity_score(text) to anon, authenticated;

-- 2) 새 시그니처(uuid) — 사용자별 합산
create or replace function pokedex_power_bonus(p_user_id uuid)
returns int
language sql
stable
set search_path = public, extensions
as $$
  select coalesce(sum(pokedex_rarity_score(coalesce(rarity, ''))), 0)::int
    from pokedex_entries
   where user_id = p_user_id;
$$;

grant execute on function pokedex_power_bonus(uuid) to anon, authenticated;

-- 3) get_user_rankings — int 시그니처 호출을 uuid 로 교체
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

-- 4) get_profile — 도감 보너스 계산을 uuid 시그니처로
create or replace function get_profile(p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_character text;
  v_ids uuid[];
  v_pet_score int;
  v_cards jsonb;
  v_recomputed int;
  v_center_power int := 0;
  v_pokedex_count int := 0;
  v_pokedex_bonus int := 0;
  v_pokedex_completion int := 0;
begin
  select "character", main_card_ids, pet_score, coalesce(pokedex_count, 0)
    into v_character, v_ids, v_pet_score, v_pokedex_count
    from users
   where id = p_user_id;

  if not found then
    return json_build_object('ok', false, 'error', '사용자를 찾을 수 없습니다.');
  end if;

  v_ids := coalesce(v_ids, '{}'::uuid[]);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', g.id,
           'card_id', g.card_id,
           'grade', g.grade,
           'rarity', g.rarity,
           'graded_at', g.graded_at
         ) order by array_position(v_ids, g.id)), '[]'::jsonb)
    into v_cards
    from psa_gradings g
   where g.id = any(v_ids)
     and g.user_id = p_user_id
     and g.grade = 10;

  v_recomputed := pet_score_for(v_ids);
  if v_recomputed <> coalesce(v_pet_score, 0) then
    update users set pet_score = v_recomputed where id = p_user_id;
    v_pet_score := v_recomputed;
  end if;

  select coalesce(sum(rarity_power(g2.rarity) * pcl_power(g2.grade))::int, 0)
    into v_center_power
    from showcase_cards sc
    join user_showcases us on us.id = sc.showcase_id
    join psa_gradings g2 on g2.id = sc.grading_id
   where us.user_id = p_user_id;

  begin
    v_pokedex_bonus := pokedex_power_bonus(p_user_id);
  exception when undefined_function then
    v_pokedex_bonus := 0;
  end;

  begin
    v_pokedex_completion := coalesce(pokedex_completion_bonus(p_user_id), 0);
  exception when undefined_function then
    v_pokedex_completion := 0;
  end;

  return json_build_object(
    'ok', true,
    'character', v_character,
    'character_locked', v_character is not null,
    'main_card_ids', to_jsonb(v_ids),
    'pet_score', v_pet_score,
    'main_cards', v_cards,
    'center_power',
      v_center_power
      + v_pokedex_bonus
      + v_pokedex_completion
      + coalesce(v_pet_score, 0),
    'pokedex_count', v_pokedex_count,
    'pokedex_bonus', v_pokedex_bonus,
    'pokedex_completion_bonus', v_pokedex_completion
  );
end;
$$;

grant execute on function get_profile(uuid) to anon, authenticated;

-- 5) get_user_activity('power') — 도감 등록 이벤트 점수 라벨도 등급별로
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
        pokedex_rarity_score(coalesce(p.rarity, '')) as points,
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

-- 6) register_pokedex_entry — power_bonus 응답을 uuid 시그니처로
create or replace function register_pokedex_entry(
  p_user_id uuid,
  p_grading_id uuid
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_grading psa_gradings%rowtype;
  v_count int;
  v_bonus int;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  select * into v_grading from psa_gradings
    where id = p_grading_id for update;
  if not found then
    return json_build_object('ok', false, 'error', '슬랩을 찾을 수 없어요.');
  end if;
  if v_grading.user_id <> p_user_id then
    return json_build_object('ok', false, 'error', '본인 소유 슬랩만 등록할 수 있어요.');
  end if;
  if v_grading.grade <> 10 then
    return json_build_object('ok', false, 'error', 'PCL 10 슬랩만 도감에 등록할 수 있어요.');
  end if;
  if exists (select 1 from showcase_cards c where c.grading_id = v_grading.id) then
    return json_build_object('ok', false, 'error', '센터에 전시 중인 슬랩은 등록할 수 없어요.');
  end if;
  if exists (
    select 1 from gifts
      where grading_id = v_grading.id
        and status = 'pending'
        and expires_at > now()
  ) then
    return json_build_object('ok', false, 'error', '선물로 보낸 슬랩은 등록할 수 없어요.');
  end if;

  if exists (
    select 1 from pokedex_entries
      where user_id = p_user_id and card_id = v_grading.card_id
  ) then
    return json_build_object('ok', false, 'error', '이미 도감에 등록된 카드예요.');
  end if;

  insert into pokedex_entries (user_id, card_id, rarity, source_grading_id)
    values (p_user_id, v_grading.card_id, v_grading.rarity, v_grading.id);

  delete from psa_gradings where id = v_grading.id;

  update users
     set pokedex_count = pokedex_count + 1
   where id = p_user_id
   returning pokedex_count into v_count;

  v_bonus := pokedex_power_bonus(p_user_id);

  return json_build_object(
    'ok', true,
    'pokedex_count', v_count,
    'power_bonus', v_bonus
  );
end;
$$;

grant execute on function register_pokedex_entry(uuid, uuid) to anon, authenticated;

-- 7) bulk_register_pokedex_entries — power_bonus 응답을 uuid 시그니처로
create or replace function bulk_register_pokedex_entries(p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_registered_ids uuid[];
  v_count int;
  v_total int;
  v_bonus int;
  v_pet_ids uuid[];
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  select coalesce(main_card_ids, '{}'::uuid[]) into v_pet_ids
    from users where id = p_user_id;

  with eligible as (
    select g.id, g.card_id, g.rarity
      from psa_gradings g
     where g.user_id = p_user_id
       and g.grade = 10
       and not (g.id = any(v_pet_ids))
       and not exists (
         select 1 from showcase_cards sc where sc.grading_id = g.id
       )
       and not exists (
         select 1 from pokedex_entries pe
          where pe.user_id = p_user_id and pe.card_id = g.card_id
       )
       and not exists (
         select 1 from gifts gf
          where gf.grading_id = g.id
            and gf.status = 'pending'
            and gf.expires_at > now()
       )
  ),
  deduped as (
    select distinct on (card_id) id, card_id, rarity
      from eligible
      order by card_id, id
  ),
  inserted as (
    insert into pokedex_entries (user_id, card_id, rarity, source_grading_id)
      select p_user_id, d.card_id, d.rarity, d.id
        from deduped d
      on conflict (user_id, card_id) do nothing
      returning source_grading_id
  )
  select coalesce(array_agg(source_grading_id), '{}'::uuid[])
    into v_registered_ids
    from inserted;

  v_count := coalesce(array_length(v_registered_ids, 1), 0);

  if v_count > 0 then
    delete from psa_gradings where id = any(v_registered_ids);
  end if;

  update users
     set pokedex_count = pokedex_count + v_count
   where id = p_user_id
   returning pokedex_count into v_total;

  v_bonus := pokedex_power_bonus(p_user_id);

  return json_build_object(
    'ok', true,
    'registered_count', v_count,
    'power_bonus', v_bonus,
    'new_pokedex_count', coalesce(v_total, 0)
  );
end;
$$;

grant execute on function bulk_register_pokedex_entries(uuid) to anon, authenticated;

-- 8) 구 int 시그니처 정리 — 호출처가 이제 모두 uuid 로 갱신됨
drop function if exists pokedex_power_bonus(int);

notify pgrst, 'reload schema';
