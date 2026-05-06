-- ============================================================
-- "integer out of range" 픽스 — users 누적 컬럼 + 핵심 RPC 변수 BIGINT 승격.
--
-- 사용자 보고: hun 의 누적 points 가 INT max(2,147,483,647) 도달 →
-- 모든 RPC 가 'integer out of range' / statement timeout 으로 실패 →
-- 페이지 전체 렌더 안 됨 (CORS 522 chain). prod 에선 SQL Editor 에서
-- 즉시 ALTER 적용 완료. 이 마이그레이션은:
--   1) 동일 ALTER 를 다른 환경(dev/staging)에도 멱등 적용.
--   2) 핵심 RPC 의 "RETURNING points INTO v_*" 변수가 INT 라 BIGINT
--      컬럼 값을 받을 때 다시 overflow 나는 회귀를 차단.
--
-- 적용 함수 (자주 호출되는 적립/차감):
--   - claim_gym_daily        (일일 보상 80M/day — 누적 주범)
--   - wild_battle_reward     (야생 승리 보상)
--   - buy_boxes_bulk         (박스 구매 차감)
--   - refund_boxes_bulk      (환불 가산)
--
-- 별도 마이그레이션 (대량 본문) — resolve_gym_battle 은 다음 커밋에서.
-- 우선 fix 가장 시급한 4개만 동봉.
--
-- 멱등 — 컬럼 타입 체크 후 ALTER, 함수는 CREATE OR REPLACE.
-- ============================================================

-- 1) users 누적 컬럼 INT → BIGINT (이미 BIGINT 면 no-op).
do $$
declare
  v_t text;
  v_col record;
begin
  for v_col in select unnest(array['points','gym_daily_rank_pts','pet_score']) as c
  loop
    select data_type into v_t
      from information_schema.columns
     where table_schema='public' and table_name='users'
       and column_name = v_col.c;
    if v_t = 'integer' then
      execute format('alter table users alter column %I type bigint', v_col.c);
      raise notice 'users.% : integer → bigint', v_col.c;
    end if;
  end loop;
end$$;

-- 2) claim_gym_daily — v_new_points int → bigint.
create or replace function claim_gym_daily(
  p_user_id uuid,
  p_gym_id text
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_owner record;
  v_gym record;
  v_last_claim timestamptz;
  v_money int;
  v_rank_pts int;
  v_new_points bigint;
  v_seconds_left int;
begin
  if p_user_id is null or p_gym_id is null then
    return json_build_object('ok', false, 'error', '요청이 올바르지 않아요.');
  end if;

  perform pg_advisory_xact_lock(hashtext('gym:daily:' || p_gym_id));

  select * into v_gym from gyms where id = p_gym_id;
  if not found then
    return json_build_object('ok', false, 'error', '체육관을 찾을 수 없어요.');
  end if;
  select money, rank_pts into v_money, v_rank_pts
    from gym_daily_reward(v_gym.difficulty);

  select * into v_owner from gym_ownerships
    where gym_id = p_gym_id for update;
  if not found then
    return json_build_object('ok', false, 'error', '비점령 체육관입니다.');
  end if;
  if v_owner.owner_user_id <> p_user_id then
    return json_build_object('ok', false, 'error', '체육관 소유자만 청구 가능합니다.');
  end if;

  select max(claimed_at) into v_last_claim
    from gym_rewards
   where gym_id = p_gym_id and reward_type = 'daily';
  if v_last_claim is not null
     and v_last_claim > now() - interval '24 hours'
  then
    v_seconds_left := ceil(extract(epoch from (
      v_last_claim + interval '24 hours' - now()
    )))::int;
    return json_build_object(
      'ok', false,
      'error', '체육관 일일 보상 쿨타임 중이에요.',
      'next_claim_at', v_last_claim + interval '24 hours',
      'seconds_left', greatest(v_seconds_left, 0)
    );
  end if;

  update users
     set points = points + v_money,
         gym_daily_rank_pts = gym_daily_rank_pts + v_rank_pts
   where id = p_user_id
   returning points into v_new_points;
  insert into gym_rewards (user_id, gym_id, reward_type, amount)
    values (p_user_id, p_gym_id, 'daily', v_money);

  return json_build_object(
    'ok', true,
    'gym_id', p_gym_id,
    'difficulty', v_gym.difficulty,
    'money', v_money,
    'rank_points', v_rank_pts,
    'points', v_new_points,
    'next_claim_at', now() + interval '24 hours');
end;
$$;

grant execute on function claim_gym_daily(uuid, text) to anon, authenticated;

-- 3) wild_battle_reward — v_new_points int → bigint.
create or replace function wild_battle_reward(
  p_user_id uuid,
  p_amount int
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_amount int := greatest(0, least(50000, coalesce(p_amount, 0)));
  v_new_points bigint;
begin
  update users
     set points = points + v_amount,
         wild_wins = wild_wins + 1
   where id = p_user_id
   returning points into v_new_points;

  insert into wild_battles_log (user_id, prize_points, rank_points)
    values (p_user_id, v_amount, 100);

  return json_build_object(
    'ok', true,
    'awarded', v_amount,
    'rank_points', 100,
    'points', v_new_points
  );
end;
$$;

grant execute on function wild_battle_reward(uuid, int) to anon, authenticated;

-- 4) buy_boxes_bulk — v_points int → bigint.
create or replace function buy_boxes_bulk(
  p_user_id uuid,
  p_set_code text,
  p_count int
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_price int := 30000;
  v_count int := coalesce(p_count, 0);
  v_total int;
  v_points bigint;
begin
  if v_count <= 0 then
    return json_build_object('ok', false, 'error', '박스 개수가 올바르지 않아요.');
  end if;
  if v_count > 100 then
    return json_build_object('ok', false,
      'error', '한 번에 최대 100박스까지 구매할 수 있어요.');
  end if;

  v_total := v_price * v_count;

  select points into v_points from users where id = p_user_id for update;
  if coalesce(v_points, 0) < v_total then
    return json_build_object(
      'ok', false,
      'error', format('포인트가 부족해요. 필요 %s p, 보유 %s p',
                      v_total, coalesce(v_points, 0)),
      'price', v_price,
      'count', v_count,
      'total_spent', v_total,
      'points', coalesce(v_points, 0)
    );
  end if;

  update users set points = points - v_total where id = p_user_id;

  return json_build_object(
    'ok', true,
    'price', v_price,
    'count', v_count,
    'total_spent', v_total,
    'points', v_points - v_total
  );
end;
$$;

grant execute on function buy_boxes_bulk(uuid, text, int) to anon, authenticated;

-- 5) refund_boxes_bulk — v_new_points int → bigint.
create or replace function refund_boxes_bulk(
  p_user_id uuid,
  p_set_code text,
  p_count int
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_price int := 30000;
  v_count int := coalesce(p_count, 0);
  v_total int;
  v_new_points bigint;
begin
  if v_count <= 0 then
    return json_build_object('ok', false, 'error', '환불 개수가 올바르지 않아요.');
  end if;

  v_total := v_price * v_count;

  update users set points = points + v_total
    where id = p_user_id
    returning points into v_new_points;

  return json_build_object(
    'ok', true,
    'refunded', v_total,
    'count', v_count,
    'points', v_new_points
  );
end;
$$;

grant execute on function refund_boxes_bulk(uuid, text, int) to anon, authenticated;

notify pgrst, 'reload schema';
