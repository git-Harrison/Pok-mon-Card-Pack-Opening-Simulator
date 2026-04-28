-- ============================================================
-- 라운드 1 — 메달 기반 전투력 버프 / 도감 세트효과 ×2 / 펫 등급
-- 점수 상향 / BOX 가격 30,000.
--
-- 사용자 스펙 요약 (development_request_spec.md):
--
-- 1-3) 체육관 점령 보상 = 메달 1개 → 전투력 = 보유 메달 수 × 10,000.
--      이전엔 `count(*) from gym_ownerships` 였음 (점령 잃으면 버프
--      소실). 메달은 영구 보유라 이 둘이 다름. 메달 기준이 spec.
--
-- 4-1) 도감 세트효과 수치 상향. MUR +30,000 / UR +20,000 확정,
--      나머지 등급도 비례 상향 (대략 2배).
--
-- 2-2) 펫 등록 전투력 상향. 특히 MUR 등급 더 크게.
--      현재 rarity_score: SR 5 / MA 6 / SAR 7 / UR 8 / MUR 10
--      → SR 7 / MA 9 / SAR 12 / UR 18 / MUR 28.
--      ×15 multiplier 유지 → MUR PCL10 pet = 28×15 = 420/슬롯.
--
-- 7-1) BOX 1박스 30,000p 균일 (이전 70,000p).
--      buy_box / refund_box_purchase 둘 다 동기화.
-- ============================================================

-- ── 1) 도감 세트효과 (pokedex_completion_bonus) ×2 ──
-- 부분 진행도 linear-scale 구조는 유지, 등급별 full_bonus 만 상향.
create or replace function pokedex_completion_bonus(p_user_id uuid)
returns int
language sql
stable
set search_path = public, extensions
as $$
  with counts as (
    select
      coalesce(sum(case when rarity = 'MUR' then 1 else 0 end), 0)::int as mur,
      coalesce(sum(case when rarity = 'UR'  then 1 else 0 end), 0)::int as ur,
      coalesce(sum(case when rarity = 'SAR' then 1 else 0 end), 0)::int as sar,
      coalesce(sum(case when rarity = 'MA'  then 1 else 0 end), 0)::int as ma,
      coalesce(sum(case when rarity = 'SR'  then 1 else 0 end), 0)::int as sr,
      coalesce(sum(case when rarity = 'AR'  then 1 else 0 end), 0)::int as ar,
      coalesce(sum(case when rarity = 'RR'  then 1 else 0 end), 0)::int as rr,
      coalesce(sum(case when rarity = 'R'   then 1 else 0 end), 0)::int as r,
      coalesce(sum(case when rarity = 'U'   then 1 else 0 end), 0)::int as u,
      coalesce(sum(case when rarity = 'C'   then 1 else 0 end), 0)::int as c
    from pokedex_entries
    where user_id = p_user_id
  )
  select
    floor(30000 * least(1.0, c.mur::numeric / 6.0))::int
  + floor(20000 * least(1.0, c.ur::numeric  / 17.0))::int
  + floor(16000 * least(1.0, c.sar::numeric / 101.0))::int
  + floor(12000 * least(1.0, c.ma::numeric  / 5.0))::int
  + floor(15000 * least(1.0, c.sr::numeric  / 153.0))::int
  + floor(13000 * least(1.0, c.ar::numeric  / 134.0))::int
  + floor(11000 * least(1.0, c.rr::numeric  / 129.0))::int
  + floor( 9000 * least(1.0, c.r::numeric   / 134.0))::int
  + floor( 7000 * least(1.0, c.u::numeric   / 334.0))::int
  + floor( 6000 * least(1.0, c.c::numeric   / 587.0))::int
  from counts c;
$$;

grant execute on function pokedex_completion_bonus(uuid) to anon, authenticated;

-- ── 2) 펫 rarity_score 상향 (특히 MUR) ──
-- 곱셈 ×15 (20260591) 유지 — 결과: MUR PCL10 펫 슬롯당 420 (이전 150).
create or replace function rarity_score(p_rarity text)
returns int
language sql
immutable
set search_path = public, extensions
as $$
  select case p_rarity
    when 'MUR' then 28
    when 'UR'  then 18
    when 'SAR' then 12
    when 'MA'  then  9
    when 'SR'  then  7
    when 'AR'  then  4
    when 'RR'  then  3
    when 'R'   then  2
    when 'U'   then  1
    when 'C'   then  1
    else 0
  end::int;
$$;

grant execute on function rarity_score(text) to anon, authenticated;

-- 모든 유저의 pet_score 즉시 재계산 — 새 rarity_score × 15.
update users
   set pet_score = pet_score_for(coalesce(main_card_ids, '{}'::uuid[]));

