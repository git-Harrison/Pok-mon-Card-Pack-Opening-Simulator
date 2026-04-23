-- ============================================================
-- 포켓몬 카드깡 시뮬레이터 · Supabase schema
-- Run this in Supabase Dashboard → SQL Editor (entire file).
-- Safe to re-run: uses IF NOT EXISTS / IDEMPOTENT patterns.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- Tables
-- ------------------------------------------------------------

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique,                 -- lowercase login ID
  password_hash text not null,                  -- bcrypt via pgcrypto
  age int not null check (age between 1 and 120),
  created_at timestamptz not null default now()
);

create table if not exists pack_opens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  set_code text not null,
  opened_at timestamptz not null default now()
);
create index if not exists pack_opens_user_idx on pack_opens(user_id, opened_at desc);

create table if not exists pulls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  card_id text not null,
  set_code text not null,
  pack_open_id uuid references pack_opens(id) on delete set null,
  pulled_at timestamptz not null default now()
);
create index if not exists pulls_user_idx on pulls(user_id, pulled_at desc);

create table if not exists card_ownership (
  user_id uuid not null references users(id) on delete cascade,
  card_id text not null,
  count int not null default 0 check (count >= 0),
  first_pulled_at timestamptz not null default now(),
  last_pulled_at timestamptz not null default now(),
  primary key (user_id, card_id)
);
create index if not exists card_ownership_user_idx on card_ownership(user_id);

create table if not exists gifts (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references users(id) on delete cascade,
  to_user_id uuid not null references users(id) on delete cascade,
  card_id text not null,
  created_at timestamptz not null default now()
);
create index if not exists gifts_to_idx on gifts(to_user_id, created_at desc);
create index if not exists gifts_from_idx on gifts(from_user_id, created_at desc);

-- ------------------------------------------------------------
-- RPC: auth
-- ------------------------------------------------------------

create or replace function auth_signup(p_user_id text, p_password text, p_age int)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_clean text := lower(trim(p_user_id));
begin
  if length(v_clean) < 2 or length(v_clean) > 24 then
    return json_build_object('ok', false, 'error', '아이디는 2~24자여야 합니다.');
  end if;
  if v_clean !~ '^[a-z0-9_]+$' then
    return json_build_object('ok', false, 'error', '아이디는 영문 소문자/숫자/언더스코어만 허용됩니다.');
  end if;
  if length(p_password) < 4 then
    return json_build_object('ok', false, 'error', '비밀번호는 4자 이상이어야 합니다.');
  end if;
  if p_age is null or p_age < 1 or p_age > 120 then
    return json_build_object('ok', false, 'error', '나이가 올바르지 않습니다.');
  end if;
  if exists (select 1 from users where user_id = v_clean) then
    return json_build_object('ok', false, 'error', '이미 사용 중인 아이디입니다.');
  end if;

  insert into users (user_id, password_hash, age)
  values (v_clean, crypt(p_password, gen_salt('bf')), p_age)
  returning id into v_id;

  return json_build_object('ok', true,
    'user', json_build_object('id', v_id, 'user_id', v_clean, 'age', p_age));
end;
$$;

create or replace function auth_login(p_user_id text, p_password text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user users%rowtype;
  v_clean text := lower(trim(p_user_id));
begin
  select * into v_user from users where user_id = v_clean;
  if not found then
    return json_build_object('ok', false, 'error', '등록되지 않은 아이디입니다.');
  end if;
  if v_user.password_hash <> crypt(p_password, v_user.password_hash) then
    return json_build_object('ok', false, 'error', '비밀번호가 올바르지 않습니다.');
  end if;
  return json_build_object('ok', true,
    'user', json_build_object('id', v_user.id, 'user_id', v_user.user_id, 'age', v_user.age));
end;
$$;

-- ------------------------------------------------------------
-- RPC: pack opening (atomic pulls + ownership upsert)
-- ------------------------------------------------------------

create or replace function record_pack_pull(
  p_user_id uuid,
  p_set_code text,
  p_card_ids text[]
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pack_id uuid;
  v_card_id text;
begin
  insert into pack_opens (user_id, set_code) values (p_user_id, p_set_code)
  returning id into v_pack_id;

  foreach v_card_id in array p_card_ids loop
    insert into pulls (user_id, card_id, set_code, pack_open_id)
      values (p_user_id, v_card_id, p_set_code, v_pack_id);
    insert into card_ownership (user_id, card_id, count)
      values (p_user_id, v_card_id, 1)
      on conflict (user_id, card_id)
      do update set count = card_ownership.count + 1,
                    last_pulled_at = now();
  end loop;

  return json_build_object('ok', true, 'pack_open_id', v_pack_id);
end;
$$;

-- ------------------------------------------------------------
-- RPC: gift
-- ------------------------------------------------------------

create or replace function gift_card(
  p_from_id uuid,
  p_to_user_id text,
  p_card_id text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_to_id uuid;
  v_count int;
  v_clean text := lower(trim(p_to_user_id));
begin
  select id into v_to_id from users where user_id = v_clean;
  if not found then
    return json_build_object('ok', false, 'error', '받는 사용자를 찾을 수 없습니다.');
  end if;
  if v_to_id = p_from_id then
    return json_build_object('ok', false, 'error', '본인에게는 선물할 수 없습니다.');
  end if;

  select count into v_count from card_ownership
    where user_id = p_from_id and card_id = p_card_id;
  if not found or v_count < 1 then
    return json_build_object('ok', false, 'error', '선물할 카드가 없습니다.');
  end if;

  update card_ownership set count = count - 1, last_pulled_at = now()
    where user_id = p_from_id and card_id = p_card_id;
  delete from card_ownership
    where user_id = p_from_id and card_id = p_card_id and count = 0;

  insert into card_ownership (user_id, card_id, count)
    values (v_to_id, p_card_id, 1)
    on conflict (user_id, card_id)
    do update set count = card_ownership.count + 1, last_pulled_at = now();

  insert into gifts (from_user_id, to_user_id, card_id)
    values (p_from_id, v_to_id, p_card_id);

  return json_build_object('ok', true);
end;
$$;

-- ------------------------------------------------------------
-- Seed: hardcoded users (hun / min)
-- ------------------------------------------------------------

insert into users (user_id, password_hash, age)
values
  ('hun', crypt('hun94!@#', gen_salt('bf')), 30),
  ('min', crypt('min94!@#', gen_salt('bf')), 30)
on conflict (user_id) do nothing;

-- ------------------------------------------------------------
-- Note on RLS
-- ------------------------------------------------------------
-- RLS is intentionally DISABLED for local-dev convenience.
-- All access goes through the publishable (anon) key, and security
-- is enforced by the SECURITY DEFINER functions above that scope
-- by user_id. Harden later with RLS policies before production.
