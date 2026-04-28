-- ============================================================
-- 체육관 최소 전투력 완화 + 메달 전투력 per-gym 차등 (Ch1~Ch3)
--
-- 사용자 요청: 후반부 min_power 가 너무 급격히 올라가지 않도록 완화.
-- 메달 전투력은 기존 차등안 유지(난이도 단위 → 개별 체육관 단위 세분화).
--
-- ── 새 min_power (Ch4 제외) ────────────────────────────────
-- Ch1 (8): 풀 30k / 물 50k / 바위 75k / 전기 105k / 불꽃 140k /
--          땅 180k / 얼음 225k / 에스퍼 275k
-- Ch2 (3): 노말 340k / 격투 420k / 벌레 520k
-- Ch3 (7): 독 650k / 비행 800k / 고스트 970k / 페어리 1.16M /
--          강철 1.38M / 악 1.62M / 드래곤 1.9M
-- Ch4   : 변경하지 않음
--
-- ── 메달 전투력 (per-gym) ───────────────────────────────────
-- Ch1: 풀 +10k / 물 +12k / 바위 +15k / 전기 +18k / 불꽃 +22k /
--      땅 +26k / 얼음 +31k / 에스퍼 +36k
-- Ch2: 노말 +45k / 격투 +55k / 벌레 +70k
-- Ch3: 독 +90k / 비행 +110k / 고스트 +135k / 페어리 +165k /
--      강철 +200k / 악 +245k / 드래곤 +300k
--
-- 메달은 영구(업적) — user_gym_medals (user_id, gym_id) PK 로 중복 방지.
-- 메달 전투력은 center_power 에 1회만 합산 (프로필/랭킹/체육관 동일).
--
-- gym_medal_buff(text) 시그니처는 유지하되 의미를 difficulty → gym_id 로
-- 전환. 호출 측 3개 RPC 의 'g.difficulty' 인자를 'g.id' 로 갱신.
-- ============================================================

-- ── 1) gyms.min_power 업데이트 (Ch1~Ch3 18개) ───────────────

-- Ch1
update gyms set min_power =   30000 where id = 'gym-grass';
update gyms set min_power =   50000 where id = 'gym-water';
update gyms set min_power =   75000 where id = 'gym-rock';
update gyms set min_power =  105000 where id = 'gym-electric';
update gyms set min_power =  140000 where id = 'gym-fire';
update gyms set min_power =  180000 where id = 'gym-ground';
update gyms set min_power =  225000 where id = 'gym-ice';
update gyms set min_power =  275000 where id = 'gym-psychic';

-- Ch2
update gyms set min_power =  340000 where id = 'gym-normal';
update gyms set min_power =  420000 where id = 'gym-fighting';
update gyms set min_power =  520000 where id = 'gym-bug';

-- Ch3
update gyms set min_power =  650000 where id = 'gym-poison';
update gyms set min_power =  800000 where id = 'gym-flying';
update gyms set min_power =  970000 where id = 'gym-ghost';
update gyms set min_power = 1160000 where id = 'gym-fairy';
update gyms set min_power = 1380000 where id = 'gym-steel';
update gyms set min_power = 1620000 where id = 'gym-dark';
update gyms set min_power = 1900000 where id = 'gym-dragon';

-- ── 2) gym_medal_buff — gym_id 기반 per-gym 차등 ───────────
--
-- 주의: 파라미터 이름은 기존 gym_medal_buff(p_difficulty text) 와 동일하게
-- 'p_difficulty' 를 그대로 유지. PostgreSQL CREATE OR REPLACE FUNCTION 은
-- 파라미터 이름 변경을 거부하므로 (cannot change name of input parameter)
-- 의미는 gym_id 로 바뀌었지만 식별자는 그대로 두고 본문만 교체.

