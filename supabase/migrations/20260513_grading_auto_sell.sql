-- ============================================================
-- Bulk grading auto-sell — drop low-PCL slabs straight to points.
--
-- /grading lets users tick "PCL N 미만 자동 판매" before bulk
-- grading. Successful grades below the threshold skip the
-- psa_gradings insert entirely and credit pcl_sell_price(grade)
-- to the wallet. Anything ≥ threshold still becomes a slab as
-- usual. Cap-check counts only the kept (≥ threshold) slabs, so
-- the auto-sold ones don't push toward the 500 PCL cap.
--
-- Threshold semantics:
--   p_auto_sell_below_grade IS NULL  →  auto-sell disabled (legacy behavior)
--   p_auto_sell_below_grade =     7  →  sell 6 (only)
--   p_auto_sell_below_grade =     8  →  sell 6, 7
--   p_auto_sell_below_grade =     9  →  sell 6, 7, 8
--   p_auto_sell_below_grade =    10  →  sell 6, 7, 8, 9
--   p_auto_sell_below_grade =    11  →  sell everything (effectively all)
--
-- Failures (the 70% fail roll) still produce no slab and no
-- payout — that path is unchanged.
-- ============================================================

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

  -- Cap on the upper bound of new slabs we *might* mint. Auto-sold
  -- ones don't enter psa_gradings, but we don't know the rolls yet
  -- so we conservatively reserve room for the worst case (all kept).
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

grant execute on function bulk_submit_psa_grading(uuid, text[], text[], int) to anon, authenticated;

notify pgrst, 'reload schema';
