-- ============================================================
-- 체육관 1회 승리 → +2000 전투력 영구 누적.
--
-- 컨셉:
--   체육관 도전 승리 1회당 유저 전투력 (center_power) 에 +2000 영구
--   가산. 점령 잃어도 누적량 유지 (gym_battle_logs 의 result='won' row
--   가 영구 보존되므로 자연 누적). 야생/방어덱 상대 무관 — won 이면
--   전부 카운트.
--
--   - 적용 위치 (전부): gym_compute_user_center_power · get_profile.center_power
--                       · get_user_rankings.center_power
--   - 미적용: gym_pet_battle_stats (v5+ 부터 p_center_power 미사용 — 전투
--             스탯 산식 영향 X)
--
--   가산 시점: resolve_gym_battle 에서 winner='won' 시 gym_battle_logs
--   에 result='won' insert → 다음 center_power 계산부터 즉시 반영.
--   resolve_gym_battle 본문 변경 불필요 (count(*) 기반).
--
-- 표시:
--   get_profile / get_user_rankings 둘 다 'gym_win_count' (정수 카운트)
--   와 'gym_win_power_bonus' (count*2000) 분해 필드 신규 노출. UsersView
--   ScoreBreakdown 에서 "체육관 승리 ×N" 칩으로 보여줌.
--
-- 성능:
--   gym_battle_logs 의 won row 만 카운트하는 partial index 추가 — 패배
--   row 무시되므로 active player 수천 row 도 ms 단위.
--
-- 멱등 — CREATE OR REPLACE / IF NOT EXISTS 만 사용.
-- ============================================================

-- ── 1) gym_battle_logs partial index — 승리만 ──
create index if not exists gym_battle_logs_user_won_idx
  on gym_battle_logs(challenger_user_id) where result = 'won';

-- ── 2) helper: 유저별 체육관 승리 카운트 ──
create or replace function user_gym_win_count(p_user_id uuid)
returns int
language sql
stable
set search_path = public
as $$
  select coalesce(count(*)::int, 0)
    from gym_battle_logs
   where challenger_user_id = p_user_id
     and result = 'won';
$$;

grant execute on function user_gym_win_count(uuid) to anon, authenticated;

-- ── 3) helper: 승리 카운트 × 2000 정액 ──
-- 단가 변경은 본 함수 한 곳만 수정하면 모든 합산식에 반영됨.
create or replace function gym_win_power_per_kill()
returns int language sql immutable as $$ select 2000 $$;

create or replace function user_gym_win_power_bonus(p_user_id uuid)
returns int
language sql
stable
set search_path = public
as $$
  select coalesce(user_gym_win_count(p_user_id) * gym_win_power_per_kill(), 0);
$$;

grant execute on function gym_win_power_per_kill() to anon, authenticated;
grant execute on function user_gym_win_power_bonus(uuid) to anon, authenticated;

-- ── 4) gym_compute_user_center_power — gym_win bonus 합산 ──
-- 20260702 정의 그대로 + user_gym_win_power_bonus 한 줄 추가.
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
  -- 메달 buff 합산 (per-gym 차등 — gym_medal_buff(gym_id))
  + coalesce((
    select sum(gym_medal_buff(g.id))::int
      from user_gym_medals m
      join gyms g on g.id = m.gym_id
     where m.user_id = p_user_id
  ), 0)
  -- 내 포켓몬 LV 보너스 (20260699 도입). 포켓몬 미선택 유저는 0.
  + coalesce(user_starter_power_bonus(p_user_id), 0)
  -- 체육관 승리 누적 보너스 (20260729 신규). 1승당 2000.
  -- 표시/도전조건용; 전투 stat 산식에는 영향 없음 (gym_pet_battle_stats 가
  -- p_center_power 를 미사용).
  + coalesce(user_gym_win_power_bonus(p_user_id), 0);
$$;

grant execute on function gym_compute_user_center_power(uuid) to anon, authenticated;

-- ── 5) get_profile — center_power 에 gym_win 합산 + 분해 노출 ──
-- 20260699 정의 그대로 + 두 변수 / 두 출력 필드만 추가.
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
  v_gym_win_count int := 0;
  v_gym_win_bonus int := 0;
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

  -- 체육관 승리 누적 보너스 (20260729 신규).
  select coalesce(user_gym_win_count(p_user_id), 0) into v_gym_win_count;
  v_gym_win_bonus := v_gym_win_count * gym_win_power_per_kill();

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
      + v_starter_bonus
      + v_gym_win_bonus,
    'pokedex_count', v_pokedex_count,
    'pokedex_bonus', v_pokedex_bonus,
    'pokedex_completion_bonus', v_pokedex_completion,
    'gym_buff', v_gym_buff,
    'starter_power_bonus', v_starter_bonus,
    'gym_win_count', v_gym_win_count,
    'gym_win_power_bonus', v_gym_win_bonus);
end;
$$;

grant execute on function get_profile(uuid) to anon, authenticated;

-- ── 6) get_user_rankings — center_power 에 gym_win 합산 + 분해 필드 ──
-- 20260699 정의 그대로 + 한 줄 합산 + 두 출력 필드.
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
        + coalesce(user_starter_power_bonus(u.id), 0)
        -- 체육관 승리 누적 보너스 (20260729 신규).
        + coalesce(user_gym_win_power_bonus(u.id), 0)
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
      coalesce(user_starter_power_bonus(u.id), 0) as starter_power_bonus,
      -- 분해 표기용 — 카운트 / 보너스 정수.
      coalesce(user_gym_win_count(u.id), 0) as gym_win_count,
      coalesce(user_gym_win_power_bonus(u.id), 0) as gym_win_power_bonus
    from users u
    left join psa_gradings g on g.user_id = u.id
    group by u.id
  ) r;
  return v_rows;
end;
$$;

grant execute on function get_user_rankings() to anon, authenticated;

notify pgrst, 'reload schema';

-- 마이그레이션: 20260729_gym_win_power_bonus.sql
