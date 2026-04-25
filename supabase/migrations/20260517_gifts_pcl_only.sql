-- ============================================================
-- 선물 시스템 — PCL 슬랩 전용으로 전환.
--
-- 기존: gifts.card_id 가 card_ownership 의 카드 한 장을 가리켰고,
--        send 시점에 sender 의 ownership 을 차감해 escrow 처럼 보관.
-- 신규: gifts.grading_id 가 psa_gradings 한 슬랩을 가리킴.
--        send 시점엔 슬랩의 user_id 를 그대로 두되 pending 상태로 lock,
--        accept 시 recipient 로 ownership 이전, decline/expire 시 그대로 유지.
--
-- 호환성: 마이그레이션 시점에 남아있는 card_id 기반 pending 선물은
-- 모두 expired 처리하고 sender 의 card_ownership 으로 환원해
-- 깨진 상태가 남지 않도록 한다. card_id 컬럼은 NULL 허용으로 풀어
-- 과거 settled (accepted/declined/expired) 행은 그대로 보존.
-- ============================================================

-- 1) 컬럼 정리 ------------------------------------------------
alter table gifts add column if not exists grading_id uuid
  references psa_gradings(id) on delete cascade;

alter table gifts alter column card_id drop not null;

create index if not exists gifts_pending_grading_idx
  on gifts(grading_id)
  where status = 'pending';

-- 2) 호환성: 기존 card_id 기반 pending 선물 만료 처리 ----------
-- 새 흐름과 충돌하지 않도록 카드 환원 후 expired 로 마감.
do $$
declare
  v_gift gifts%rowtype;
begin
  for v_gift in
    select * from gifts
      where status = 'pending'
        and grading_id is null
        and card_id is not null
      for update
  loop
    insert into card_ownership (user_id, card_id, count)
      values (v_gift.from_user_id, v_gift.card_id, 1)
      on conflict (user_id, card_id)
      do update set count = card_ownership.count + 1, last_pulled_at = now();
    update gifts
       set status = 'expired',
           settled_at = now()
     where id = v_gift.id;
  end loop;
end;
$$;

-- 3) 옛 시그니처 정리 -----------------------------------------
-- card_id 기반 create_gift / gift_card 는 사용하지 않으므로 drop.
drop function if exists create_gift(uuid, text, text, int);
drop function if exists create_gift(uuid, text, text, int, text);
drop function if exists gift_card(uuid, text, text);

