-- ============================================================
-- 조롱하기 (taunts) + 선물 배지용 gift.viewed_at 컬럼 추가.
-- Taunt: recipient sees a blocking popup on next page render.
--   Dismiss (close / confirm) flips `seen=true` so it never shows again.
-- Gifts: badge on nav counts pending received gifts the user hasn't
--   acknowledged yet. Visiting /gifts OR accepting/declining clears.
-- ============================================================

-- Taunts table --------------------------------------------------
create table if not exists taunts (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid references users(id) on delete set null,
  from_name text not null,
  to_user_id uuid not null references users(id) on delete cascade,
  message text not null check (length(message) between 1 and 200),
  seen boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists taunts_unseen_idx
  on taunts(to_user_id)
  where seen = false;

alter table taunts enable row level security;

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
begin
  if length(v_msg) < 1 or length(v_msg) > 200 then
    return json_build_object('ok', false, 'error', '메시지는 1~200자여야 합니다.');
  end if;
  select display_name into v_from_name from users where id = p_from_id;
  if v_from_name is null then
    return json_build_object('ok', false, 'error', '사용자를 찾을 수 없어요.');
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

  return json_build_object('ok', true);
end;
$$;

create or replace function fetch_unseen_taunts(p_user_id uuid)
returns setof taunts
language sql
stable
set search_path = public, extensions
as $$
  select *
    from taunts
   where to_user_id = p_user_id and seen = false
   order by created_at desc
   limit 20
$$;

create or replace function mark_taunt_seen(p_taunt_id uuid, p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update taunts set seen = true
    where id = p_taunt_id and to_user_id = p_user_id;
  return json_build_object('ok', true);
end;
$$;

grant execute on function send_taunt(uuid, text, text) to anon, authenticated;
grant execute on function fetch_unseen_taunts(uuid) to anon, authenticated;
grant execute on function mark_taunt_seen(uuid, uuid) to anon, authenticated;

-- Gift viewed_at ------------------------------------------------
alter table gifts
  add column if not exists viewed_at timestamptz;

create or replace function fetch_unseen_gift_count(p_user_id uuid) returns int
language sql
stable
set search_path = public, extensions
as $$
  select count(*)::int
    from gifts
   where to_user_id = p_user_id
     and status = 'pending'
     and viewed_at is null
     and expires_at > now();
$$;

create or replace function mark_gifts_viewed(p_user_id uuid) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update gifts set viewed_at = now()
    where to_user_id = p_user_id
      and viewed_at is null;
  return json_build_object('ok', true);
end;
$$;

grant execute on function fetch_unseen_gift_count(uuid) to anon, authenticated;
grant execute on function mark_gifts_viewed(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
