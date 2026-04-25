-- 조롱 일일 한도: 보내는 사람 기준 24시간 슬라이딩 윈도우 20회.
-- create_gift 와 동일한 패턴.

create or replace function send_taunt(
  p_from_id uuid,
  p_to_login text,
  p_message text
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_from_name text;
  v_to_id uuid;
  v_msg text := trim(coalesce(p_message, ''));
  v_clean text := trim(coalesce(p_to_login, ''));
  v_daily int;
begin
  if length(v_msg) < 1 or length(v_msg) > 200 then
    return json_build_object('ok', false, 'error', '메시지는 1~200자여야 합니다.');
  end if;
  select display_name into v_from_name from users where id = p_from_id;
  if v_from_name is null then
    return json_build_object('ok', false, 'error', '사용자를 찾을 수 없어요.');
  end if;

  select count(*)::int into v_daily
    from taunts
   where from_user_id = p_from_id
     and created_at > now() - interval '24 hours';
  if v_daily >= 20 then
    return json_build_object(
      'ok', false,
      'error', '하루 20회 조롱 한도를 초과했어요. 24시간 뒤 다시 시도해 주세요.',
      'daily_used', v_daily,
      'daily_limit', 20
    );
  end if;

  select id into v_to_id from users
    where lower(display_name) = lower(v_clean) limit 1;
  if not found then
    select id into v_to_id from users
      where user_id = lower(v_clean) limit 1;
  end if;
  if not found then
    return json_build_object('ok', false, 'error', '대상 사용자를 찾을 수 없어요.');
  end if;
  if v_to_id = p_from_id then
    return json_build_object('ok', false, 'error', '자기 자신에게는 보낼 수 없어요.');
  end if;

  insert into taunts (from_user_id, from_name, to_user_id, message)
    values (p_from_id, v_from_name, v_to_id, v_msg);

  return json_build_object(
    'ok', true,
    'daily_used', v_daily + 1,
    'daily_limit', 20
  );
end;
$$;

create or replace function taunt_quota(p_user_id uuid) returns json
language sql
stable
security definer
set search_path = public, extensions
as $$
  select json_build_object(
    'used', count(*)::int,
    'limit', 20,
    'remaining', greatest(0, 20 - count(*)::int)
  )
    from taunts
   where from_user_id = p_user_id
     and created_at > now() - interval '24 hours';
$$;

grant execute on function send_taunt(uuid, text, text) to anon, authenticated;
grant execute on function taunt_quota(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
