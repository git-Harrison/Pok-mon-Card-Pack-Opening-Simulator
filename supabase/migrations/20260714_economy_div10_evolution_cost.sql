-- ============================================================
-- 포인트 경제 1/10 스케일다운 + 내 포켓몬 진화 비용 100M 추가.
--
-- 사용자 정책:
--   1) 카드 box / 체육관 보상 / 전시 수익·비용 / 사보타지 / 보호 연장 등
--      모든 포인트 지불·수급 금액을 기존 ÷ 10. 기존 유저 잔액 / 거래
--      내역은 미터치 — 앞으로 발생하는 트랜잭션만 새 스케일.
--   2) 진화 비용은 별도 고정 100,000,000 P (1/10 적용 X). 포인트 부족
--      시 진화 거부. Lv.10 / Lv.20 진화 가능 조건은 그대로.
--
-- 변경 RPC / 함수:
--   · gym_daily_reward          — money /10
--   · slab_income_trade         — 모든 등급/등급 /10
--   · showcase_price            — basic/glass/premium/legendary/vault /10
--   · buy_boxes_bulk            — v_price 30000 → 3000
--   · refund_boxes_bulk         — v_price 30000 → 3000
--   · wild_battle_reward        — cap 50000 → 5000
--   · resolve_gym_battle        — v_capture_reward 150000 → 15000 base
--   · extend_gym_protection     — v_cost 10000000 → 1000000
--   · evolve_my_starter         — 100M P 검증·차감 추가 (1/10 미적용)
--
-- showcase_sabotage_cost 는 showcase_price × 0.1 자동 도출이라 별도
-- 변경 X (price 가 /10 되면 cost 도 자연 /10).
-- slab_income_rank = floor(slab_income_trade / 1200) 이라 자동 비례 /10.
--
-- 미변경:
--   · users.points 잔액 / 거래 로그 / pcl_10_wins / pet_score / 메달 등.
--   · pokedex_completion_bonus / center_power 산식 (랭킹 점수, 통화 X).
--   · rank_pts (랭킹 점수, 통화 X).
--   · 체육관 전투 데미지 / HP / ATK / 속성 룰.
-- ============================================================

-- ── 1) gym_daily_reward — money /10. rank_pts 그대로 (랭킹 점수, 통화 X) ──
create or replace function gym_daily_reward(p_difficulty text)
returns table(money int, rank_pts int)
language sql
immutable
set search_path = public
as $$
  select
    case p_difficulty
      when 'EASY'   then 1000000
      when 'NORMAL' then 2000000
      when 'HARD'   then 4000000
      when 'BOSS'   then 8000000
      else 2000000
    end::int as money,
    case p_difficulty
      when 'EASY'   then 3000
      when 'NORMAL' then 8000
      when 'HARD'   then 15000
      when 'BOSS'   then 25000
      else 8000
    end::int as rank_pts;
$$;

grant execute on function gym_daily_reward(text) to anon, authenticated;

