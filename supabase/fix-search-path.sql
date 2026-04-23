-- Supabase installs pgcrypto in the `extensions` schema. Include it in the
-- function search_path so crypt() and gen_salt() resolve from SECURITY DEFINER
-- functions called through PostgREST.

create or replace function auth_signup(p_user_id text, p_password text, p_age int)
returns json
language plpgsql
security definer
set search_path = public, extensions
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
set search_path = public, extensions
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

-- Reseed the hardcoded users (in case the original bcrypt call in schema.sql failed silently)
delete from users where user_id in ('hun', 'min');
insert into users (user_id, password_hash, age)
values
  ('hun', crypt('hun94!@#', gen_salt('bf')), 30),
  ('min', crypt('min94!@#', gen_salt('bf')), 30);

notify pgrst, 'reload schema';
