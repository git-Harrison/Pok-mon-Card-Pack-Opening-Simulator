-- ============================================================
-- PSA v3: success bonuses + rank score aggregation
-- Per-grade wallet bonus + rank points:
--   10:  1000 rank points · +50,000 wallet
--    9:   500 rank points · +30,000 wallet
--    8:   200 rank points · +10,000 wallet
--    7:   100 rank points · + 3,000 wallet
--    6:   100 rank points · + 3,000 wallet
-- ============================================================

create or replace function submit_psa_grading(
  p_user_id uuid,
  p_card_id text
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
    when v_roll < 78 then 6
    when v_roll < 88 then 7
    when v_roll < 96 then 8
    when v_roll < 99 then 9
    else 10
  end;

  v_bonus := case
    when v_grade = 10 then 50000
    when v_grade = 9 then 30000
    when v_grade = 8 then 10000
    when v_grade in (6, 7) then 3000
    else 0
  end;

  insert into psa_gradings (user_id, card_id, grade)
    values (p_user_id, p_card_id, v_grade);

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

-- ------------------------------------------------------------
-- RPC: get_user_rankings
-- Returns users ordered by PSA-based rank score (descending).
-- Rank score is aggregated live from psa_gradings so that every
-- successful grading contributes to the leaderboard.
-- ------------------------------------------------------------
create or replace function get_user_rankings()
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_rows json;
begin
  select coalesce(json_agg(r order by r.rank_score desc, r.points desc), '[]'::json)
    into v_rows
  from (
    select
      u.id,
      u.user_id,
      u.age,
      u.points,
      coalesce(sum(case
        when g.grade = 10 then 1000
        when g.grade = 9 then 500
        when g.grade = 8 then 200
        when g.grade in (6, 7) then 100
        else 0
      end), 0)::int as rank_score,
      coalesce(count(g.id), 0)::int as psa_count,
      coalesce(sum(case when g.grade = 10 then 1 else 0 end), 0)::int as psa_10,
      coalesce(sum(case when g.grade = 9 then 1 else 0 end), 0)::int as psa_9,
      coalesce(sum(case when g.grade = 8 then 1 else 0 end), 0)::int as psa_8
    from users u
    left join psa_gradings g on g.user_id = u.id
    group by u.id
  ) r;

  return v_rows;
end;
$$;

-- ------------------------------------------------------------
-- RPC: bulk_sell_cards
-- Sells a list of owned cards in one shot for the provided unit prices.
-- Items: jsonb array — [{"card_id": string, "count": int, "price": int}]
-- ------------------------------------------------------------
create or replace function bulk_sell_cards(
  p_user_id uuid,
  p_items jsonb
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_item record;
  v_owned int;
  v_total int := 0;
  v_new_points int;
  v_sold int := 0;
begin
  if jsonb_array_length(p_items) = 0 then
    return json_build_object('ok', false, 'error', '판매할 카드가 없습니다.');
  end if;

  -- First pass: validate ownership
  for v_item in
    select * from jsonb_to_recordset(p_items)
      as t(card_id text, "count" int, price int)
  loop
    select count into v_owned from card_ownership
      where user_id = p_user_id and card_id = v_item.card_id
      for update;
    if not found or coalesce(v_owned, 0) < coalesce(v_item."count", 0) then
      return json_build_object('ok', false,
        'error', format('카드 부족: %s', v_item.card_id));
    end if;
    if coalesce(v_item."count", 0) < 1 or coalesce(v_item.price, 0) < 0 then
      return json_build_object('ok', false, 'error', '잘못된 판매 항목입니다.');
    end if;
  end loop;

  -- Second pass: apply
  for v_item in
    select * from jsonb_to_recordset(p_items)
      as t(card_id text, "count" int, price int)
  loop
    update card_ownership set count = count - v_item."count",
           last_pulled_at = now()
      where user_id = p_user_id and card_id = v_item.card_id;
    delete from card_ownership
      where user_id = p_user_id and card_id = v_item.card_id and count = 0;
    v_total := v_total + v_item."count" * v_item.price;
    v_sold := v_sold + v_item."count";
  end loop;

  update users set points = points + v_total
    where id = p_user_id
    returning points into v_new_points;

  return json_build_object('ok', true,
    'sold', v_sold,
    'earned', v_total,
    'points', v_new_points);
end;
$$;

grant execute on function submit_psa_grading(uuid, text) to anon, authenticated;
grant execute on function get_user_rankings() to anon, authenticated;
grant execute on function bulk_sell_cards(uuid, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
