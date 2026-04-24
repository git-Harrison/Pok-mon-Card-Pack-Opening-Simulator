-- ============================================================
-- CENTER v4 — display AURA-graded cards only
--
-- Only AURA grade 9 or 10 slabs can be displayed. Income rate
-- now depends on the slab's grade:
--   AURA 10 → 5,000p / hour
--   AURA 9  → 3,000p / hour
--
-- `showcase_cards` pivots from referencing card_id directly to
-- referencing psa_gradings.id (grading_id). Since the museum
-- feature was deployed for zero seconds before this rewrite, we
-- truncate any prior rows (none in prod).
--
-- Sabotage: destroying a showcase ALSO deletes the underlying
-- psa_gradings rows (the slabs are shattered), not just the
-- showcase entry.
-- ============================================================

-- Zero out pre-existing rows from center-v1..v3 (safe — feature
-- hadn't shipped to the client yet).
truncate showcase_cards, user_showcases restart identity cascade;

-- Rebuild showcase_cards around grading_id.
alter table showcase_cards drop column if exists card_id;
alter table showcase_cards
  add column if not exists grading_id uuid not null
    references psa_gradings(id) on delete cascade;

-- A grading can be in at most one showcase slot at a time.
create unique index if not exists showcase_cards_grading_unique
  on showcase_cards(grading_id);

-- ------------------------------------------------------------
-- display_grading — slab → showcase slot
-- ------------------------------------------------------------
create or replace function display_grading(
  p_user_id uuid,
  p_showcase_id uuid,
  p_slot_index int,
  p_grading_id uuid
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_showcase record;
  v_capacity int;
  v_grading record;
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

  select * into v_grading from psa_gradings
    where id = p_grading_id and user_id = p_user_id;
  if not found then
    return json_build_object('ok', false, 'error', '감별 기록을 찾을 수 없어요.');
  end if;
  if v_grading.grade not in (9, 10) then
    return json_build_object('ok', false, 'error', 'AURA 9·10 등급만 전시할 수 있어요.');
  end if;

  if exists(select 1 from showcase_cards where grading_id = p_grading_id) then
    return json_build_object('ok', false, 'error', '이미 다른 보관함에 전시 중이에요.');
  end if;

  insert into showcase_cards (showcase_id, slot_index, grading_id)
    values (p_showcase_id, p_slot_index, p_grading_id);

  return json_build_object('ok', true);
end;
$$;

-- ------------------------------------------------------------
-- undisplay_grading — slab leaves showcase, stays in user's slab collection
-- ------------------------------------------------------------
create or replace function undisplay_grading(
  p_user_id uuid,
  p_showcase_id uuid,
  p_slot_index int
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_deleted int;
begin
  delete from showcase_cards c
    using user_showcases s
    where c.showcase_id = s.id
      and s.id = p_showcase_id
      and s.user_id = p_user_id
      and c.slot_index = p_slot_index;
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    return json_build_object('ok', false, 'error', '전시 중인 카드가 없어요.');
  end if;
  return json_build_object('ok', true);
end;
$$;

-- ------------------------------------------------------------
-- remove_showcase — dismantle; slabs return to the user's collection
-- (they keep the psa_gradings row, only the showcase is gone).
-- ------------------------------------------------------------
create or replace function remove_showcase(
  p_user_id uuid,
  p_showcase_id uuid
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not exists(select 1 from user_showcases
                where id = p_showcase_id and user_id = p_user_id) then
    return json_build_object('ok', false, 'error', '보관함을 찾을 수 없어요.');
  end if;

  -- showcase_cards rows cascade-delete when the showcase is removed;
  -- the referenced psa_gradings rows survive because the FK direction
  -- is showcase_cards → psa_gradings.
  delete from user_showcases
    where id = p_showcase_id and user_id = p_user_id;

  return json_build_object('ok', true);
end;
$$;

-- ------------------------------------------------------------
-- get_user_center — snapshot with grade + card_id per slot
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
          'grading_id', g.id,
          'card_id', g.card_id,
          'grade', g.grade
        ) order by c.slot_index)
        from showcase_cards c
        join psa_gradings g on g.id = c.grading_id
        where c.showcase_id = s.id
      ), '[]'::json)
    ) order by s.created_at
  ), '[]'::json)
  into v_result
  from user_showcases s
  where s.user_id = p_user_id;

  return v_result;
end;
$$;

