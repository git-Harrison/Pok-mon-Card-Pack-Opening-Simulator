-- ============================================================
-- Showcase passive income: rarity base + PCL bonus per hour.
--
-- Each displayed slab earns hourly:
--   rarity_hourly_base(rarity) + pcl_hourly_bonus(grade)
--
-- rarity_hourly_base:
--   SR  → 1,000   MA → 1,500   SAR → 3,000
--   UR  → 5,000   MUR → 7,000
-- pcl_hourly_bonus:
--   PCL 9 → 2,000   PCL 10 → 5,000
--
-- Card rarity lives in the client-side sets catalog, not the DB, so
-- we record it on psa_gradings at grading time. submit_psa_grading
-- and bulk_submit_psa_grading both gain a rarity param.
-- ============================================================

alter table psa_gradings
  add column if not exists rarity text;

create or replace function rarity_hourly_base(p_rarity text) returns int
language sql immutable as $$
  select case p_rarity
    when 'SR'  then 1000
    when 'MA'  then 1500
    when 'SAR' then 3000
    when 'UR'  then 5000
    when 'MUR' then 7000
    else 1000  -- unknown / pre-migration fallback
  end
$$;

create or replace function pcl_hourly_bonus(p_grade int) returns int
language sql immutable as $$
  select case p_grade
    when 10 then 5000
    when 9  then 2000
    else 0
  end
$$;

