-- ============================================================
-- Merchant + points + gift-escrow migration
-- Idempotent: safe to re-run.
-- ============================================================

-- 1) Points column on users ---------------------------------
alter table users add column if not exists points int not null default 500;

-- 2) Merchant state per user --------------------------------
create table if not exists merchant_state (
  user_id uuid primary key references users(id) on delete cascade,
  current_card_id text,
  current_card_price int not null default 0,
  refreshes_remaining int not null default 5 check (refreshes_remaining between 0 and 5),
  next_refresh_at timestamptz not null default (now() + interval '1 hour'),
  updated_at timestamptz not null default now()
);

-- 3) Gifts: escrow flow --------------------------------------
alter table gifts add column if not exists status text not null default 'pending'
  check (status in ('pending', 'accepted', 'expired', 'declined'));
alter table gifts add column if not exists price_points int not null default 0 check (price_points >= 0);
alter table gifts add column if not exists expires_at timestamptz not null default (now() + interval '24 hours');
alter table gifts add column if not exists accepted_at timestamptz;
alter table gifts add column if not exists settled_at timestamptz;

create index if not exists gifts_pending_expiry_idx
  on gifts(expires_at) where status = 'pending';

-- Backfill: any pre-existing gifts were under the old "immediate transfer"
-- flow. Mark them as accepted so they don't get swept by the expirer.
update gifts
   set status = 'accepted',
       accepted_at = coalesce(accepted_at, created_at),
       settled_at = coalesce(settled_at, created_at)
 where status = 'pending'
   and created_at < now() - interval '1 minute';

-- ------------------------------------------------------------
-- Helper: recharge merchant refresh credits
-- ------------------------------------------------------------
create or replace function _merchant_recharge(p_state merchant_state)
returns merchant_state
language plpgsql
as $$
declare
  v_state merchant_state := p_state;
begin
  while v_state.refreshes_remaining < 5 and v_state.next_refresh_at <= now() loop
    v_state.refreshes_remaining := v_state.refreshes_remaining + 1;
    v_state.next_refresh_at := v_state.next_refresh_at + interval '1 hour';
  end loop;
  if v_state.refreshes_remaining >= 5 and v_state.next_refresh_at <= now() then
    v_state.next_refresh_at := now() + interval '1 hour';
  end if;
  return v_state;
end;
$$;

-- ------------------------------------------------------------
-- RPC: get_merchant_state
-- Returns current offer + refresh counter (recharged lazily).
-- ------------------------------------------------------------
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
  update merchant_state
     set refreshes_remaining = v_state.refreshes_remaining,
         next_refresh_at = v_state.next_refresh_at,
         updated_at = now()
   where user_id = p_user_id;
  return json_build_object(
    'card_id', v_state.current_card_id,
    'price', v_state.current_card_price,
    'refreshes_remaining', v_state.refreshes_remaining,
    'next_refresh_at', v_state.next_refresh_at
  );
end;
$$;

-- ------------------------------------------------------------
-- RPC: refresh_merchant
-- If no current offer, sets one for free. Otherwise consumes
-- 1 refresh charge and replaces the offer.
-- Client sends a card_id picked uniformly at random from its
-- catalog plus the expected sell price.
-- ------------------------------------------------------------
create or replace function refresh_merchant(
  p_user_id uuid,
  p_new_card_id text,
  p_price int
) returns json
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

  if v_state.current_card_id is not null then
    if v_state.refreshes_remaining <= 0 then
      update merchant_state
         set refreshes_remaining = v_state.refreshes_remaining,
             next_refresh_at = v_state.next_refresh_at,
             updated_at = now()
       where user_id = p_user_id;
      return json_build_object('ok', false,
        'error', '새로고침 기회가 없습니다. 1시간 뒤 충전돼요.',
        'refreshes_remaining', v_state.refreshes_remaining,
        'next_refresh_at', v_state.next_refresh_at);
    end if;
    if v_state.refreshes_remaining = 5 then
      v_state.next_refresh_at := now() + interval '1 hour';
    end if;
    v_state.refreshes_remaining := v_state.refreshes_remaining - 1;
  end if;

  update merchant_state
     set current_card_id = p_new_card_id,
         current_card_price = coalesce(p_price, 0),
         refreshes_remaining = v_state.refreshes_remaining,
         next_refresh_at = v_state.next_refresh_at,
         updated_at = now()
   where user_id = p_user_id;

  return json_build_object('ok', true,
    'card_id', p_new_card_id,
    'price', coalesce(p_price, 0),
    'refreshes_remaining', v_state.refreshes_remaining,
    'next_refresh_at', v_state.next_refresh_at);