-- 4) create_gift — 슬랩 전용 ----------------------------------
create or replace function create_gift(
  p_from_id uuid,
  p_to_user_id text,
  p_grading_id uuid,
  p_price_points int,
  p_message text default null
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_to_id uuid;
  v_gift_id uuid;
  v_daily int;
  v_grading psa_gradings%rowtype;
  v_clean text := trim(coalesce(p_to_user_id, ''));
begin
  if length(v_clean) < 1 then
    return json_build_object('ok', false, 'error', '받는 사람 닉네임을 입력해 주세요.');
  end if;
  if coalesce(p_price_points, 0) < 0 then
    return json_build_object('ok', false, 'error', '가격은 0 이상이어야 합니다.');
  end if;

  select count(*) into v_daily from gifts
    where from_user_id = p_from_id
      and created_at > now() - interval '24 hours';
  if v_daily >= 5 then
    return json_build_object('ok', false, 'error', '하루 5회 선물 한도를 초과했어요.');
  end if;

  select id into v_to_id from users
    where lower(display_name) = lower(v_clean) limit 1;
  if not found then
    select id into v_to_id from users
      where user_id = lower(v_clean) limit 1;
  end if;
  if not found then
    return json_build_object('ok', false, 'error', '그 닉네임의 사용자를 찾을 수 없어요.');
  end if;
  if v_to_id = p_from_id then
    return json_build_object('ok', false, 'error', '본인에게는 선물할 수 없어요.');
  end if;

  select * into v_grading from psa_gradings
    where id = p_grading_id for update;
  if not found then
    return json_build_object('ok', false, 'error', '슬랩을 찾을 수 없어요.');
  end if;
  if v_grading.user_id <> p_from_id then
    return json_build_object('ok', false, 'error', '본인 소유 슬랩만 선물할 수 있어요.');
  end if;
  if v_grading.grade < 6 then
    return json_build_object('ok', false, 'error', 'PCL 6 이상 슬랩만 선물할 수 있어요.');
  end if;
  if exists (select 1 from showcase_cards c where c.grading_id = v_grading.id) then
    return json_build_object('ok', false, 'error', '센터에 전시 중인 슬랩은 선물할 수 없어요.');
  end if;
  if exists (
    select 1 from gifts
      where grading_id = v_grading.id
        and status = 'pending'
        and expires_at > now()
  ) then
    return json_build_object('ok', false, 'error', '이미 다른 선물에 사용 중인 슬랩이에요.');
  end if;

  insert into gifts (
      from_user_id, to_user_id, grading_id, card_id,
      status, price_points, expires_at, message)
    values (
      p_from_id, v_to_id, v_grading.id, v_grading.card_id,
      'pending', coalesce(p_price_points, 0),
      now() + interval '24 hours',
      nullif(trim(coalesce(p_message, '')), ''))
    returning id into v_gift_id;

  return json_build_object('ok', true, 'gift_id', v_gift_id,
    'daily_used', v_daily + 1, 'daily_limit', 5);
end;
$$;

-- 5) accept_gift — 슬랩 user_id 이전 -------------------------
create or replace function accept_gift(p_gift_id uuid, p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_gift gifts%rowtype;
  v_points int;
begin
  select * into v_gift from gifts where id = p_gift_id for update;
  if not found then
    return json_build_object('ok', false, 'error', '선물을 찾을 수 없어요.');
  end if;
  if v_gift.to_user_id <> p_user_id then
    return json_build_object('ok', false, 'error', '받을 권한이 없어요.');
  end if;
  if v_gift.status <> 'pending' then
    return json_build_object('ok', false, 'error', '이미 처리된 선물이에요.');
  end if;
  if v_gift.grading_id is null then
    update gifts set status = 'expired', settled_at = now() where id = p_gift_id;
    return json_build_object('ok', false, 'error', '구버전 선물입니다. 다시 보내달라고 요청해 주세요.');
  end if;
  if v_gift.expires_at <= now() then
    update gifts set status = 'expired', settled_at = now() where id = p_gift_id;
    return json_build_object('ok', false, 'error', '만료된 선물이에요.');
  end if;

  if not exists (
    select 1 from psa_gradings
      where id = v_gift.grading_id and user_id = v_gift.from_user_id
  ) then
    update gifts set status = 'expired', settled_at = now() where id = p_gift_id;
    return json_build_object('ok', false, 'error', '슬랩이 더 이상 존재하지 않아요.');
  end if;
  if exists (select 1 from showcase_cards c where c.grading_id = v_gift.grading_id) then
    return json_build_object('ok', false, 'error', '보낸 사람이 슬랩을 전시 중이에요.');
  end if;

  select points into v_points from users where id = p_user_id for update;
  if coalesce(v_points, 0) < v_gift.price_points then
    return json_build_object('ok', false, 'error', '포인트가 부족해요.');
  end if;

  if v_gift.price_points > 0 then
    update users set points = points - v_gift.price_points where id = p_user_id;
    update users set points = points + v_gift.price_points where id = v_gift.from_user_id;
  end if;

  update psa_gradings set user_id = p_user_id where id = v_gift.grading_id;

  update gifts
     set status = 'accepted',
         accepted_at = now(),
         settled_at = now()
   where id = p_gift_id;

  return json_build_object('ok', true);
end;
$$;

-- 6) decline_gift — 변동 없음, 슬랩 그대로 sender 보유 ---------
create or replace function decline_gift(p_gift_id uuid, p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_gift gifts%rowtype;
begin
  select * into v_gift from gifts where id = p_gift_id for update;
  if not found then
    return json_build_object('ok', false, 'error', '선물을 찾을 수 없어요.');
  end if;
  if v_gift.to_user_id <> p_user_id then
    return json_build_object('ok', false, 'error', '권한이 없어요.');
  end if;
  if v_gift.status <> 'pending' then
    return json_build_object('ok', false, 'error', '이미 처리된 선물이에요.');
  end if;

  update gifts set status = 'declined', settled_at = now() where id = p_gift_id;
  return json_build_object('ok', true);
end;
$$;

-- 7) cancel_gift — sender 가 직접 회수 -----------------------
create or replace function cancel_gift(p_gift_id uuid, p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_gift gifts%rowtype;
begin
  select * into v_gift from gifts where id = p_gift_id for update;
  if not found then
    return json_build_object('ok', false, 'error', '선물을 찾을 수 없어요.');
  end if;
  if v_gift.from_user_id <> p_user_id then
    return json_build_object('ok', false, 'error', '권한이 없어요.');
  end if;
  if v_gift.status <> 'pending' then
    return json_build_object('ok', false, 'error', '이미 처리된 선물이에요.');
  end if;

  update gifts set status = 'declined', settled_at = now() where id = p_gift_id;
  return json_build_object('ok', true);
end;
$$;

-- 8) expire_pending_gifts — 슬랩 흐름엔 환원할 게 없음 -------
create or replace function expire_pending_gifts()
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_count int := 0;
begin
  update gifts
     set status = 'expired',
         settled_at = now()
   where status = 'pending'
     and expires_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 9) Grants ---------------------------------------------------
grant execute on function create_gift(uuid, text, uuid, int, text) to anon, authenticated;
grant execute on function accept_gift(uuid, uuid) to anon, authenticated;
grant execute on function decline_gift(uuid, uuid) to anon, authenticated;
grant execute on function cancel_gift(uuid, uuid) to anon, authenticated;
grant execute on function expire_pending_gifts() to anon, authenticated;

notify pgrst, 'reload schema';