-- ----------------------------------------------------------------
-- submit_psa_grading — now records rarity on success
-- ----------------------------------------------------------------
create or replace function submit_psa_grading(
  p_user_id uuid,
  p_card_id text,
  p_rarity text default null
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_count int;
  v_grade int;
  v_roll numeric;
  v_bonus int := 0;
  v_new_points int;
begin
  select count into v_count from card_ownership
    where user_id = p_user_id and card_id = p_card_id;
  if not found or coalesce(v_count, 0) < 1 then
    return json_build_object('ok', false, 'error', '보유하지 않은 카드입니다.');
  end if;

  update card_ownership set count = count - 1, last_pulled_at = now()
    where user_id = p_user_id and card_id = p_card_id;
  delete from card_ownership
    where user_id = p_user_id and card_id = p_card_id and count = 0;

  v_roll := random() * 100;

  if v_roll < 70 then
    return json_build_object('ok', true, 'failed', true);
  end if;

  v_grade := case
    when v_roll < 78   then 6
    when v_roll < 88   then 7
    when v_roll < 96   then 8
    when v_roll < 99.5 then 9
    else 10
  end;

  v_bonus := case
    when v_grade = 10 then 50000
    when v_grade = 9 then 30000
    when v_grade = 8 then 10000
    when v_grade in (6, 7) then 3000
    else 0
  end;

  insert into psa_gradings (user_id, card_id, grade, rarity)
    values (p_user_id, p_card_id, v_grade, p_rarity);

  if v_bonus > 0 then
    update users set points = points + v_bonus
      where id = p_user_id
      returning points into v_new_points;
  else
    select points into v_new_points from users where id = p_user_id;
  end if;

  return json_build_object('ok', true,
    'grade', v_grade,
    'bonus', v_bonus,
    'points', v_new_points);
end;
$$;

-- ----------------------------------------------------------------
-- bulk_submit_psa_grading — now accepts a parallel rarity[] array
-- ----------------------------------------------------------------
create or replace function bulk_submit_psa_grading(
  p_user_id uuid,
  p_card_ids text[],
  p_rarities text[] default null
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_card_id text;
  v_rarity text;
  v_idx int := 0;
  v_count int;
  v_grade int;
  v_roll numeric;
  v_bonus int;
  v_total_bonus int := 0;
  v_success int := 0;
  v_fail int := 0;
  v_skipped int := 0;
  v_results jsonb := '[]'::jsonb;
  v_new_points int;
begin
  if p_card_ids is null or array_length(p_card_ids, 1) is null then
    return json_build_object('ok', false, 'error', '감정할 카드가 없어요.');
  end if;

  foreach v_card_id in array p_card_ids loop
    v_idx := v_idx + 1;
    v_rarity := case
      when p_rarities is null then null
      when array_length(p_rarities, 1) >= v_idx then p_rarities[v_idx]
      else null
    end;

    select count into v_count from card_ownership
      where user_id = p_user_id and card_id = v_card_id for update;
    if not found or coalesce(v_count, 0) < 1 then
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_object(
        'card_id', v_card_id,
        'ok', false,
        'error', 'not_owned'
      );
      continue;
    end if;

    update card_ownership set count = count - 1, last_pulled_at = now()
      where user_id = p_user_id and card_id = v_card_id;
    delete from card_ownership
      where user_id = p_user_id and card_id = v_card_id and count = 0;

    v_roll := random() * 100;

    if v_roll < 70 then
      v_fail := v_fail + 1;
      v_results := v_results || jsonb_build_object(
        'card_id', v_card_id,
        'ok', true,
        'failed', true
      );
      continue;
    end if;

    v_grade := case
      when v_roll < 78   then 6
      when v_roll < 88   then 7
      when v_roll < 96   then 8
      when v_roll < 99.5 then 9
      else 10
    end;

    v_bonus := case
      when v_grade = 10 then 50000
      when v_grade = 9 then 30000
      when v_grade = 8 then 10000
      when v_grade in (6, 7) then 3000
      else 0
    end;

    insert into psa_gradings (user_id, card_id, grade, rarity)
      values (p_user_id, v_card_id, v_grade, v_rarity);

    v_total_bonus := v_total_bonus + v_bonus;
    v_success := v_success + 1;

    v_results := v_results || jsonb_build_object(
      'card_id', v_card_id,
      'ok', true,
      'failed', false,
      'grade', v_grade,
      'bonus', v_bonus
    );
  end loop;

  if v_total_bonus > 0 then
    update users set points = points + v_total_bonus
      where id = p_user_id
      returning points into v_new_points;
  else
    select points into v_new_points from users where id = p_user_id;
  end if;

  return json_build_object(
    'ok', true,
    'results', v_results,
    'success_count', v_success,
    'fail_count', v_fail,
    'skipped_count', v_skipped,
    'bonus', v_total_bonus,
    'points', v_new_points
  );
end;
$$;

-- ----------------------------------------------------------------
-- claim_showcase_income — new hourly formula
-- ----------------------------------------------------------------
create or replace function claim_showcase_income(p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_earned bigint := 0;
  v_new_points int;
  v_card_count int := 0;
begin
  select
    coalesce(sum(
      floor(extract(epoch from (now() - c.income_claimed_at)) / 3600)
      * (rarity_hourly_base(g.rarity) + pcl_hourly_bonus(g.grade))
    ), 0),
    count(*)
  into v_earned, v_card_count
  from showcase_cards c
  join user_showcases s on s.id = c.showcase_id
  join psa_gradings g on g.id = c.grading_id
  where s.user_id = p_user_id;

  if v_earned > 0 then
    update showcase_cards c
      set income_claimed_at = c.income_claimed_at
        + (floor(extract(epoch from (now() - c.income_claimed_at)) / 3600) || ' hours')::interval
      from user_showcases s
      where c.showcase_id = s.id
        and s.user_id = p_user_id
        and extract(epoch from (now() - c.income_claimed_at)) >= 3600;

    update users set points = points + v_earned::int
      where id = p_user_id
      returning points into v_new_points;
  else
    select points into v_new_points from users where id = p_user_id;
  end if;

  return json_build_object('ok', true,
    'earned', v_earned::int,
    'card_count', v_card_count,
    'points', v_new_points);
end;
$$;

grant execute on function rarity_hourly_base(text) to anon, authenticated;
grant execute on function pcl_hourly_bonus(int) to anon, authenticated;
grant execute on function submit_psa_grading(uuid, text, text) to anon, authenticated;
grant execute on function bulk_submit_psa_grading(uuid, text[], text[]) to anon, authenticated;
grant execute on function claim_showcase_income(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
