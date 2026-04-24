-- ============================================================
-- ADMIN v1 — grant-points RPC restricted to the "hun" login.
-- Security: the function verifies the caller's user_id is 'hun'
-- *inside* the SECURITY DEFINER body, so any other account that
-- tries to POST the RPC gets rejected before any state changes.
-- ============================================================

create or replace function admin_grant_points(
  p_admin_id uuid,
  p_target text,
  p_amount int
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin_login text;
  v_target_id uuid;
  v_target_name text;
  v_new_points int;
  v_clean text := trim(coalesce(p_target, ''));
begin
  select user_id into v_admin_login from users where id = p_admin_id;
  if v_admin_login is null then
    return json_build_object('ok', false, 'error', '사용자를 찾을 수 없어요.');
  end if;
  if v_admin_login <> 'hun' then
    return json_build_object('ok', false, 'error', '관리자 권한이 없어요.');
  end if;
  if v_clean = '' then
    return json_build_object('ok', false, 'error', '대상 닉네임/아이디를 입력하세요.');
  end if;
  if p_amount is null or p_amount = 0 then
    return json_build_object('ok', false, 'error', '지급 포인트를 입력하세요.');
  end if;

  -- nickname first (case-insensitive), then login
  select id, display_name into v_target_id, v_target_name from users
    where lower(display_name) = lower(v_clean)
    limit 1;
  if not found then
    select id, display_name into v_target_id, v_target_name from users
      where user_id = lower(v_clean)
      limit 1;
  end if;
  if not found then
    return json_build_object('ok', false, 'error', '대상 사용자를 찾을 수 없어요.');
  end if;

  update users
    set points = greatest(0, points + p_amount)
    where id = v_target_id
    returning points into v_new_points;

  return json_build_object('ok', true,
    'target_name', v_target_name,
    'amount', p_amount,
    'points', v_new_points);
end;
$$;

create or replace function admin_list_users(p_admin_id uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin_login text;
  v_rows json;
begin
  select user_id into v_admin_login from users where id = p_admin_id;
  if v_admin_login <> 'hun' then
    return json_build_object('ok', false, 'error', '관리자 권한이 없어요.');
  end if;

  select coalesce(json_agg(u order by u.user_id), '[]'::json) into v_rows
    from (
      select id, user_id, display_name, age, points
      from users
      order by user_id
    ) u;

  return json_build_object('ok', true, 'users', v_rows);
end;
$$;

grant execute on function admin_grant_points(uuid, text, int) to anon, authenticated;
grant execute on function admin_list_users(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
