-- ============================================================
-- 메달 버프 난이도 비례 — 메달 1개 일정 +10,000 → 난이도별 차등.
--
-- 사용자 요청: "체육관 메달도 난이도에 비례해서 전투력 + 올려줘야해."
-- 일일 보상과 동일 1x/2x/4x/8x 스케일.
--
--   EASY    → +10,000  (이전 동일)
--   NORMAL  → +20,000
--   HARD    → +40,000
--   BOSS    → +80,000
--
-- 영향 RPC 3종에서 medal_count × 10000 산식을 SUM(buff) 로 교체:
--   · gym_compute_user_center_power
--   · get_user_rankings
--   · get_profile
-- ============================================================

create or replace function gym_medal_buff(p_difficulty text)
returns int
language sql
immutable
set search_path = public
as $$
  select case p_difficulty
    when 'EASY'   then 10000
    when 'NORMAL' then 20000
    when 'HARD'   then 40000
    when 'BOSS'   then 80000
    else 10000
  end::int;
$$;

grant execute on function gym_medal_buff(text) to anon, authenticated;

-- gym_compute_user_center_power — 메달 buff 합산.
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
    -- 보유 메달 buff 합산 (난이도 비례).
    select sum(gym_medal_buff(g.difficulty))::int
      from user_gym_medals m
      join gyms g on g.id = m.gym_id
     where m.user_id = p_user_id
  ), 0);
$$;

grant execute on function gym_compute_user_center_power(uuid) to anon, authenticated;

-- get_user_rankings — center_power + medal_count + medal_buff 노출.
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
            select sum(gym_medal_buff(g.difficulty))::int
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
        select sum(gym_medal_buff(g.difficulty))::int
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

-- get_profile — gym_buff 산출 동일.
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

  -- 메달 buff 합산 (난이도 비례).
  select coalesce(sum(gym_medal_buff(g.difficulty))::int, 0)
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
