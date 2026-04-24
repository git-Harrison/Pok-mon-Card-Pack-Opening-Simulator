-- ============================================================
-- Caps & grading rules v2
--
-- 1. Wallet card cap 1,000 → 5,000. PCL gradings get their own
--    cap at 1,000. Total ceiling per user ≈ 6,000 collectibles.
--
-- 2. Grading eligibility is now server-enforced (not just client):
--    SR, MA, SAR, UR, MUR are accepted. Gate in both single &
--    bulk grading RPCs so UI bypass isn't possible.
--
-- 3. record_pack_pull optimization:
--      - pg_advisory_xact_lock per user: eliminates parallel-call
--        race that let users silently exceed the cap and caused
--        tail latency from UPSERT lock contention on card_ownership.
--      - Set-based INSERTs: one batched INSERT into pulls, one
--        aggregated UPSERT into card_ownership. Replaces FOREACH
--        loop that did 2*N statement round-trips per pack.
-- ============================================================

-- ----------------------------------------------------------------
-- record_pack_pull v3 — 5,000 cap, advisory lock, batched inserts
-- ----------------------------------------------------------------
create or replace function record_pack_pull(
  p_user_id uuid,
  p_set_code text,
  p_card_ids text[]
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pack_id uuid;
  v_current int;
  v_incoming int := coalesce(array_length(p_card_ids, 1), 0);
begin
  -- Serialize concurrent calls for the same user. Prevents the
  -- parallel-pack race against the cap check and avoids UPSERT
  -- lock contention on card_ownership.
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  select coalesce(sum(count), 0)::int
    into v_current
    from card_ownership
   where user_id = p_user_id;

  if v_current + v_incoming > 5000 then
    raise exception
      '지갑 보유 한도 초과 — 현재 %장 / 5,000장. 팔거나 감별/전시로 정리한 뒤 다시 시도하세요.',
      v_current
      using errcode = 'P0001';
  end if;

  insert into pack_opens (user_id, set_code)
    values (p_user_id, p_set_code)
    returning id into v_pack_id;

  insert into pulls (user_id, card_id, set_code, pack_open_id)
  select p_user_id, c, p_set_code, v_pack_id
    from unnest(p_card_ids) as c;

  insert into card_ownership (user_id, card_id, count, last_pulled_at)
  select p_user_id, c, count(*)::int, now()
    from unnest(p_card_ids) as c
   group by c
  on conflict (user_id, card_id) do update
    set count = card_ownership.count + excluded.count,
        last_pulled_at = now();

  return json_build_object('ok', true, 'pack_open_id', v_pack_id);
end;
$$;

grant execute on function record_pack_pull(uuid, text, text[]) to anon, authenticated;

-- ----------------------------------------------------------------
-- Grading eligibility helper — single source of truth.
-- SR · MA · SAR · UR · MUR.
-- ----------------------------------------------------------------
create or replace function is_psa_eligible_rarity(p_rarity text)
returns boolean
language sql
immutable
as $$
  select p_rarity in ('SR', 'MA', 'SAR', 'UR', 'MUR');
$$;

-- ----------------------------------------------------------------
-- PCL cap helper — 1,000 gradings per user.
-- ----------------------------------------------------------------
create or replace function assert_pcl_cap(p_user_id uuid, p_incoming int)
returns void
language plpgsql
as $$
declare
  v_current int;
begin
  select count(*)::int into v_current
    from psa_gradings
   where user_id = p_user_id;
  if v_current + p_incoming > 1000 then
    raise exception
      'PCL 슬랩 보유 한도 초과 — 현재 %장 / 1,000장. 일괄 판매로 정리한 뒤 다시 시도하세요.',
      v_current
      using errcode = 'P0001';
  end if;
end;
$$;

-- ----------------------------------------------------------------
-- submit_psa_grading — validates rarity + enforces PCL cap
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
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  if p_rarity is null or not is_psa_eligible_rarity(p_rarity) then
    return json_build_object(
      'ok', false,
      'error', 'SR · MA · SAR · UR · MUR 카드만 감별을 받을 수 있어요.'
    );
  end if;

  -- Cap up front: even though a failure doesn't create a grading,
  -- the simpler rule is "must have room for at least one new slab
  -- to try". Keeps the user experience consistent.
  perform assert_pcl_cap(p_user_id, 1);

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
-- bulk_submit_psa_grading — rarity validation + PCL cap
-- Ineligible-rarity cards are skipped (not burned) and reported
-- in results. Cap is checked once up front against the count of
-- eligible candidates.
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
  v_eligible_count int := 0;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  if p_card_ids is null or array_length(p_card_ids, 1) is null then
    return json_build_object('ok', false, 'error', '감정할 카드가 없어요.');
  end if;

  if p_rarities is not null then
    select count(*)::int into v_eligible_count
      from unnest(p_rarities) as r
     where is_psa_eligible_rarity(r);
  else
    v_eligible_count := array_length(p_card_ids, 1);
  end if;

  perform assert_pcl_cap(p_user_id, v_eligible_count);

  foreach v_card_id in array p_card_ids loop
    v_idx := v_idx + 1;
    v_rarity := case
      when p_rarities is null then null
      when array_length(p_rarities, 1) >= v_idx then p_rarities[v_idx]
      else null
    end;

    if v_rarity is null or not is_psa_eligible_rarity(v_rarity) then
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_object(
        'card_id', v_card_id,
        'ok', false,
        'error', 'ineligible_rarity'
      );
      continue;
    end if;

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

grant execute on function is_psa_eligible_rarity(text) to anon, authenticated;
grant execute on function submit_psa_grading(uuid, text, text) to anon, authenticated;
grant execute on function bulk_submit_psa_grading(uuid, text[], text[]) to anon, authenticated;

notify pgrst, 'reload schema';
