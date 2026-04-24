-- ============================================================
-- Merchant v2: 5-sells-per-rolling-hour throttle.
-- Adds sells_this_hour / sells_hour_start tracking to
-- merchant_state and enforces the cap inside sell_to_merchant.
-- ============================================================

alter table merchant_state add column if not exists sells_this_hour int not null default 0;
alter table merchant_state add column if not exists sells_hour_start timestamptz not null default now();

-- Return an enriched state incl. sells window so the client can show
-- "3/5 sold this hour".
create or replace function get_merchant_state(p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_state merchant_state%rowtype;
begin
  insert into merchant_state (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select * into v_state from merchant_state where user_id = p_user_id for update;
  v_state := _merchant_recharge(v_state);
  -- Reset the sell window if more than 1h passed
  if v_state.sells_hour_start <= now() - interval '1 hour' then
    v_state.sells_this_hour := 0;
    v_state.sells_hour_start := now();
  end if;
  update merchant_state
     set refreshes_remaining = v_state.refreshes_remaining,
         next_refresh_at = v_state.next_refresh_at,
         sells_this_hour = v_state.sells_this_hour,
         sells_hour_start = v_state.sells_hour_start,
         updated_at = now()
   where user_id = p_user_id;
  return json_build_object(
    'card_id', v_state.current_card_id,
    'price', v_state.current_card_price,
    'refreshes_remaining', v_state.refreshes_remaining,
    'next_refresh_at', v_state.next_refresh_at,
    'sells_this_hour', v_state.sells_this_hour,
    'sells_limit', 5,
    'sells_hour_start', v_state.sells_hour_start
  );
end;
$$;

create or replace function sell_to_merchant(p_user_id uuid, p_card_id text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_state merchant_state%rowtype;
  v_count int;
  v_new_points int;
  v_earned int;
begin
  select * into v_state from merchant_state where user_id = p_user_id for update;
  if not found or v_state.current_card_id is null then
    return json_build_object('ok', false, 'error', '상인이 원하는 카드가 없어요.');
  end if;
  if v_state.current_card_id <> p_card_id then
    return json_build_object('ok', false, 'error', '상인이 원하는 카드가 아니에요.');
  end if;

  -- Rolling-hour throttle
  if v_state.sells_hour_start <= now() - interval '1 hour' then
    v_state.sells_this_hour := 0;
    v_state.sells_hour_start := now();
  end if;
  if v_state.sells_this_hour >= 5 then
    update merchant_state
       set sells_this_hour = v_state.sells_this_hour,
           sells_hour_start = v_state.sells_hour_start,
           updated_at = now()
     where user_id = p_user_id;
    return json_build_object('ok', false,
      'error', '1시간 판매 한도(5회)에 도달했어요. 잠시 후 다시 오세요.',
      'sells_this_hour', v_state.sells_this_hour,
      'sells_hour_start', v_state.sells_hour_start);
  end if;

  select count into v_count from card_ownership
    where user_id = p_user_id and card_id = p_card_id;
  if not found or coalesce(v_count, 0) < 1 then
    return json_build_object('ok', false, 'error', '이 카드를 보유하고 있지 않아요.');
  end if;

  update card_ownership set count = count - 1, last_pulled_at = now()
    where user_id = p_user_id and card_id = p_card_id;
  delete from card_ownership
    where user_id = p_user_id and card_id = p_card_id and count = 0;

  v_earned := v_state.current_card_price;
  update users set points = points + v_earned
    where id = p_user_id
    returning points into v_new_points;

  update merchant_state
     set current_card_id = null,
         current_card_price = 0,
         sells_this_hour = v_state.sells_this_hour + 1,
         sells_hour_start = v_state.sells_hour_start,
         updated_at = now()
   where user_id = p_user_id;

  return json_build_object('ok', true,
    'earned', v_earned,
    'points', v_new_points,
    'sells_this_hour', v_state.sells_this_hour + 1,
    'sells_hour_start', v_state.sells_hour_start);
end;
$$;

grant execute on function get_merchant_state(uuid) to anon, authenticated;
grant execute on function sell_to_merchant(uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
