-- ============================================================
-- Profile + Pet system.
--
-- Each user picks one canonical Pokemon trainer character and
-- registers up to 5 "main cards" (PCL10 slabs) as 펫. The pet
-- score is a denormalized cache:
--
--     pet_score = Σ rarity_score(rarity) × 10
--
--   rarity_score:  SR → 5  MA → 6  SAR → 7  UR → 8  MUR → 10
--   pcl factor is locked at 10 (only PCL10 slabs are eligible).
--   Max single card: MUR PCL10 = 100.
--   Max pet score:   5 × MUR PCL10 = 500.
--
-- Idempotent — safe to re-run.
-- ============================================================

alter table users
  add column if not exists "character" text;

alter table users
  add column if not exists main_card_ids uuid[] not null default '{}';

alter table users
  add column if not exists pet_score int not null default 0;

create or replace function rarity_score(p_rarity text) returns int
language sql immutable as $$
  select case p_rarity
    when 'SR'  then 5
    when 'MA'  then 6
    when 'SAR' then 7
    when 'UR'  then 8
    when 'MUR' then 10
    else 0
  end
$$;

create or replace function is_valid_character(p_character text) returns boolean
language sql immutable as $$
  select p_character in ('red', 'leaf', 'ethan', 'lyra', 'hilbert', 'hilda')
$$;

create or replace function pet_score_for(p_grading_ids uuid[]) returns int
language sql
stable
set search_path = public, extensions
as $$
  select coalesce(sum(rarity_score(g.rarity) * 10), 0)::int
    from psa_gradings g
   where g.id = any(coalesce(p_grading_ids, '{}'::uuid[]))
     and g.grade = 10
$$;

create or replace function set_character(
  p_user_id uuid,
  p_character text
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not is_valid_character(p_character) then
    return json_build_object('ok', false, 'error', '유효하지 않은 캐릭터입니다.');
  end if;

  update users set "character" = p_character where id = p_user_id;
  if not found then
    return json_build_object('ok', false, 'error', '사용자를 찾을 수 없습니다.');
  end if;

  return json_build_object('ok', true, 'character', p_character);
end;
$$;

create or replace function set_main_cards(
  p_user_id uuid,
  p_grading_ids uuid[]
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ids uuid[];
  v_valid_count int;
  v_score int;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  v_ids := coalesce(p_grading_ids, '{}'::uuid[]);

  if array_length(v_ids, 1) is not null and array_length(v_ids, 1) > 5 then
    return json_build_object('ok', false, 'error', '펫은 최대 5장까지 등록할 수 있어요.');
  end if;

  if array_length(v_ids, 1) is not null then
    select count(*)::int into v_valid_count
      from psa_gradings g
     where g.id = any(v_ids)
       and g.user_id = p_user_id
       and g.grade = 10;
    if v_valid_count <> array_length(v_ids, 1) then
      return json_build_object(
        'ok', false,
        'error', '본인의 PCL10 슬랩만 펫으로 등록할 수 있어요.'
      );
    end if;
  end if;

  v_score := pet_score_for(v_ids);

  update users
     set main_card_ids = v_ids,
         pet_score = v_score
   where id = p_user_id;
  if not found then
    return json_build_object('ok', false, 'error', '사용자를 찾을 수 없습니다.');
  end if;

  return json_build_object('ok', true, 'pet_score', v_score, 'count', coalesce(array_length(v_ids, 1), 0));
end;
$$;

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
begin
  select "character", main_card_ids, pet_score
    into v_character, v_ids, v_pet_score
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

  return json_build_object(
    'ok', true,
    'character', v_character,
    'main_card_ids', to_jsonb(v_ids),
    'pet_score', v_pet_score,
    'main_cards', v_cards
  );
end;
$$;

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
      (
        coalesce(u.pcl_10_wins, 0) * 500
        + coalesce((
            select count(*)::int * 3000
              from sabotage_logs l
             where l.attacker_id = u.id and l.success
          ), 0)
        + coalesce((
            select count(*)::int * 50
              from sabotage_logs l
             where l.victim_id = u.id and not l.success
          ), 0)
      ) as rank_score,
      coalesce((
        select sum(rarity_power(g2.rarity) * pcl_power(g2.grade))::int
        from showcase_cards sc
        join user_showcases us on us.id = sc.showcase_id
        join psa_gradings g2 on g2.id = sc.grading_id
        where us.user_id = u.id
      ), 0) as center_power,
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

grant execute on function rarity_score(text) to anon, authenticated;
grant execute on function is_valid_character(text) to anon, authenticated;
grant execute on function pet_score_for(uuid[]) to anon, authenticated;
grant execute on function set_character(uuid, text) to anon, authenticated;
grant execute on function set_main_cards(uuid, uuid[]) to anon, authenticated;
grant execute on function get_profile(uuid) to anon, authenticated;
grant execute on function get_user_rankings() to anon, authenticated;

notify pgrst, 'reload schema';
