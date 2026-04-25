create or replace function claim_showcase_income(p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_earned bigint := 0;
  v_earned_rank bigint := 0;
  v_new_points int;
  v_card_count int := 0;
  v_min_age numeric := 0;
begin
  select
    count(*),
    coalesce(extract(epoch from min(now() - c.income_claimed_at)), 0)
    into v_card_count, v_min_age
  from showcase_cards c
  join user_showcases s on s.id = c.showcase_id
  where s.user_id = p_user_id;

  if v_card_count = 0 or v_min_age < 3600 then
    select points into v_new_points from users where id = p_user_id;
    return json_build_object(
      'ok', true,
      'earned', 0,
      'earned_rank', 0,
      'card_count', v_card_count,
      'points', v_new_points,
      'next_claim_in_seconds', greatest(0, 3600 - v_min_age)::int
    );
  end if;

  select
    coalesce(sum(
      slab_income_trade(g.rarity, g.grade)
      * floor(extract(epoch from (now() - c.income_claimed_at)) / 3600)
    ), 0),
    coalesce(sum(
      slab_income_rank(g.rarity, g.grade)
      * floor(extract(epoch from (now() - c.income_claimed_at)) / 3600)
    ), 0)
  into v_earned, v_earned_rank
  from showcase_cards c
  join user_showcases s on s.id = c.showcase_id
  join psa_gradings g on g.id = c.grading_id
  where s.user_id = p_user_id;

  update showcase_cards c
    set income_claimed_at = c.income_claimed_at
      + (floor(extract(epoch from (now() - c.income_claimed_at)) / 3600)
         || ' hours')::interval
    from user_showcases s
    where c.showcase_id = s.id
      and s.user_id = p_user_id
      and extract(epoch from (now() - c.income_claimed_at)) >= 3600;

  if v_earned > 0 or v_earned_rank > 0 then
    update users
      set points = points + v_earned::int,
          showcase_rank_pts = showcase_rank_pts + v_earned_rank::int
      where id = p_user_id
      returning points into v_new_points;
  else
    select points into v_new_points from users where id = p_user_id;
  end if;

  return json_build_object(
    'ok', true,
    'earned', v_earned::int,
    'earned_rank', v_earned_rank::int,
    'card_count', v_card_count,
    'points', v_new_points
  );
end;
$$;

grant execute on function claim_showcase_income(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
