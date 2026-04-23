-- ============================================================
-- PSA v2: 70% fail / 30% success (grade 6-10 only; 10 = 1%)
-- Card is consumed regardless; on fail no row is inserted.
-- Distribution (out of 100%):
--   fail 70%
--   grade 6  8%
--   grade 7 10%
--   grade 8  8%
--   grade 9  3%
--   grade 10 1%
-- ============================================================

create or replace function submit_psa_grading(
  p_user_id uuid,
  p_card_id text
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_count int;
  v_grade int;
  v_roll numeric;
begin
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
    when v_roll < 78 then 6
    when v_roll < 88 then 7
    when v_roll < 96 then 8
    when v_roll < 99 then 9
    else 10
  end;

  insert into psa_gradings (user_id, card_id, grade)
    values (p_user_id, p_card_id, v_grade);

  return json_build_object('ok', true, 'grade', v_grade);
end;
$$;

notify pgrst, 'reload schema';