end;
$$;

-- ------------------------------------------------------------
-- RPC: sell_to_merchant
-- Validates the card matches the merchant's current offer,
-- decrements ownership, credits points, clears the offer.
-- ------------------------------------------------------------
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
    return json_build_object('ok', false, 'error', '상인이 원하는 카드가 없습니다.');
  end if;
  if v_state.current_card_id <> p_card_id then
    return json_build_object('ok', false, 'error', '상인이 원하는 카드가 아닙니다.');
  end if;

  select count into v_count from card_ownership
    where user_id = p_user_id and card_id = p_card_id;
  if not found or coalesce(v_count, 0) < 1 then
    return json_build_object('ok', false, 'error', '이 카드를 보유하고 있지 않습니다.');
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
         updated_at = now()
   where user_id = p_user_id;

  return json_build_object('ok', true, 'earned', v_earned, 'points', v_new_points);
end;
$$;

-- ------------------------------------------------------------
-- RPC: create_gift (replaces gift_card)
-- Decrements sender's card (escrow), creates pending gift
-- with price and 24h expiry.
-- ------------------------------------------------------------
create or replace function create_gift(
  p_from_id uuid,
  p_to_user_id text,
  p_card_id text,
  p_price_points int
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_to_id uuid;
  v_count int;
  v_gift_id uuid;
  v_clean text := lower(trim(p_to_user_id));
begin
  if coalesce(p_price_points, 0) < 0 then
    return json_build_object('ok', false, 'error', '가격은 0 이상이어야 합니다.');
  end if;
  select id into v_to_id from users where user_id = v_clean;
  if not found then
    return json_build_object('ok', false, 'error', '받는 사용자를 찾을 수 없습니다.');
  end if;
  if v_to_id = p_from_id then
    return json_build_object('ok', false, 'error', '본인에게는 선물할 수 없습니다.');
  end if;

  select count into v_count from card_ownership
    where user_id = p_from_id and card_id = p_card_id;
  if not found or coalesce(v_count, 0) < 1 then
    return json_build_object('ok', false, 'error', '선물할 카드가 없습니다.');
  end if;

  update card_ownership set count = count - 1, last_pulled_at = now()
    where user_id = p_from_id and card_id = p_card_id;
  delete from card_ownership
    where user_id = p_from_id and card_id = p_card_id and count = 0;

  insert into gifts (from_user_id, to_user_id, card_id, status, price_points, expires_at)
    values (p_from_id, v_to_id, p_card_id, 'pending', coalesce(p_price_points, 0), now() + interval '24 hours')
    returning id into v_gift_id;

  return json_build_object('ok', true, 'gift_id', v_gift_id);
end;
$$;

-- ------------------------------------------------------------
-- RPC: accept_gift
-- Recipient pays price, receives card, sender gets points.
-- ------------------------------------------------------------
create or replace function accept_gift(p_gift_id uuid, p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_gift gifts%rowtype;
  v_points int;
begin
  select * into v_gift from gifts where id = p_gift_id for update;
  if not found then
    return json_build_object('ok', false, 'error', '선물을 찾을 수 없습니다.');
  end if;
  if v_gift.to_user_id <> p_user_id then
    return json_build_object('ok', false, 'error', '받을 권한이 없습니다.');
  end if;
  if v_gift.status <> 'pending' then
    return json_build_object('ok', false, 'error', '이미 처리된 선물입니다.');
  end if;
  if v_gift.expires_at <= now() then
    -- Auto-expire + refund sender
    insert into card_ownership (user_id, card_id, count)
      values (v_gift.from_user_id, v_gift.card_id, 1)
      on conflict (user_id, card_id)
      do update set count = card_ownership.count + 1, last_pulled_at = now();
    update gifts set status = 'expired', settled_at = now() where id = p_gift_id;
    return json_build_object('ok', false, 'error', '만료된 선물입니다.');
  end if;

  select points into v_points from users where id = p_user_id for update;
  if coalesce(v_points, 0) < v_gift.price_points then
    return json_build_object('ok', false, 'error', '포인트가 부족합니다.');
  end if;

  if v_gift.price_points > 0 then
    update users set points = points - v_gift.price_points where id = p_user_id;
    update users set points = points + v_gift.price_points where id = v_gift.from_user_id;
  end if;

  insert into card_ownership (user_id, card_id, count)
    values (p_user_id, v_gift.card_id, 1)
    on conflict (user_id, card_id)
    do update set count = card_ownership.count + 1, last_pulled_at = now();

  update gifts set status = 'accepted', accepted_at = now(), settled_at = now() where id = p_gift_id;

  return json_build_object('ok', true);
end;
$$;

-- ------------------------------------------------------------
-- RPC: decline_gift (recipient rejects, sender refunded)
-- ------------------------------------------------------------
create or replace function decline_gift(p_gift_id uuid, p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_gift gifts%rowtype;
begin
  select * into v_gift from gifts where id = p_gift_id for update;
  if not found then
    return json_build_object('ok', false, 'error', '선물을 찾을 수 없습니다.');
  end if;
  if v_gift.to_user_id <> p_user_id then
    return json_build_object('ok', false, 'error', '권한이 없습니다.');
  end if;
  if v_gift.status <> 'pending' then
    return json_build_object('ok', false, 'error', '이미 처리된 선물입니다.');
  end if;

  insert into card_ownership (user_id, card_id, count)
    values (v_gift.from_user_id, v_gift.card_id, 1)
    on conflict (user_id, card_id)
    do update set count = card_ownership.count + 1, last_pulled_at = now();

  update gifts set status = 'declined', settled_at = now() where id = p_gift_id;

  return json_build_object('ok', true);
end;
$$;

-- ------------------------------------------------------------
-- RPC: expire_pending_gifts
-- Sweeps gifts past expires_at back to senders.
-- Call from client whenever viewing gifts.
-- ------------------------------------------------------------
create or replace function expire_pending_gifts()
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_count int := 0;
  v_gift gifts%rowtype;
begin
  for v_gift in
    select * from gifts where status = 'pending' and expires_at <= now() for update
  loop
    insert into card_ownership (user_id, card_id, count)
      values (v_gift.from_user_id, v_gift.card_id, 1)
      on conflict (user_id, card_id)
      do update set count = card_ownership.count + 1, last_pulled_at = now();
    update gifts set status = 'expired', settled_at = now() where id = v_gift.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ------------------------------------------------------------
-- Drop the old monolithic gift_card (superseded by create_gift)
-- Keep the function so older clients don't crash; alias to new flow.
-- ------------------------------------------------------------
create or replace function gift_card(
  p_from_id uuid,
  p_to_user_id text,
  p_card_id text
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return create_gift(p_from_id, p_to_user_id, p_card_id, 0);
end;
$$;

-- ------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------
grant execute on function get_merchant_state(uuid) to anon, authenticated;
grant execute on function refresh_merchant(uuid, text, int) to anon, authenticated;
grant execute on function sell_to_merchant(uuid, text) to anon, authenticated;
grant execute on function create_gift(uuid, text, text, int) to anon, authenticated;
grant execute on function accept_gift(uuid, uuid) to anon, authenticated;
grant execute on function decline_gift(uuid, uuid) to anon, authenticated;
grant execute on function expire_pending_gifts() to anon, authenticated;
grant select on merchant_state to anon, authenticated;

notify pgrst, 'reload schema';
