-- ============================================================
-- Bulk-sell PCL-graded slabs.
-- Prices: PCL 6·7 → 10,000 / 8 → 20,000 / 9 → 100,000 / 10 → 200,000
-- Displayed slabs are ignored (same rule as the wallet AURA tab).
-- ============================================================

create or replace function pcl_sell_price(p_grade int) returns int
language sql immutable as $$
  select case
    when p_grade = 10 then 200000
    when p_grade = 9  then 100000
    when p_grade = 8  then  20000
    when p_grade in (6, 7) then 10000
    else 0
  end
$$;

create or replace function bulk_sell_gradings(
  p_user_id uuid,
  p_grading_ids uuid[]
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_sold int := 0;
  v_earned int := 0;
  v_grade int;
  v_id uuid;
  v_new_points int;
begin
  if p_grading_ids is null or array_length(p_grading_ids, 1) is null then
    return json_build_object('ok', false, 'error', '판매할 카드가 없습니다.');
  end if;

  foreach v_id in array p_grading_ids loop
    -- The grading must belong to the caller AND not be currently on display.
    select grade into v_grade from psa_gradings g
      where g.id = v_id
        and g.user_id = p_user_id
        and not exists (select 1 from showcase_cards c where c.grading_id = g.id)
      for update;
    if not found then
      continue;
    end if;

    delete from psa_gradings where id = v_id;
    v_sold := v_sold + 1;
    v_earned := v_earned + pcl_sell_price(v_grade);
  end loop;

  if v_earned > 0 then
    update users set points = points + v_earned
      where id = p_user_id
      returning points into v_new_points;
  else
    select points into v_new_points from users where id = p_user_id;
  end if;

  return json_build_object('ok', true,
    'sold', v_sold,
    'earned', v_earned,
    'points', v_new_points);
end;
$$;

grant execute on function pcl_sell_price(int) to anon, authenticated;
grant execute on function bulk_sell_gradings(uuid, uuid[]) to anon, authenticated;

notify pgrst, 'reload schema';