-- Visit-by-login wraps get_user_center; no change needed but
-- recompile so it picks up the new shape of cards[].
create or replace function get_user_center_by_login(p_login text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_owner record;
  v_showcases json;
begin
  select id, user_id, display_name into v_owner
    from users where user_id = p_login;
  if not found then
    return json_build_object('ok', false, 'error', '사용자를 찾을 수 없어요.');
  end if;
  v_showcases := get_user_center(v_owner.id);
  return json_build_object('ok', true,
    'owner_id', v_owner.id,
    'login_id', v_owner.user_id,
    'display_name', v_owner.display_name,
    'showcases', v_showcases);
end;
$$;

-- ------------------------------------------------------------
-- claim_showcase_income — grade-specific rates (9→3000, 10→5000)
-- ------------------------------------------------------------
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
  -- Sum whole hours × per-grade rate across displayed gradings.
  select
    coalesce(sum(
      floor(extract(epoch from (now() - c.income_claimed_at)) / 3600)
      * case g.grade when 10 then 5000 when 9 then 3000 else 0 end
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

-- ------------------------------------------------------------
-- sabotage_card — successful attack also shatters the psa_gradings row
-- ------------------------------------------------------------
create or replace function sabotage_card(
  p_attacker_id uuid,
  p_showcase_id uuid,
  p_slot_index int
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_cost int := 100000;
  v_attacker_name text;
  v_attacker_points int;
  v_showcase record;
  v_victim_name text;
  v_victim_login text;
  v_card_id text;
  v_grade int;
  v_success boolean;
  v_cards_deleted int := 0;
begin
  if p_attacker_id is null or p_showcase_id is null then
    return json_build_object('ok', false, 'error', '요청이 올바르지 않아요.');
  end if;

  select display_name, points into v_attacker_name, v_attacker_points
    from users where id = p_attacker_id for update;
  if not found then
    return json_build_object('ok', false, 'error', '사용자를 찾을 수 없어요.');
  end if;
  if v_attacker_points < v_cost then
    return json_build_object('ok', false, 'error', '포인트가 부족해요. (10만p 필요)');
  end if;

  select * into v_showcase from user_showcases
    where id = p_showcase_id for update;
  if not found then
    return json_build_object('ok', false, 'error', '보관함을 찾을 수 없어요.');
  end if;
  if v_showcase.user_id = p_attacker_id then
    return json_build_object('ok', false, 'error', '자기 센터는 부술 수 없어요.');
  end if;

  select display_name, user_id into v_victim_name, v_victim_login
    from users where id = v_showcase.user_id;

  select g.card_id, g.grade into v_card_id, v_grade
    from showcase_cards c
    join psa_gradings g on g.id = c.grading_id
    where c.showcase_id = p_showcase_id and c.slot_index = p_slot_index;
  if v_card_id is null then
    return json_build_object('ok', false, 'error', '대상 카드를 찾을 수 없어요.');
  end if;

  update users set points = points - v_cost
    where id = p_attacker_id
    returning points into v_attacker_points;

  v_success := random() < 0.3;

  if v_success then
    select count(*) into v_cards_deleted from showcase_cards
      where showcase_id = p_showcase_id;
    -- Shatter the slabs — deleting psa_gradings cascades to showcase_cards.
    delete from psa_gradings
      where id in (select grading_id from showcase_cards where showcase_id = p_showcase_id);
    delete from user_showcases where id = p_showcase_id;
  end if;

  return json_build_object('ok', true,
    'success', v_success,
    'cost', v_cost,
    'points', v_attacker_points,
    'attacker_name', v_attacker_name,
    'victim_id', v_showcase.user_id,
    'victim_name', v_victim_name,
    'victim_login', v_victim_login,
    'card_id', v_card_id,
    'grade', v_grade,
    'cards_destroyed', case when v_success then v_cards_deleted else 0 end);
end;
$$;

-- ------------------------------------------------------------
-- get_undisplayed_gradings — used by the center card-picker and
-- the wallet's AURA tab to exclude slabs currently on display.
-- ------------------------------------------------------------
create or replace function get_undisplayed_gradings(p_user_id uuid)
returns setof psa_gradings
language sql
stable
set search_path = public, extensions
as $$
  select g.*
    from psa_gradings g
   where g.user_id = p_user_id
     and not exists (select 1 from showcase_cards c where c.grading_id = g.id)
   order by g.graded_at desc
$$;

grant execute on function display_grading(uuid, uuid, int, uuid) to anon, authenticated;
grant execute on function undisplay_grading(uuid, uuid, int) to anon, authenticated;
grant execute on function remove_showcase(uuid, uuid) to anon, authenticated;
grant execute on function get_user_center(uuid) to anon, authenticated;
grant execute on function get_user_center_by_login(text) to anon, authenticated;
grant execute on function claim_showcase_income(uuid) to anon, authenticated;
grant execute on function sabotage_card(uuid, uuid, int) to anon, authenticated;
grant execute on function get_undisplayed_gradings(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
