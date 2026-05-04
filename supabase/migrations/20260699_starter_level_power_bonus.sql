-- ============================================================
-- 내 포켓몬 LV → 유저 전투력 보너스 (정액).
--
-- 컨셉:
--   내 포켓몬 LV 에 따라 유저 전투력 (center_power) 이 정액으로 증가.
--   표시/랭킹용 성장 지표이며, 체육관 실제 전투 스탯 산식
--   (gym_pet_battle_stats / gym_compute_user_center_power) 에는 절대
--   들어가지 않음.
--
--   - 적용 위치: get_profile.center_power, get_user_rankings.center_power
--   - 미적용: gym_compute_user_center_power (체육관 진입/방어자 stats 계산
--     에서 그대로 호출되므로 보너스가 들어가면 전투 결과가 바뀜)
--
-- 표 (Lv → +bonus):
--    1=10k   2=15k   3=21k   4=28k   5=36k   6=45k   7=55k   8=66k
--    9=78k   10=95k  11=112k 12=130k 13=150k 14=172k 15=196k 16=222k
--    17=250k 18=280k 19=312k 20=350k 21=390k 22=435k 23=485k 24=540k
--    25=600k 26=670k 27=750k 28=840k 29=940k 30=1.05M
--
-- 같은 표가 클라이언트 src/lib/starter-power.ts 에도 있음. 표 변경 시
-- 양쪽을 같이 업데이트.
-- ============================================================

-- ── 1) LV → bonus (정액 표) ──
create or replace function starter_level_power_bonus(p_level int)
returns int
language sql
immutable
set search_path = public
as $$
  select case
    when p_level is null or p_level < 1 then 0
    when p_level >= 30 then 1050000
    when p_level = 29 then 940000
    when p_level = 28 then 840000
    when p_level = 27 then 750000
    when p_level = 26 then 670000
    when p_level = 25 then 600000
    when p_level = 24 then 540000
    when p_level = 23 then 485000
    when p_level = 22 then 435000
    when p_level = 21 then 390000
    when p_level = 20 then 350000
    when p_level = 19 then 312000
    when p_level = 18 then 280000
    when p_level = 17 then 250000
    when p_level = 16 then 222000
    when p_level = 15 then 196000
    when p_level = 14 then 172000
    when p_level = 13 then 150000
    when p_level = 12 then 130000
    when p_level = 11 then 112000
    when p_level = 10 then 95000
    when p_level = 9  then 78000
    when p_level = 8  then 66000
    when p_level = 7  then 55000
    when p_level = 6  then 45000
    when p_level = 5  then 36000
    when p_level = 4  then 28000
    when p_level = 3  then 21000
    when p_level = 2  then 15000
    when p_level = 1  then 10000
    else 0
  end::int;
$$;

grant execute on function starter_level_power_bonus(int) to anon, authenticated;

-- ── 2) user_id → bonus (포켓몬 미선택은 0) ──
create or replace function user_starter_power_bonus(p_user_id uuid)
returns int
language sql
stable
set search_path = public
as $$
  select coalesce(starter_level_power_bonus(s.level), 0)
    from user_starter s
   where s.user_id = p_user_id;
$$;

grant execute on function user_starter_power_bonus(uuid) to anon, authenticated;

-- ── 3) get_profile — center_power 에 starter LV 보너스 합산 + 분해 노출 ──
-- 20260638 정의 그대로 + starter_power_bonus 합산만 추가. 체육관/배틀
-- 함수는 일절 건드리지 않음.
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
  v_starter_bonus int := 0;
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

  -- 내 포켓몬 LV 보너스 (포켓몬 미선택은 0).
  select coalesce(user_starter_power_bonus(p_user_id), 0) into v_starter_bonus;

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
      + v_gym_buff
      + v_starter_bonus,
    'pokedex_count', v_pokedex_count,
    'pokedex_bonus', v_pokedex_bonus,
    'pokedex_completion_bonus', v_pokedex_completion,
    'gym_buff', v_gym_buff,
    'starter_power_bonus', v_starter_bonus);
end;
$$;

grant execute on function get_profile(uuid) to anon, authenticated;

-- ── 4) get_user_rankings — center_power 식에 starter LV 보너스 합산 ──
-- 20260690 정의 그대로 + 한 줄만 추가.
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
          order by
            case g.type
              when '풀'     then 0
              when '불꽃'   then 1
              when '물'     then 2
              when '전기'   then 3
              when '얼음'   then 4
              when '바위'   then 5
              when '땅'     then 6
              when '에스퍼' then 7
              else 8
            end,
            m.earned_at desc)
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
        -- 내 포켓몬 LV 보너스 (표시/랭킹용; 포켓몬 미선택 유저는 0).
        + coalesce(user_starter_power_bonus(u.id), 0)
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
      coalesce(user_starter_power_bonus(u.id), 0) as starter_power_bonus
    from users u
    left join psa_gradings g on g.user_id = u.id
    group by u.id
  ) r;
  return v_rows;
end;
$$;

grant execute on function get_user_rankings() to anon, authenticated;

notify pgrst, 'reload schema';

-- 마이그레이션: 20260699_starter_level_power_bonus.sql
