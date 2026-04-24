-- ============================================================
-- Wild battle reward — server-side point award after a battle win.
-- Client passes the amount (derived from wild HP). We clamp to a
-- hard cap so a tampered client can't fire infinite huge payouts.
-- ============================================================

create or replace function wild_battle_reward(
  p_user_id uuid,
  p_amount int
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_amount int := greatest(0, least(50000, coalesce(p_amount, 0)));
  v_new_points int;
begin
  if v_amount = 0 then
    select points into v_new_points from users where id = p_user_id;
    return json_build_object('ok', true, 'awarded', 0, 'points', v_new_points);
  end if;
  update users set points = points + v_amount
    where id = p_user_id
    returning points into v_new_points;
  return json_build_object('ok', true, 'awarded', v_amount, 'points', v_new_points);
end;
$$;

grant execute on function wild_battle_reward(uuid, int) to anon, authenticated;
notify pgrst, 'reload schema';
