-- ============================================================
-- AURA v5: bulk PSA grading.
-- Same per-card odds as submit_psa_grading (aura-v4): fail 70 ·
-- 6 → 8, 7 → 10, 8 → 8, 9 → 3.5, 10 → 0.5. Bonuses also identical.
-- All rolls are independent. Bonus points are applied in a single
-- trailing update so the wallet balance reflects the full batch.
-- ============================================================

create or replace function bulk_submit_psa_grading(
  p_user_id uuid,
  p_card_ids text[]
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_card_id text;
  v_count int;
  v_grade int;
  v_roll numeric;
  v_bonus int;
  v_total_bonus int := 0;
  v_success int := 0;
  v_fail int := 0;
  v_skipped int := 0;
  v_results jsonb := '[]'::jsonb;
  v_item jsonb;
  v_new_points int;
begin
  if p_card_ids is null or array_length(p_card_ids, 1) is null then
    return json_build_object('ok', false, 'error', '감정할 카드가 없어요.');
  end if;

  foreach v_card_id in array p_card_ids loop
    -- Row-lock ownership to keep concurrent bulk submissions consistent.
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

    insert into psa_gradings (user_id, card_id, grade)
      values (p_user_id, v_card_id, v_grade);

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

grant execute on function bulk_submit_psa_grading(uuid, text[]) to anon, authenticated;

notify pgrst, 'reload schema';
