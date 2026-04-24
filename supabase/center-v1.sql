-- ============================================================
-- CENTER v1 — "내 포켓몬센터" (Animal-Crossing-style museum)
--
-- Grid-based display room. Users buy 보관함 (showcases), place them
-- on a grid, and display owned cards inside. A displayed card is
-- moved out of card_ownership and into showcase_cards so it can't
-- be sold, gifted, or graded ("박제" — stuffed / preserved).
-- Cards return to card_ownership when removed from a showcase or
-- when the whole showcase is dismantled.
-- ============================================================

create table if not exists user_showcases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  showcase_type text not null,
  slot_x int not null check (slot_x >= 0 and slot_x < 8),
  slot_y int not null check (slot_y >= 0 and slot_y < 12),
  created_at timestamptz not null default now(),
  unique (user_id, slot_x, slot_y)
);
create index if not exists user_showcases_user_idx on user_showcases(user_id);

create table if not exists showcase_cards (
  id uuid primary key default gen_random_uuid(),
  showcase_id uuid not null references user_showcases(id) on delete cascade,
  slot_index int not null check (slot_index >= 0 and slot_index < 10),
  card_id text not null,
  created_at timestamptz not null default now(),
  unique (showcase_id, slot_index)
);
create index if not exists showcase_cards_showcase_idx on showcase_cards(showcase_id);

-- Lock direct table access; all traffic goes through SECURITY DEFINER RPCs.
alter table user_showcases enable row level security;
alter table showcase_cards enable row level security;

-- Catalog helpers. Kept in SQL so the server is authoritative on price
-- and capacity — clients can't spoof 10만p → 3만p purchases.
create or replace function showcase_price(p_type text) returns int
language sql immutable as $$
  select case p_type
    when 'basic'     then 30000
    when 'glass'     then 100000
    when 'premium'   then 300000
    when 'legendary' then 1000000
    else null
  end
$$;

create or replace function showcase_capacity(p_type text) returns int
language sql immutable as $$
  select case p_type
    when 'basic'     then 1
    when 'glass'     then 3
    when 'premium'   then 4
    when 'legendary' then 5
    else null
  end
$$;