create or replace function gym_medal_buff(p_difficulty text)
returns int
language sql
immutable
set search_path = public
as $$
  -- 사실상 p_difficulty 파라미터는 이제 gym_id 를 받음.
  select case p_difficulty
    -- Ch1
    when 'gym-grass'    then  10000
    when 'gym-water'    then  12000
    when 'gym-rock'     then  15000
    when 'gym-electric' then  18000
    when 'gym-fire'     then  22000
    when 'gym-ground'   then  26000
    when 'gym-ice'      then  31000
    when 'gym-psychic'  then  36000
    -- Ch2
    when 'gym-normal'   then  45000
    when 'gym-fighting' then  55000
    when 'gym-bug'      then  70000
    -- Ch3
    when 'gym-poison'   then  90000
    when 'gym-flying'   then 110000
    when 'gym-ghost'    then 135000
    when 'gym-fairy'    then 165000
    when 'gym-steel'    then 200000
    when 'gym-dark'     then 245000
    when 'gym-dragon'   then 300000
    -- Ch4 / 알 수 없는 gym — 보수적 fallback
    else 10000
  end::int;
$$;

grant execute on function gym_medal_buff(text) to anon, authenticated;

-- ── 3) gym_compute_user_center_power — 메달 합산을 g.id 기준으로 ──

create or replace function gym_compute_user_center_power(p_user_id uuid)
returns int
language sql
stable
set search_path = public, extensions
as $$
  select coalesce((
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
    -- 보유 메달 buff 합산 (per-gym 차등).
    select sum(gym_medal_buff(g.id))::int
      from user_gym_medals m
      join gyms g on g.id = m.gym_id
     where m.user_id = p_user_id
  ), 0);
$$;

grant execute on function gym_compute_user_center_power(uuid) to anon, authenticated;

-- ── 4) get_user_rankings — center_power + medal_buff per-gym 적용 ──
-- 기존 함수 본문 그대로 재선언, gym_medal_buff(g.difficulty) → gym_medal_buff(g.id) 만 교체.

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
      ), 0) as medal_buff,
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

-- ── 5) get_profile — gym_buff per-gym 적용 ─────────────────

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
  v_by_type jsonb;
  v_by_type_cards jsonb;
  v_center_power int := 0;
  v_pokedex_count int := 0;
  v_pokedex_bonus int := 0;
  v_pokedex_completion int := 0;
  v_gym_buff int := 0;
begin
  select "character", main_card_ids,
         coalesce(pet_score, 0),
         coalesce(pokedex_count, 0),
         coalesce(main_cards_by_type, '{}'::jsonb)
    into v_character, v_ids, v_pet_score, v_pokedex_count, v_by_type
    from users
   where id = p_user_id;
  if not found then
    return json_build_object('ok', false, 'error', '사용자를 찾을 수 없습니다.');
  end if;

  v_ids := coalesce(v_ids, '{}'::uuid[]);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', g.id, 'card_id', g.card_id,
           'grade', g.grade, 'rarity', g.rarity,
           'graded_at', g.graded_at
         ) order by array_position(v_ids, g.id)), '[]'::jsonb)
    into v_cards
    from psa_gradings g
   where g.id = any(v_ids)
     and g.user_id = p_user_id
     and g.grade = 10;

  select coalesce(jsonb_object_agg(t.key, t.cards), '{}'::jsonb)
    into v_by_type_cards
    from (
      select k.key,
             coalesce(
               (select jsonb_agg(
                  jsonb_build_object(
                    'id', g.id, 'card_id', g.card_id,
                    'rarity', g.rarity, 'grade', g.grade,
                    'graded_at', g.graded_at
                  )
                  order by array_position(
                    array(select (e.value)::uuid from jsonb_array_elements_text(k.value) e),
                    g.id
                  )
                )
                from psa_gradings g
                where g.user_id = p_user_id
                  and g.id in (
                    select (e.value)::uuid
                      from jsonb_array_elements_text(k.value) e
                  )),
               '[]'::jsonb
             ) as cards
        from jsonb_each(coalesce(v_by_type, '{}'::jsonb)) k(key, value)
    ) t;

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

  -- 메달 buff 합산 (per-gym 차등).
  select coalesce(sum(gym_medal_buff(g.id))::int, 0)
    into v_gym_buff
    from user_gym_medals m
    join gyms g on g.id = m.gym_id
   where m.user_id = p_user_id;

  return json_build_object(
    'ok', true,
    'character', v_character,
    'character_locked', v_character is not null,
    'main_card_ids', to_jsonb(v_ids),
    'pet_score', v_pet_score,
    'main_cards', v_cards,
    'main_cards_by_type', coalesce(v_by_type_cards, '{}'::jsonb),
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