-- ── 3) 메달 기반 +10,000 전투력 버프 ──
-- gym_compute_user_center_power: gym_ownerships → user_gym_medals.
-- 메달은 영구 보유라 점령 잃어도 버프 유지. spec 1-3 에 정확히 일치.
create or replace function gym_compute_user_center_power(p_user_id uuid)
returns int
language sql
stable
set search_path = public, extensions
as $$
  select coalesce((
    -- showcase_power 합산
    select sum(showcase_power(g2.rarity, g2.grade))::int
    from showcase_cards sc
    join user_showcases us on us.id = sc.showcase_id
    join psa_gradings g2 on g2.id = sc.grading_id
    where us.user_id = p_user_id
  ), 0)
  + coalesce(pokedex_power_bonus(p_user_id), 0)
  + coalesce(pokedex_completion_bonus(p_user_id), 0)
  + coalesce((
    select pet_score from users where id = p_user_id
  ), 0)
  + coalesce((
    -- 보유 메달 수 × 10,000 (영구 누적, 점령 잃어도 유지)
    select count(*)::int * 10000
      from user_gym_medals where user_id = p_user_id
  ), 0);
$$;

grant execute on function gym_compute_user_center_power(uuid) to anon, authenticated;

-- get_user_rankings 의 center_power 식도 메달 기반으로.
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
        select jsonb_agg(jsonb_build_object(
          'id', g3.id, 'card_id', g3.card_id,
          'grade', g3.grade, 'rarity', g3.rarity)
          order by array_position(u.main_card_ids, g3.id))
        from psa_gradings g3
       where g3.user_id = u.id
         and g3.id = any(coalesce(u.main_card_ids, '{}'::uuid[]))
         and g3.grade = 10
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
        -- 메달 기반 (이전: gym_ownerships count). 영구 누적.
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
      -- gym_count 는 현재 점령 수. UI 호환 위해 유지.
      (select count(*)::int from gym_ownerships where owner_user_id = u.id) as gym_count,
      -- medal_count 신규 노출 — 클라가 buff 분해 시 사용.
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

-- ── 4) BOX 가격 30,000 (이전 70,000) ──
create or replace function buy_box(
  p_user_id uuid,
  p_set_code text
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_price int := 30000;
  v_points int;
begin
  select points into v_points from users where id = p_user_id for update;
  if coalesce(v_points, 0) < v_price then
    return json_build_object(
      'ok', false,
      'error', format('포인트가 부족해요. 박스 가격: %s p, 현재: %s p',
                      v_price, coalesce(v_points, 0)),
      'price', v_price,
      'points', coalesce(v_points, 0)
    );
  end if;
  update users set points = points - v_price where id = p_user_id;
  return json_build_object('ok', true,
    'price', v_price,
    'points', v_points - v_price);
end;
$$;

grant execute on function buy_box(uuid, text) to anon, authenticated;

create or replace function refund_box_purchase(
  p_user_id uuid,
  p_set_code text
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_cost int := 30000;
  v_new_points int;
begin
  update users set points = points + v_cost
    where id = p_user_id
    returning points into v_new_points;
  return json_build_object(
    'ok', true,
    'refunded', v_cost,
    'points', v_new_points
  );
end;
$$;

grant execute on function refund_box_purchase(uuid, text) to anon, authenticated;

-- ── 5) get_profile 의 gym_buff 도 메달 기반으로 ──
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
  v_center_power int := 0;
  v_pokedex_count int := 0;
  v_pokedex_bonus int := 0;
  v_pokedex_completion int := 0;
  v_gym_buff int := 0;
begin
  select "character", main_card_ids,
         coalesce(pet_score, 0),
         coalesce(pokedex_count, 0)
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

  select compute_user_pet_score(p_user_id) into v_pet_score;
  update users set pet_score = v_pet_score where id = p_user_id;

  select coalesce(sum(showcase_power(g2.rarity, g2.grade))::int, 0)
    into v_center_power
    from showcase_cards sc
    join user_showcases us on us.id = sc.showcase_id
    join psa_gradings g2 on g2.id = sc.grading_id
   where us.user_id = p_user_id;

  begin v_pokedex_bonus := pokedex_power_bonus(p_user_id);
  exception when undefined_function then v_pokedex_bonus := 0; end;
  begin v_pokedex_completion := coalesce(pokedex_completion_bonus(p_user_id), 0);
  exception when undefined_function then v_pokedex_completion := 0; end;

  -- 보유 메달 1개당 +10,000 (이전: 점령 중인 체육관 count). 메달은
  -- 영구 누적이라 점령 잃어도 버프 유지.
  select count(*)::int * 10000 into v_gym_buff
    from user_gym_medals where user_id = p_user_id;

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
      + coalesce(v_pet_score, 0)
      + v_gym_buff,
    'pokedex_count', v_pokedex_count,
    'pokedex_bonus', v_pokedex_bonus,
    'pokedex_completion_bonus', v_pokedex_completion,
    'gym_buff', v_gym_buff);
end;
$$;

grant execute on function get_profile(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
