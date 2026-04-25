-- ============================================================
-- Box auto-sell — drop sub-AR cards straight into points.
--
-- The /set box-opening UI gets an "AR 미만 자동 판매" toggle.
-- When enabled, cards below the AR tier (i.e. C / U / R / RR)
-- never enter the wallet — the server skips card_ownership for
-- them and credits points using bulk_sell_price() instead. They
-- still appear in `pulls` history so /history isn't lying about
-- what was drawn.
--
-- New RPC `record_pack_pull_v4` accepts the rarity array per
-- card so the server can authoritatively decide what to keep
-- vs. sell. Keeps the existing `record_pack_pull` (v3) function
-- alive in case anything still calls it.
-- ============================================================

create or replace function bulk_sell_price(p_rarity text) returns int
language sql immutable as $$
  select case p_rarity
    when 'C'   then 25
    when 'U'   then 50
    when 'R'   then 100
    when 'RR'  then 200
    when 'AR'  then 500
    when 'SR'  then 1000
    when 'MA'  then 1000
    when 'SAR' then 3000
    when 'UR'  then 5000
    when 'MUR' then 10000
    else 0
  end
$$;

-- Cards below the AR tier (C / U / R / RR). Used to decide which
-- pulls auto-sell instead of entering card_ownership.
create or replace function is_sub_ar(p_rarity text) returns boolean
language sql immutable as $$
  select p_rarity in ('C', 'U', 'R', 'RR')
$$;

create or replace function record_pack_pull_v4(
  p_user_id uuid,
  p_set_code text,
  p_card_ids text[],
  p_rarities text[],
  p_auto_sell_sub_ar boolean
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pack_id uuid;
  v_current int;
  v_kept_count int := 0;
  v_sold_count int := 0;
  v_sold_payout int := 0;
  v_new_points int;
  v_total int;
  v_idx int;
  v_kept_ids text[] := array[]::text[];
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  v_total := coalesce(array_length(p_card_ids, 1), 0);
  if v_total = 0 then
    return json_build_object('ok', false, 'error', '카드가 없어요.');
  end if;
  if p_rarities is null or coalesce(array_length(p_rarities, 1), 0) <> v_total then
    return json_build_object('ok', false, 'error', '레어도 정보가 일치하지 않아요.');
  end if;

  -- Partition keeps vs. sold based on rarity + flag.
  for v_idx in 1..v_total loop
    if p_auto_sell_sub_ar and is_sub_ar(p_rarities[v_idx]) then
      v_sold_count := v_sold_count + 1;
      v_sold_payout := v_sold_payout + bulk_sell_price(p_rarities[v_idx]);
    else
      v_kept_ids := v_kept_ids || p_card_ids[v_idx];
      v_kept_count := v_kept_count + 1;
    end if;
  end loop;

  -- Cap check is against the kept count only — auto-sold cards
  -- never enter card_ownership, so they don't count toward 10,000.
  select coalesce(sum(count), 0)::int
    into v_current
    from card_ownership
   where user_id = p_user_id;

  if v_current + v_kept_count > 10000 then
    raise exception
      '지갑 보유 한도 초과 — 현재 %장 / 10,000장. 팔거나 감별/전시로 정리한 뒤 다시 시도하세요.',
      v_current
      using errcode = 'P0001';
  end if;

  insert into pack_opens (user_id, set_code)
    values (p_user_id, p_set_code)
    returning id into v_pack_id;

  insert into pulls (user_id, card_id, set_code, pack_open_id)
  select p_user_id, c, p_set_code, v_pack_id
    from unnest(p_card_ids) as c;

  if v_kept_count > 0 then
    insert into card_ownership (user_id, card_id, count, last_pulled_at)
    select p_user_id, c, count(*)::int, now()
      from unnest(v_kept_ids) as c
     group by c
    on conflict (user_id, card_id) do update
      set count = card_ownership.count + excluded.count,
          last_pulled_at = now();
  end if;

  if v_sold_payout > 0 then
    update users set points = points + v_sold_payout
      where id = p_user_id
      returning points into v_new_points;
  else
    select points into v_new_points from users where id = p_user_id;
  end if;

  return json_build_object('ok', true,
    'pack_open_id', v_pack_id,
    'sold_count', v_sold_count,
    'sold_earned', v_sold_payout,
    'kept_count', v_kept_count,
    'points', v_new_points);
end;
$$;

grant execute on function bulk_sell_price(text) to anon, authenticated;
grant execute on function is_sub_ar(text) to anon, authenticated;
grant execute on function record_pack_pull_v4(uuid, text, text[], text[], boolean) to anon, authenticated;

notify pgrst, 'reload schema';