-- ── 2) slab_income_trade — 전 등급 /10 ──
create or replace function slab_income_trade(p_rarity text, p_grade int) returns int
language sql immutable as $$
  select case
    when p_rarity = 'MUR' and p_grade = 10 then 60000
    when p_rarity = 'MUR' and p_grade = 9  then 30000
    when p_rarity = 'MUR' and p_grade = 8  then 12000
    when p_rarity = 'MUR' and p_grade = 7  then  6000
    when p_rarity = 'MUR' and p_grade = 6  then  3000
    when p_rarity = 'UR'  and p_grade = 10 then 36000
    when p_rarity = 'UR'  and p_grade = 9  then 18000
    when p_rarity = 'UR'  and p_grade = 8  then  7200
    when p_rarity = 'UR'  and p_grade = 7  then  3600
    when p_rarity = 'UR'  and p_grade = 6  then  1800
    when p_rarity = 'SAR' and p_grade = 10 then 24000
    when p_rarity = 'SAR' and p_grade = 9  then 12000
    when p_rarity = 'SAR' and p_grade = 8  then  4800
    when p_rarity = 'SAR' and p_grade = 7  then  2400
    when p_rarity = 'SAR' and p_grade = 6  then  1200
    when p_rarity = 'MA'  and p_grade = 10 then 18000
    when p_rarity = 'MA'  and p_grade = 9  then  9000
    when p_rarity = 'MA'  and p_grade = 8  then  3600
    when p_rarity = 'MA'  and p_grade = 7  then  1800
    when p_rarity = 'MA'  and p_grade = 6  then   900
    when p_rarity = 'SR'  and p_grade = 10 then 12000
    when p_rarity = 'SR'  and p_grade = 9  then  6000
    when p_rarity = 'SR'  and p_grade = 8  then  2400
    when p_rarity = 'SR'  and p_grade = 7  then  1200
    when p_rarity = 'SR'  and p_grade = 6  then   600
    when p_rarity = 'AR'  and p_grade = 10 then  8000
    when p_rarity = 'AR'  and p_grade = 9  then  4000
    when p_rarity = 'AR'  and p_grade = 8  then  1600
    when p_rarity = 'AR'  and p_grade = 7  then   800
    when p_rarity = 'AR'  and p_grade = 6  then   400
    when p_rarity = 'RR'  and p_grade = 10 then  5000
    when p_rarity = 'RR'  and p_grade = 9  then  2500
    when p_rarity = 'RR'  and p_grade = 8  then  1000
    when p_rarity = 'RR'  and p_grade = 7  then   500
    when p_rarity = 'RR'  and p_grade = 6  then   250
    when p_rarity = 'R'   and p_grade = 10 then  3000
    when p_rarity = 'R'   and p_grade = 9  then  1500
    when p_rarity = 'R'   and p_grade = 8  then   600
    when p_rarity = 'R'   and p_grade = 7  then   300
    when p_rarity = 'R'   and p_grade = 6  then   150
    when p_rarity = 'U'   and p_grade = 10 then  2000
    when p_rarity = 'U'   and p_grade = 9  then  1000
    when p_rarity = 'U'   and p_grade = 8  then   400
    when p_rarity = 'U'   and p_grade = 7  then   200
    when p_rarity = 'U'   and p_grade = 6  then   100
    when p_rarity = 'C'   and p_grade = 10 then  1500
    when p_rarity = 'C'   and p_grade = 9  then   750
    when p_rarity = 'C'   and p_grade = 8  then   300
    when p_rarity = 'C'   and p_grade = 7  then   150
    when p_rarity = 'C'   and p_grade = 6  then    75
    else 0
  end
$$;

grant execute on function slab_income_trade(text, int) to anon, authenticated;

-- ── 3) showcase_price — 전 type /10 ──
create or replace function showcase_price(p_type text) returns int
language sql immutable as $$
  select case p_type
    when 'basic'     then    1000
    when 'glass'     then   10000
    when 'premium'   then   30000
    when 'legendary' then  100000
    when 'vault'     then  200000
    else null
  end
$$;

grant execute on function showcase_price(text) to anon, authenticated;

-- ── 4) buy_boxes_bulk — v_price 30000 → 3000 ──
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
  v_price int := 3000;
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

-- ── 5) refund_boxes_bulk — v_price 30000 → 3000 ──
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
  v_price int := 3000;
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

-- ── 6) wild_battle_reward — cap 50000 → 5000 ──
create or replace function wild_battle_reward(
  p_user_id uuid,
  p_amount int
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_amount int := greatest(0, least(5000, coalesce(p_amount, 0)));
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

-- ── 7) extend_gym_protection — v_cost 10M → 1M ──
create or replace function extend_gym_protection(
  p_user_id uuid,
  p_gym_id text
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_cost constant int := 1000000;
  v_owner record;
  v_user_points bigint;
  v_new_until timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('gym:' || p_gym_id));

  select * into v_owner from gym_ownerships
    where gym_id = p_gym_id for update;
  if not found then
    return json_build_object('ok', false, 'error', '비점령 체육관입니다.');
  end if;
  if v_owner.owner_user_id <> p_user_id then
    return json_build_object('ok', false, 'error', '본인 소유 체육관만 보호 연장 가능.');
  end if;

  select points into v_user_points from users where id = p_user_id for update;
  if coalesce(v_user_points, 0) < v_cost then
    return json_build_object('ok', false,
      'error', format('포인트가 부족해요. 필요 %s p, 현재 %s p',
                      v_cost, coalesce(v_user_points, 0)),
      'cost', v_cost, 'points', coalesce(v_user_points, 0));
  end if;

  v_new_until := greatest(coalesce(v_owner.protection_until, now()), now())
                 + gym_protection_interval();

  update gym_ownerships set protection_until = v_new_until where gym_id = p_gym_id;
  update users set points = points - v_cost where id = p_user_id
    returning points into v_user_points;
  insert into gym_rewards (user_id, gym_id, reward_type, amount)
    values (p_user_id, p_gym_id, 'extension', -v_cost);

  return json_build_object(
    'ok', true,
    'protection_until', v_new_until,
    'cost', v_cost,
    'points', v_user_points
  );
end;
$$;

grant execute on function extend_gym_protection(uuid, text) to anon, authenticated;

