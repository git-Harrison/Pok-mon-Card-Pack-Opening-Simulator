-- ============================================================
-- 체육관 방어덱 - 펫 슬롯 정합 cleanup + set_gym_defense_deck cap 버그 fix.
--
-- 진단:
-- 사용자 hun 잎새 체육관에 펫 3마리를 방어덱으로 넣었는데도 /profile
-- 펫 슬롯에 그대로 노출. 원인:
--   (1) 20260598 마이그레이션 이전에 set_gym_defense_deck 호출 시
--       defense_pet_ids 만 셋업되고 main_card_ids 는 그대로 남았던
--       기록 — 데이터 잔존.
--   (2) 20260598 set_gym_defense_deck 의 v_returned cap 체크 식이
--       잘못돼 일부 케이스에서 main_card_ids 갱신 누락 가능성.
--
-- 조치:
--   A) 모든 유저의 main_card_ids 에서, 본인 소유 체육관의 모든
--      defense_pet_ids 를 제거. pet_score 재계산.
--   B) set_gym_defense_deck v3 — cap 체크를 array slice 기반으로 단순
--      화. 새 defense 셋팅 시 main 에서 명시적으로 제거 보장.
-- ============================================================

-- A) cleanup — main_card_ids 에서 defense 슬랩 제거
update users u
   set main_card_ids = array(
     select id from unnest(coalesce(u.main_card_ids, '{}'::uuid[])) as id
      where not exists (
        select 1 from gym_ownerships o
         where o.owner_user_id = u.id
           and id = any(coalesce(o.defense_pet_ids, '{}'::uuid[]))
      )
   )
 where exists (
   select 1 from gym_ownerships o
    where o.owner_user_id = u.id
      and o.defense_pet_ids is not null
      and coalesce(array_length(o.defense_pet_ids, 1), 0) > 0
 );

-- pet_score 일괄 재계산
update users set pet_score = compute_user_pet_score(id);

-- B) set_gym_defense_deck v3 — cap 체크 단순화
create or replace function set_gym_defense_deck(
  p_user_id uuid,
  p_gym_id text,
  p_pet_grading_ids uuid[],
  p_pet_types text[]
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_owner record;
  v_main_ids uuid[];
  v_pet_id uuid;
  v_gym record;
  v_old_def uuid[];
  v_returned uuid[];
  v_new_main uuid[];
  v_slot_left int;
  v_score int;
begin
  if p_user_id is null or p_gym_id is null then
    return json_build_object('ok', false, 'error', '요청이 올바르지 않아요.');
  end if;
  if p_pet_grading_ids is null
     or coalesce(array_length(p_pet_grading_ids, 1), 0) <> 3 then
    return json_build_object('ok', false, 'error', '펫 3마리를 선택해주세요.');
  end if;
  if p_pet_types is null
     or coalesce(array_length(p_pet_types, 1), 0) <> 3 then
    return json_build_object('ok', false, 'error', '펫 타입 정보가 부족해요.');
  end if;
  if (select count(distinct id) from unnest(p_pet_grading_ids) as id) <> 3 then
    return json_build_object('ok', false, 'error', '펫 3마리는 서로 달라야 해요.');
  end if;

  perform pg_advisory_xact_lock(hashtext('gym:' || p_gym_id));

  select * into v_owner from gym_ownerships
    where gym_id = p_gym_id for update;
  if not found then
    return json_build_object('ok', false, 'error', '비점령 체육관입니다.');
  end if;
  if v_owner.owner_user_id <> p_user_id then
    return json_build_object('ok', false, 'error', '체육관 소유자만 방어 덱을 설정할 수 있어요.');
  end if;

  select * into v_gym from gyms where id = p_gym_id;
  for i in 1..3 loop
    if p_pet_types[i] is null or p_pet_types[i] <> v_gym.type then
      return json_build_object('ok', false,
        'error', format('이 체육관은 %s 속성 펫만 방어 덱에 등록 가능합니다.', v_gym.type),
        'gym_type', v_gym.type);
    end if;
  end loop;

  select coalesce(main_card_ids, '{}'::uuid[]) into v_main_ids
    from users where id = p_user_id for update;

  -- 새 defense 펫은 본인 PCL10 소유여야 + (main_card_ids 에 있거나
  -- 기존 defense 에 있어야).
  for v_pet_id in select unnest(p_pet_grading_ids) loop
    if not exists (
      select 1 from psa_gradings g
       where g.id = v_pet_id and g.user_id = p_user_id and g.grade = 10
    ) then
      return json_build_object('ok', false,
        'error', '본인 소유 PCL10 슬랩만 등록 가능합니다.');
    end if;
    if not (
      v_pet_id = any(v_main_ids)
      or v_pet_id = any(coalesce(v_owner.defense_pet_ids, '{}'::uuid[]))
    ) then
      return json_build_object('ok', false,
        'error', '펫 슬롯에 등록되지 않은 슬랩이에요. 먼저 펫 등록 후 방어 덱에 넣을 수 있어요.');
    end if;
  end loop;

  v_old_def := coalesce(v_owner.defense_pet_ids, '{}'::uuid[]);
  -- 새 defense 에 없는 옛 defense 펫 → main 으로 복귀 후보.
  v_returned := array(
    select id from unnest(v_old_def) as id
     where not (id = any(p_pet_grading_ids))
  );

  -- main = (옛 main - 새 defense)
  v_new_main := array(
    select id from unnest(v_main_ids) as id
     where not (id = any(p_pet_grading_ids))
  );
  -- 복귀 펫 추가 (10 슬롯 cap, array slice 사용)
  v_slot_left := greatest(0, 10 - coalesce(array_length(v_new_main, 1), 0));
  if v_slot_left > 0 and coalesce(array_length(v_returned, 1), 0) > 0 then
    v_new_main := v_new_main || v_returned[1:v_slot_left];
  end if;

  update users set main_card_ids = v_new_main where id = p_user_id;
  update gym_ownerships
     set defense_pet_ids = p_pet_grading_ids,
         defense_pet_types = p_pet_types
   where gym_id = p_gym_id;

  v_score := compute_user_pet_score(p_user_id);
  update users set pet_score = v_score where id = p_user_id;

  return json_build_object(
    'ok', true,
    'gym_id', p_gym_id,
    'defense_pet_ids', to_jsonb(p_pet_grading_ids),
    'pet_score', v_score,
    'main_card_ids', to_jsonb(v_new_main));
end;
$$;

grant execute on function set_gym_defense_deck(uuid, text, uuid[], text[]) to anon, authenticated;

-- C) get_user_rankings — gym_medals 필드 추가 (UsersView 모든 탭 노출용)
create or replace function get_user_rankings()
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_rows json;
begin
  select coalesce(json_agg(r order by r.rank_score desc, r.points desc), '[]'::json)
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
        + (select count(*)::int * 10000 from gym_ownerships where owner_user_id = u.id)
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

notify pgrst, 'reload schema';
