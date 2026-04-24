-- ============================================================
-- AURA v4: lower grade-10 rate to 0.5% (was 1%).
-- New distribution: fail 70 · 6 8 · 7 10 · 8 8 · 9 3.5 · 10 0.5
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
  v_bonus int := 0;
  v_new_points int;
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
    values (p_user_id, p_card_id, v_grade);

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

grant execute on function submit_psa_grading(uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
