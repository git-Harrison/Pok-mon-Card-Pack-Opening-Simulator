-- ============================================================
-- Gift v3 — daily limit 3 → 5
-- ============================================================

create or replace function create_gift(
  p_from_id uuid,
  p_to_user_id text,
  p_card_id text,
  p_price_points int,
  p_message text default null
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_to_id uuid;
  v_count int;
  v_gift_id uuid;
  v_daily int;
  v_clean text := trim(coalesce(p_to_user_id, ''));
begin
  if length(v_clean) < 1 then
    return json_build_object('ok', false, 'error', '받는 사람 닉네임을 입력해 주세요.');
  end if;
  select count(*) into v_daily from gifts
    where from_user_id = p_from_id
      and created_at > now() - interval '24 hours';
  if v_daily >= 5 then
    return json_build_object('ok', false, 'error', '하루 5회 선물 한도를 초과했어요.');
  end if;
  if coalesce(p_price_points, 0) < 0 then
    return json_build_object('ok', false, 'error', '가격은 0 이상이어야 합니다.');
  end if;

  select id into v_to_id from users
    where lower(display_name) = lower(v_clean)
    limit 1;
  if not found then
    select id into v_to_id from users
      where user_id = lower(v_clean)
      limit 1;
  end if;
  if not found then
    return json_build_object('ok', false, 'error', '그 닉네임의 사용자를 찾을 수 없어요.');
  end if;
  if v_to_id = p_from_id then
    return json_build_object('ok', false, 'error', '본인에게는 선물할 수 없어요.');
  end if;

  select count into v_count from card_ownership
    where user_id = p_from_id and card_id = p_card_id;
  if not found or coalesce(v_count, 0) < 1 then
    return json_build_object('ok', false, 'error', '선물할 카드가 없어요.');
  end if;

  update card_ownership set count = count - 1, last_pulled_at = now()
    where user_id = p_from_id and card_id = p_card_id;
  delete from card_ownership
    where user_id = p_from_id and card_id = p_card_id and count = 0;

  insert into gifts (from_user_id, to_user_id, card_id, status, price_points, expires_at, message)
    values (p_from_id, v_to_id, p_card_id, 'pending',
            coalesce(p_price_points, 0),
            now() + interval '24 hours',
            nullif(trim(coalesce(p_message, '')), ''))
    returning id into v_gift_id;

  return json_build_object('ok', true, 'gift_id', v_gift_id,
    'daily_used', v_daily + 1, 'daily_limit', 5);
end;
$$;

create or replace function gift_quota(p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_used int;
begin
  select count(*) into v_used from gifts
    where from_user_id = p_user_id
      and created_at > now() - interval '24 hours';
  return json_build_object(
    'used', v_used,
    'limit', 5,
    'remaining', greatest(0, 5 - v_used)
  );
end;
$$;

grant execute on function create_gift(uuid, text, text, int, text) to anon, authenticated;
grant execute on function gift_quota(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
