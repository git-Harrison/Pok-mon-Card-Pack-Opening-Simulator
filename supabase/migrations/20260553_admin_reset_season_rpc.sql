-- 시즌 리셋을 admin 버튼에서 호출 가능한 RPC 로 분리.
-- 자동 마이그레이션이 아닌 admin 의 명시적 행동으로만 실행되도록 한다.
--
-- 조건: caller 의 user_id 가 'hun' 인 경우에만 통과 (AdminView 와 동일한
-- 화이트리스트). 외부 호출자는 사용자 테이블에 권한 컬럼이 없으므로
-- 닉네임/로그인으로 식별. 추후 admin 컬럼 도입 시 교체.

create or replace function admin_reset_season(p_admin_id uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_login text;
  v_users_updated int;
begin
  select user_id into v_login from users where id = p_admin_id;
  if v_login is null or lower(v_login) <> 'hun' then
    return json_build_object('ok', false, 'error', '관리자 권한이 없어요.');
  end if;

  perform pg_advisory_xact_lock(hashtext('admin_reset_season'));

  update users set
    pcl_10_wins       = 0,
    wild_wins         = 0,
    showcase_rank_pts = 0,
    points            = 10000000;
  get diagnostics v_users_updated = row_count;

  delete from sabotage_logs;
  delete from gifts;
  delete from taunts;

  return json_build_object(
    'ok', true,
    'users_updated', v_users_updated
  );
end;
$$;

grant execute on function admin_reset_season(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
