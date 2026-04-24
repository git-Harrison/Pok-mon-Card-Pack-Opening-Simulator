-- ============================================================
-- Add users.display_name (닉네임).
-- Display everywhere (ranking, gifts, discord). Login still uses
-- user_id; nicknames are unique case-insensitive.
-- Idempotent.
-- ============================================================

alter table users add column if not exists display_name text;

-- Backfill existing rows (use capitalised user_id as default nickname)
update users
   set display_name = initcap(user_id)
 where display_name is null;

-- Enforce non-null + uniqueness (case-insensitive)
alter table users alter column display_name set not null;

create unique index if not exists users_display_name_lower_unique
  on users (lower(display_name));

-- ------------------------------------------------------------
-- auth_signup (now requires nickname)
-- ------------------------------------------------------------
create or replace function auth_signup(
  p_user_id text,
  p_password text,
  p_age int,
  p_display_name text default null
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
  v_clean text := lower(trim(p_user_id));
  v_nick text := trim(coalesce(p_display_name, ''));
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
  if length(v_nick) < 1 or length(v_nick) > 20 then
    return json_build_object('ok', false, 'error', '닉네임은 1~20자여야 합니다.');
  end if;
  if exists (select 1 from users where user_id = v_clean) then
    return json_build_object('ok', false, 'error', '이미 사용 중인 아이디입니다.');
  end if;
  if exists (select 1 from users where lower(display_name) = lower(v_nick)) then
    return json_build_object('ok', false, 'error', '이미 사용 중인 닉네임이에요.');
  end if;

  insert into users (user_id, password_hash, age, display_name)
  values (v_clean, crypt(p_password, gen_salt('bf')), p_age, v_nick)
  returning id into v_id;

  return json_build_object('ok', true,
    'user', json_build_object(
      'id', v_id,
      'user_id', v_clean,
      'age', p_age,
      'display_name', v_nick
    ));
end;
$$;

-- ------------------------------------------------------------
-- auth_login — now returns display_name too
-- ------------------------------------------------------------
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
    'user', json_build_object(
      'id', v_user.id,
      'user_id', v_user.user_id,
      'age', v_user.age,
      'display_name', v_user.display_name
    ));
end;
$$;

-- ------------------------------------------------------------
-- create_gift — lookup recipient by nickname first, then fall back
-- to user_id so old clients still work.
-- ------------------------------------------------------------
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
  if v_daily >= 3 then
    return json_build_object('ok', false, 'error', '하루 3회 선물 한도를 초과했어요.');
  end if;
  if coalesce(p_price_points, 0) < 0 then
    return json_build_object('ok', false, 'error', '가격은 0 이상이어야 합니다.');
  end if;

  -- nickname first (case-insensitive), then user_id
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
    'daily_used', v_daily + 1, 'daily_limit', 3);
end;
$$;

-- ------------------------------------------------------------
-- get_user_rankings — include display_name
-- ------------------------------------------------------------
create or replace function get_user_rankings()
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_rows json;
begin
  select coalesce(
    json_agg(r order by r.rank_score desc, r.points desc),
    '[]'::json
  )
    into v_rows
  from (
    select
      u.id,
      u.user_id,
      u.display_name,
      u.age,
      u.points,
      coalesce(sum(case
        when g.grade = 10 then 1000
        when g.grade = 9 then 500
        when g.grade = 8 then 200
        when g.grade in (6, 7) then 100
        else 0
      end), 0)::int as rank_score,
      coalesce(count(g.id), 0)::int as psa_count,
      coalesce(sum(case when g.grade = 10 then 1 else 0 end), 0)::int as psa_10,
      coalesce(sum(case when g.grade = 9 then 1 else 0 end), 0)::int as psa_9,
      coalesce(sum(case when g.grade = 8 then 1 else 0 end), 0)::int as psa_8,
      coalesce(sum(case when g.grade = 7 then 1 else 0 end), 0)::int as psa_7,
      coalesce(sum(case when g.grade = 6 then 1 else 0 end), 0)::int as psa_6,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', g.id,
            'card_id', g.card_id,
            'grade', g.grade,
            'graded_at', g.graded_at
          )
          order by g.grade desc, g.graded_at desc
        ) filter (where g.id is not null),
        '[]'::jsonb
      ) as gradings
    from users u
    left join psa_gradings g on g.user_id = u.id
    group by u.id
  ) r;
  return v_rows;
end;
$$;

-- ------------------------------------------------------------
-- fetchGifts support: we expose display_name via the gifts SELECT so
-- the client already gets to:user_id. Update nothing in schema here
-- since the client uses its own select() — see db.ts.
-- ------------------------------------------------------------

grant execute on function auth_signup(text, text, int, text) to anon, authenticated;
grant execute on function auth_login(text, text) to anon, authenticated;
grant execute on function create_gift(uuid, text, text, int, text) to anon, authenticated;
grant execute on function get_user_rankings() to anon, authenticated;

notify pgrst, 'reload schema';