-- ------------------------------------------------------------
-- buy_showcase
-- ------------------------------------------------------------
create or replace function buy_showcase(
  p_user_id uuid,
  p_type text,
  p_slot_x int,
  p_slot_y int
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_price int;
  v_points int;
  v_new_id uuid;
  v_new_points int;
begin
  v_price := showcase_price(p_type);
  if v_price is null then
    return json_build_object('ok', false, 'error', '존재하지 않는 보관함 종류예요.');
  end if;

  if exists(select 1 from user_showcases
            where user_id = p_user_id
              and slot_x = p_slot_x
              and slot_y = p_slot_y) then
    return json_build_object('ok', false, 'error', '이미 보관함이 놓여있는 자리예요.');
  end if;

  select points into v_points from users where id = p_user_id for update;
  if v_points is null then
    return json_build_object('ok', false, 'error', '사용자를 찾을 수 없어요.');
  end if;
  if v_points < v_price then
    return json_build_object('ok', false, 'error', '포인트가 부족해요.');
  end if;

  update users set points = points - v_price
    where id = p_user_id
    returning points into v_new_points;

  insert into user_showcases (user_id, showcase_type, slot_x, slot_y)
    values (p_user_id, p_type, p_slot_x, p_slot_y)
    returning id into v_new_id;

  return json_build_object('ok', true,
    'showcase_id', v_new_id,
    'price', v_price,
    'points', v_new_points);
end;
$$;

-- ------------------------------------------------------------
-- display_card — wallet → showcase slot (박제)
-- ------------------------------------------------------------
create or replace function display_card(
  p_user_id uuid,
  p_showcase_id uuid,
  p_slot_index int,
  p_card_id text
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_showcase record;
  v_capacity int;
  v_owned int;
begin
  select * into v_showcase from user_showcases
    where id = p_showcase_id and user_id = p_user_id
    for update;
  if not found then
    return json_build_object('ok', false, 'error', '보관함을 찾을 수 없어요.');
  end if;

  v_capacity := showcase_capacity(v_showcase.showcase_type);
  if p_slot_index < 0 or p_slot_index >= v_capacity then
    return json_build_object('ok', false, 'error', '슬롯 번호가 올바르지 않아요.');
  end if;

  if exists(select 1 from showcase_cards
            where showcase_id = p_showcase_id and slot_index = p_slot_index) then
    return json_build_object('ok', false, 'error', '이미 전시 중인 슬롯이에요.');
  end if;

  select count into v_owned from card_ownership
    where user_id = p_user_id and card_id = p_card_id for update;
  if not found or coalesce(v_owned, 0) < 1 then
    return json_build_object('ok', false, 'error', '보유하지 않은 카드예요.');
  end if;

  update card_ownership set count = count - 1
    where user_id = p_user_id and card_id = p_card_id;
  delete from card_ownership
    where user_id = p_user_id and card_id = p_card_id and count = 0;

  insert into showcase_cards (showcase_id, slot_index, card_id)
    values (p_showcase_id, p_slot_index, p_card_id);

  return json_build_object('ok', true);
end;
$$;

-- ------------------------------------------------------------
-- undisplay_card — showcase slot → wallet
-- ------------------------------------------------------------
create or replace function undisplay_card(
  p_user_id uuid,
  p_showcase_id uuid,
  p_slot_index int
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_card_id text;
begin
  if not exists(select 1 from user_showcases
                where id = p_showcase_id and user_id = p_user_id) then
    return json_build_object('ok', false, 'error', '보관함을 찾을 수 없어요.');
  end if;

  delete from showcase_cards
    where showcase_id = p_showcase_id and slot_index = p_slot_index
    returning card_id into v_card_id;
  if v_card_id is null then
    return json_build_object('ok', false, 'error', '전시 중인 카드가 없어요.');
  end if;

  insert into card_ownership (user_id, card_id, count, last_pulled_at)
    values (p_user_id, v_card_id, 1, now())
    on conflict (user_id, card_id)
    do update set count = card_ownership.count + 1,
                  last_pulled_at = now();

  return json_build_object('ok', true);
end;
$$;

-- ------------------------------------------------------------
-- remove_showcase — returns every displayed card to the wallet
-- then deletes the showcase. No refund on purchase price.
-- ------------------------------------------------------------
create or replace function remove_showcase(
  p_user_id uuid,
  p_showcase_id uuid
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row record;
begin
  if not exists(select 1 from user_showcases
                where id = p_showcase_id and user_id = p_user_id) then
    return json_build_object('ok', false, 'error', '보관함을 찾을 수 없어요.');
  end if;

  for v_row in
    select card_id from showcase_cards where showcase_id = p_showcase_id
  loop
    insert into card_ownership (user_id, card_id, count, last_pulled_at)
      values (p_user_id, v_row.card_id, 1, now())
      on conflict (user_id, card_id)
      do update set count = card_ownership.count + 1,
                    last_pulled_at = now();
  end loop;

  delete from user_showcases
    where id = p_showcase_id and user_id = p_user_id;

  return json_build_object('ok', true);
end;
$$;

-- ------------------------------------------------------------
-- get_user_center — one-call snapshot for the UI
-- ------------------------------------------------------------
create or replace function get_user_center(p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_result json;
begin
  select coalesce(json_agg(
    json_build_object(
      'id', s.id,
      'showcase_type', s.showcase_type,
      'slot_x', s.slot_x,
      'slot_y', s.slot_y,
      'cards', coalesce((
        select json_agg(json_build_object(
          'slot_index', c.slot_index,
          'card_id', c.card_id
        ) order by c.slot_index)
        from showcase_cards c where c.showcase_id = s.id
      ), '[]'::json)
    ) order by s.created_at
  ), '[]'::json)
  into v_result
  from user_showcases s
  where s.user_id = p_user_id;

  return v_result;
end;
$$;

grant execute on function buy_showcase(uuid, text, int, int) to anon, authenticated;
grant execute on function display_card(uuid, uuid, int, text) to anon, authenticated;
grant execute on function undisplay_card(uuid, uuid, int) to anon, authenticated;
grant execute on function remove_showcase(uuid, uuid) to anon, authenticated;
grant execute on function get_user_center(uuid) to anon, authenticated;
grant execute on function showcase_price(text) to anon, authenticated;
grant execute on function showcase_capacity(text) to anon, authenticated;

notify pgrst, 'reload schema';
