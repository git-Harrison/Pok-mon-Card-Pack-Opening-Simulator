-- ============================================================
-- VAULT showcase + 일괄 전시 RPC
--
-- 통합 보관함 ('vault'): one giant container that holds up to
-- 50 PCL9·10 slabs in a single museum cell. Existing 4 tiers
-- (basic / glass / premium / legendary) keep their behavior.
--
-- Schema:
--   * showcase_cards.slot_index check was originally `< 10`.
--     Drop it so vault can use slot_index 0..49.
--
-- Catalog updates (price/capacity/defense/sabotage cost):
--   vault — price 2,000,000p · capacity 50 · defense 20% ·
--           sabotage 200,000p
--
-- New RPC bulk_display_pcl_slabs(p_user_id, p_showcase_id):
--   Pours every undisplayed PCL9·10 slab the user owns into the
--   target showcase, slot indices 0..(capacity-1). Returns the
--   number actually displayed and how much capacity remains.
--
-- Idempotent: every DDL uses IF EXISTS / OR REPLACE; the
-- check-constraint drop is wrapped in DO/exception.
-- ============================================================

do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'showcase_cards_slot_index_check'
       and conrelid = 'public.showcase_cards'::regclass
  ) then
    alter table showcase_cards
      drop constraint showcase_cards_slot_index_check;
  end if;
end$$;

alter table showcase_cards
  add constraint showcase_cards_slot_index_check
  check (slot_index >= 0 and slot_index < 50);

create or replace function showcase_price(p_type text) returns int
language sql immutable as $$
  select case p_type
    when 'basic'     then    10000
    when 'glass'     then   100000
    when 'premium'   then   300000
    when 'legendary' then  1000000
    when 'vault'     then  2000000
    else null
  end
$$;

create or replace function showcase_capacity(p_type text) returns int
language sql immutable as $$
  select case p_type
    when 'basic'     then  1
    when 'glass'     then  1
    when 'premium'   then  1
    when 'legendary' then  1
    when 'vault'     then 50
    else null
  end
$$;

create or replace function showcase_defense(p_type text) returns numeric
language sql immutable as $$
  select case p_type
    when 'basic'     then 0.03
    when 'glass'     then 0.05
    when 'premium'   then 0.10
    when 'legendary' then 0.15
    when 'vault'     then 0.20
    else 0.00
  end
$$;

create or replace function showcase_sabotage_cost(p_type text) returns int
language sql immutable as $$
  select floor(showcase_price(p_type) * 0.1)::int
$$;

create or replace function bulk_display_pcl_slabs(
  p_user_id uuid,
  p_showcase_id uuid
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_showcase record;
  v_capacity int;
  v_filled int;
  v_room int;
  v_next int;
  v_inserted int := 0;
begin
  if p_user_id is null or p_showcase_id is null then
    return json_build_object('ok', false, 'error', '요청이 올바르지 않아요.');
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  select * into v_showcase from user_showcases
    where id = p_showcase_id and user_id = p_user_id
    for update;
  if not found then
    return json_build_object('ok', false, 'error', '보관함을 찾을 수 없어요.');
  end if;

  v_capacity := showcase_capacity(v_showcase.showcase_type);
  if v_capacity is null then
    return json_build_object('ok', false, 'error', '알 수 없는 보관함이에요.');
  end if;

  select count(*), coalesce(max(slot_index), -1) + 1
    into v_filled, v_next
  from showcase_cards
  where showcase_id = p_showcase_id;

  v_room := v_capacity - v_filled;
  if v_room <= 0 then
    return json_build_object(
      'ok', true,
      'displayed_count', 0,
      'remaining_capacity', 0
    );
  end if;

  with eligible as (
    select g.id
      from psa_gradings g
     where g.user_id = p_user_id
       and g.grade in (9, 10)
       and not exists (
         select 1 from showcase_cards sc where sc.grading_id = g.id
       )
       and not exists (
         select 1 from pokedex_entries pe
          where pe.user_id = p_user_id and pe.card_id = g.card_id
       )
       and not exists (
         select 1 from gifts gf
          where gf.grading_id = g.id
            and gf.status = 'pending'
            and gf.expires_at > now()
       )
     order by g.grade desc, g.graded_at desc
     limit v_room
  ),
  numbered as (
    select id, (row_number() over () - 1)::int + v_next as slot_idx
      from eligible
  ),
  inserted as (
    insert into showcase_cards (showcase_id, slot_index, grading_id)
      select p_showcase_id, slot_idx, id from numbered
      returning 1
  )
  select count(*) into v_inserted from inserted;

  return json_build_object(
    'ok', true,
    'displayed_count', v_inserted,
    'remaining_capacity', greatest(0, v_capacity - v_filled - v_inserted)
  );
end;
$$;

grant execute on function showcase_price(text) to anon, authenticated;
grant execute on function showcase_capacity(text) to anon, authenticated;
grant execute on function showcase_defense(text) to anon, authenticated;
grant execute on function showcase_sabotage_cost(text) to anon, authenticated;
grant execute on function bulk_display_pcl_slabs(uuid, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
