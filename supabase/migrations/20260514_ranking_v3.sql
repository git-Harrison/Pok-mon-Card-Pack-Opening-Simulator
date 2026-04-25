-- ============================================================
-- Ranking v3 — final rule set.
--
-- Old rules removed entirely:
--   · per-grade points (500/350/150/100/100) → gone
--   · sabotage win = +5,000                  → changed
--
-- New rules:
--   · PCL 10 grading success → +500 (cumulative, all-time —
--       selling or losing the slab to sabotage does NOT take
--       points away)
--   · Sabotage success (attacker)            → +3,000 each
--   · Sabotage failure → showcase OWNER      → +50 each
--
-- The cumulative-PCL-10 count needs a stable counter on users
-- because psa_gradings rows get deleted on sale / sabotage and
-- a derived count would shrink. We add `pcl_10_wins` and
-- backfill from the current snapshot (best-effort — can't
-- recover already-deleted PCL 10s, but going forward every new
-- success is incremented).
-- ============================================================

alter table users
  add column if not exists pcl_10_wins int not null default 0;

-- One-shot backfill (idempotent: restoring it always makes the
-- column reflect the *current* slabs at least). Anything previously
-- destroyed before this column existed is lost — we don't have the
-- history to recover it.
update users u
   set pcl_10_wins = greatest(
     u.pcl_10_wins,
     coalesce((
       select count(*)::int
         from psa_gradings g
        where g.user_id = u.id and g.grade = 10
     ), 0)
   );

-- ----------------------------------------------------------------
-- submit_psa_grading — increment pcl_10_wins on grade-10 success.
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

  if v_grade = 10 then
    update users set pcl_10_wins = pcl_10_wins + 1 where id = p_user_id;
  end if;

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
-- bulk_submit_psa_grading — also increment pcl_10_wins. Matches
-- the auto-sell signature added in 20260513.
-- ----------------------------------------------------------------
create or replace function bulk_submit_psa_grading(
  p_user_id uuid,
  p_card_ids text[],
  p_rarities text[] default null,
  p_auto_sell_below_grade int default null
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
  v_auto_sold_count int := 0;
  v_auto_sold_earned int := 0;
  v_pcl_10_delta int := 0;
  v_sell_payout int;
  v_should_auto_sell boolean;
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

    if v_grade = 10 then
      v_pcl_10_delta := v_pcl_10_delta + 1;
    end if;

    v_should_auto_sell :=
      p_auto_sell_below_grade is not null
      and v_grade < p_auto_sell_below_grade;

    if v_should_auto_sell then
      v_sell_payout := pcl_sell_price(v_grade);
      v_auto_sold_count := v_auto_sold_count + 1;
      v_auto_sold_earned := v_auto_sold_earned + v_sell_payout;
      v_total_bonus := v_total_bonus + v_bonus + v_sell_payout;
      v_success := v_success + 1;

      v_results := v_results || jsonb_build_object(
        'card_id', v_card_id,
        'ok', true,
        'failed', false,
        'grade', v_grade,
        'bonus', v_bonus,
        'auto_sold', true,
        'sell_payout', v_sell_payout
      );
      continue;
    end if;

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

  if v_pcl_10_delta > 0 then
    update users set pcl_10_wins = pcl_10_wins + v_pcl_10_delta
      where id = p_user_id;
  end if;

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
    'auto_sold_count', v_auto_sold_count,
    'auto_sold_earned', v_auto_sold_earned,
    'bonus', v_total_bonus,
    'points', v_new_points
  );
end;
$$;

-- ----------------------------------------------------------------
-- get_user_rankings — apply the new scoring rules.
--   rank_score =
--     pcl_10_wins             × 500
--   + sabotage success count  × 3,000   (as attacker)
--   + sabotage defended count × 50      (as victim, attacker failed)
-- ----------------------------------------------------------------
create or replace function get_user_rankings()
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_rows json;
begin
  select coalesce(
    json_agg(r order by r.rank_score desc, r.points desc),
    '[]'::json
  )
    into v_rows
  from (
    select
      u.id,
      u.user_id,
      u.display_name,
      u.age,
      u.points,
      (
        coalesce(u.pcl_10_wins, 0) * 500
        + coalesce((
            select count(*)::int * 3000
              from sabotage_logs l
             where l.attacker_id = u.id and l.success
          ), 0)
        + coalesce((
            select count(*)::int * 50
              from sabotage_logs l
             where l.victim_id = u.id and not l.success
          ), 0)
      ) as rank_score,
      coalesce((
        select sum(rarity_power(g2.rarity) * pcl_power(g2.grade))::int
        from showcase_cards sc
        join user_showcases us on us.id = sc.showcase_id
        join psa_gradings g2 on g2.id = sc.grading_id
        where us.user_id = u.id
      ), 0) as center_power,
      coalesce(count(g.id), 0)::int as psa_count,
      coalesce(sum(case when g.grade = 10 then 1 else 0 end), 0)::int as psa_10,
      coalesce(sum(case when g.grade = 9  then 1 else 0 end), 0)::int as psa_9,
      coalesce(sum(case when g.grade = 8  then 1 else 0 end), 0)::int as psa_8,
      coalesce(sum(case when g.grade = 7  then 1 else 0 end), 0)::int as psa_7,
      coalesce(sum(case when g.grade = 6  then 1 else 0 end), 0)::int as psa_6,
      coalesce((
        select count(*)::int
        from showcase_cards sc
        join user_showcases us on us.id = sc.showcase_id
        where us.user_id = u.id
      ), 0) as showcase_count,
      coalesce((
        select count(*)::int
        from sabotage_logs l
        where l.attacker_id = u.id and l.success
      ), 0) as sabotage_wins,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', g.id,
            'card_id', g.card_id,
            'grade', g.grade,
            'graded_at', g.graded_at
          )
          order by g.grade desc, g.graded_at desc
        ) filter (where g.id is not null),
        '[]'::jsonb
      ) as gradings
    from users u
    left join psa_gradings g on g.user_id = u.id
    group by u.id
  ) r;
  return v_rows;
end;
$$;

grant execute on function submit_psa_grading(uuid, text, text) to anon, authenticated;
grant execute on function bulk_submit_psa_grading(uuid, text[], text[], int) to anon, authenticated;
grant execute on function get_user_rankings() to anon, authenticated;

notify pgrst, 'reload schema';
