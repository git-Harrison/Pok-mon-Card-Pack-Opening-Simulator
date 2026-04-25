-- ============================================================
-- 조롱 기록 히스토리 RPC.
-- /profile 의 "조롱 기록" 모달에서 보낸 조롱 / 받은 조롱을 한 번에 가져온다.
-- taunts 테이블에는 from_name 만 저장되어 있어 to_name 은 users 와 left join.
-- 발신자가 탈퇴해 from_user_id 가 null 인 과거 행도 from_name 컬럼으로 표시.
-- ============================================================

create or replace function get_taunt_history(
  p_user_id uuid,
  p_limit int default 50
) returns json
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 50), 200));
  v_sent json;
  v_received json;
begin
  -- 보낸 조롱 (from_user_id = me) — to_name 은 users join 으로 가져온다.
  select coalesce(json_agg(row_to_json(s) order by s.created_at desc), '[]'::json)
    into v_sent
    from (
      select
        t.id,
        t.from_user_id,
        t.from_name,
        t.to_user_id,
        coalesce(tu.display_name, '(알 수 없음)') as to_name,
        t.message,
        t.created_at
        from taunts t
        left join users tu on tu.id = t.to_user_id
       where t.from_user_id = p_user_id
       order by t.created_at desc
       limit v_limit
    ) s;

  -- 받은 조롱 (to_user_id = me) — from_name 은 컬럼에 박제되어 있다.
  select coalesce(json_agg(row_to_json(r) order by r.created_at desc), '[]'::json)
    into v_received
    from (
      select
        t.id,
        t.from_user_id,
        t.from_name,
        t.to_user_id,
        coalesce(tu.display_name, '(알 수 없음)') as to_name,
        t.message,
        t.created_at
        from taunts t
        left join users tu on tu.id = t.to_user_id
       where t.to_user_id = p_user_id
       order by t.created_at desc
       limit v_limit
    ) r;

  return json_build_object(
    'ok', true,
    'sent', v_sent,
    'received', v_received
  );
end;
$$;

grant execute on function get_taunt_history(uuid, int) to anon, authenticated;

notify pgrst, 'reload schema';
