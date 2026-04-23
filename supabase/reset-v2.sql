-- ============================================================
-- v2 reset: clear gameplay data, raise signup bonus to 200k,
-- add buy_box RPC (points charged per box).
-- Safe to re-run.
-- ============================================================

-- Raise signup starter bonus
alter table users alter column points set default 200000;

-- Wipe gameplay state (keeps users, resets points)
truncate pulls, pack_opens, card_ownership, gifts, psa_gradings, merchant_state
  restart identity cascade;

-- Reseed users table: keep accounts, refund points to 200k
update users set points = 200000;

-- Reseed hun / min in case they were deleted earlier
insert into users (user_id, password_hash, age, points)
values
  ('hun', crypt('hun94!@#', gen_salt('bf')), 30, 200000),
  ('min', crypt('min94!@#', gen_salt('bf')), 30, 200000)
on conflict (user_id) do update
  set password_hash = excluded.password_hash,
      points = 200000;

-- ------------------------------------------------------------
-- RPC: buy_box
-- Deducts points before the client begins the box-opening flow.
-- Returns ok=false if the user can't afford it; the client must
-- gate the UI on success.
-- ------------------------------------------------------------
create or replace function buy_box(
  p_user_id uuid,
  p_set_code text
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_price int;
  v_points int;
begin
  v_price := case p_set_code
    when 'm2a' then 50000
    when 'm2'  then 40000
    when 'sv8' then 30000
    when 'sv2a' then 35000
    when 'sv8a' then 40000
    when 'sv5a' then 30000
    else 30000
  end;

  select points into v_points from users where id = p_user_id for update;
  if coalesce(v_points, 0) < v_price then
    return json_build_object(
      'ok', false,
      'error', format('포인트가 부족해요. 박스 가격: %s p, 현재: %s p',
                      v_price, coalesce(v_points, 0)),
      'price', v_price,
      'points', coalesce(v_points, 0)
    );
  end if;

  update users set points = points - v_price where id = p_user_id;
  return json_build_object('ok', true,
    'price', v_price,
    'points', v_points - v_price);
end;
$$;

grant execute on function buy_box(uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