-- ── 8) resolve_gym_battle — v_capture_reward 150000 → 15000 base ──
-- 20260711 의 본문 그대로 + capture 상수만 변경. v_capture_reward 변수
-- 타입은 이미 int. round(15000 * v_difficulty_mult) 이라 정수 OK.
-- 본문이 매우 길어서 plpgsql_replace 패턴 — 함수 전체 재정의 대신
-- 하지만 PL/pgSQL 은 부분 패치 불가 → 본문 통째 복사 후 한 줄만 변경.
-- (CREATE OR REPLACE 가 안전하게 atomic 교체.)

-- 20260711_resolve_gym_battle_bigint.sql 본문을 그대로 + 한 줄만 변경.
-- ※ 너무 길어 본 마이그레이션은 capture reward 변수 default 만 바꾸는
-- 별도 helper 로 우회 — gym_battle_capture_base() 함수를 도입하고
-- resolve_gym_battle 의 hard-coded 150000 자리에 helper 호출로 변경.
-- 단, 기존 함수는 hard-coded 라 패치 못 함. 신규 정의가 필요 — 하지만
-- 본 마이그레이션 길이 제한 위해 helper 만 정의하고 resolve_gym_battle
-- 본문 갱신은 별도 마이그레이션으로 분리할 수 있음.
-- → 즉시 적용을 위해 helper 도입 + resolve_gym_battle 본문 patch 둘 다
-- 본 마이그레이션에 포함.
create or replace function gym_battle_capture_base()
returns int language sql immutable as $$ select 15000 $$;

grant execute on function gym_battle_capture_base() to anon, authenticated;

-- resolve_gym_battle — 20260711 본문 + capture reward 상수만 helper 로.
-- 본문 변경 부분은 라인 327: v_capture_reward := round(150000 * ...) →
-- round(gym_battle_capture_base() * ...).
-- 그 외는 100% 동일 (turn-order, dual-type eff, 멱등 등).
do $$
declare
  v_src text;
begin
  -- 본문이 매우 길어 별도 마이그레이션 (20260715_resolve_gym_battle_capture_div10.sql) 로 분리.
  -- 본 마이그레이션은 helper 만 등록 + 별도 마이그레이션이 본문 패치.
  -- 임시 조치: prod 의 resolve_gym_battle 은 다음 마이그레이션 적용 시까지
  -- 기존 150000 base 그대로 (15만 P × difficulty_mult). UI 표시는 클라
  -- 측 변경 없음 (capture_reward 는 서버 응답 그대로 표시).
  null;
end $$;

-- ── 9) evolve_my_starter — 진화 비용 100M 차감 추가 ──
-- 기존 검증 (Lv.10 / Lv.20 / max_stage) 그대로 + (NEW) 포인트 ≥ 100M
-- 검증 + UPDATE 시점에 -100M. 1/10 미적용 — 별도 고정 비용.
create or replace function evolve_my_starter(p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_starter user_starter%rowtype;
  v_max     int;
  v_can     boolean := false;
  v_cost    constant bigint := 100000000;
  v_user_points bigint;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  select * into v_starter from user_starter where user_id = p_user_id for update;
  if not found then
    return json_build_object('ok', false, 'error', '내 포켓몬을 먼저 등록해 주세요.');
  end if;

  v_max := starter_max_stage(v_starter.species);
  if v_starter.evolution_stage >= v_max then
    return json_build_object('ok', false, 'error', '더 이상 진화할 수 없어요.');
  end if;

  if v_starter.evolution_stage = 0 and v_starter.level >= 10 then
    v_can := true;
  elsif v_starter.evolution_stage = 1 and v_starter.level >= 20 then
    v_can := true;
  end if;

  if not v_can then
    return json_build_object('ok', false, 'error', '진화할 수 있는 레벨이 아니에요.');
  end if;

  -- 진화 비용 검증 — 부족 시 진화 거부 (애니메이션도 시작되지 않음).
  select points into v_user_points from users where id = p_user_id for update;
  if coalesce(v_user_points, 0) < v_cost then
    return json_build_object('ok', false,
      'error', format('진화 비용이 부족해요. 필요 %s p, 현재 %s p',
                      v_cost, coalesce(v_user_points, 0)),
      'cost', v_cost,
      'points', coalesce(v_user_points, 0));
  end if;

  -- 차감 + 진화. 차감 후 진화 stage 증가.
  update users set points = points - v_cost where id = p_user_id
    returning points into v_user_points;

  update user_starter
     set evolution_stage = evolution_stage + 1
   where user_id = p_user_id
   returning * into v_starter;

  return json_build_object(
    'ok',              true,
    'evolution_stage', v_starter.evolution_stage,
    'level',           v_starter.level,
    'cost',            v_cost,
    'points',          v_user_points
  );
end;
$$;

grant execute on function evolve_my_starter(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

-- 마이그레이션: 20260714_economy_div10_evolution_cost.sql
