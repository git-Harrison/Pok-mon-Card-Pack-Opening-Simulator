-- ============================================================
-- Refund a box purchase when the post-buy persist step fails.
-- This gives points back so the user isn't out-of-pocket with no
-- cards when `record_pack_pull` can't complete.
-- ============================================================

create or replace function refund_box_purchase(
  p_user_id uuid,
  p_set_code text
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_cost int;
  v_new_points int;
begin
  v_cost := case p_set_code
    when 'm2a'  then 50000
    when 'm2'   then 40000
    when 'sv8'  then 30000
    when 'sv2a' then 35000
    when 'sv8a' then 40000
    when 'sv5a' then 30000
    else 30000
  end;
  update users set points = points + v_cost
    where id = p_user_id
    returning points into v_new_points;
  return json_build_object(
    'ok', true,
    'refunded', v_cost,
    'points', v_new_points
  );
end;
$$;

grant execute on function refund_box_purchase(uuid, text) to anon, authenticated;
notify pgrst, 'reload schema';
