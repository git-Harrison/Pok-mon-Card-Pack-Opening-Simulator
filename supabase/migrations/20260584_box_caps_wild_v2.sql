-- ============================================================
-- 박스/한도/야생 v2 — 사용자 요청 통합 패치
--
-- 1) buy_box / refund_box_purchase: 모든 세트 박스 가격 70,000p 균일.
--    클라 BOX_COST 와 동기화 필수 (src/lib/rarity.ts).
-- 2) record_pack_pulls_batch / record_pack_pull_v4: 일반 카드 보유
--    한도 20,000 → 50,000.
-- 3) bulk_submit_psa_grading / assert_pcl_cap: PCL 슬랩 한도
--    20,000 → 50,000.
-- 4) wild_battles_log 테이블 신설 — 야생 승리마다 1 row 기록 (랭킹
--    포인트 산정과 활동 피드 노출에 사용). wild_battle_reward 가
--    insert 도 함께.
-- 5) users.wild_cooldown_until 컬럼 추가 — 패배 시 30초 서버 권위
--    쿨타임. 페이지 이탈/재방문해도 유지.
-- 6) wild_battle_loss: 쿨타임 셋팅 + 응답에 cooldown_until 포함.
-- 7) get_wild_cooldown(p_user_id) RPC — 클라 mount 시 쿨타임 조회.
-- 8) get_user_activity rank 탭에 야생 승리 이벤트(+50 랭킹) 추가.
--
-- 모든 DDL 멱등 (`create or replace`, `add column if not exists`,
-- `create table if not exists`).
-- ============================================================

-- 1) buy_box / refund_box_purchase — 70,000p 균일
create or replace function buy_box(
  p_user_id uuid,
  p_set_code text
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_price int := 70000;
  v_points int;
begin
  select points into v_points from users where id = p_user_id for update;
  if coalesce(v_points, 0) < v_price then
    return json_build_object(
      'ok', false,
      'error', format('포인트가 부족해요. 박스 가격: %s p, 현재: %s p',
                      v_price, coalesce(v_points, 0)),
      'price', v_price,
      'points', coalesce(v_points, 0)
    );
  end if;

  update users set points = points - v_price where id = p_user_id;
  return json_build_object('ok', true,
    'price', v_price,
    'points', v_points - v_price);
end;
$$;

grant execute on function buy_box(uuid, text) to anon, authenticated;

create or replace function refund_box_purchase(
  p_user_id uuid,
  p_set_code text
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_cost int := 70000;
  v_new_points int;
begin
  update users set points = points + v_cost
    where id = p_user_id
    returning points into v_new_points;
  return json_build_object(
    'ok', true,
    'refunded', v_cost,
    'points', v_new_points
  );
end;
$$;

grant execute on function refund_box_purchase(uuid, text) to anon, authenticated;

-- 2) 일반 카드 보유 한도 50,000 — record_pack_pulls_batch / v4
create or replace function record_pack_pull_v4(
  p_user_id uuid,
  p_set_code text,
  p_card_ids text[],
  p_rarities text[],
  p_auto_sell_sub_ar boolean
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pack_id uuid;
  v_current int;
  v_kept_count int := 0;
  v_sold_count int := 0;
  v_sold_payout int := 0;
  v_new_points int;
  v_total int;
  v_idx int;
  v_kept_ids text[] := array[]::text[];
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  v_total := coalesce(array_length(p_card_ids, 1), 0);
  if v_total = 0 then
    return json_build_object('ok', false, 'error', '카드가 없어요.');
  end if;
  if p_rarities is null or coalesce(array_length(p_rarities, 1), 0) <> v_total then
    return json_build_object('ok', false, 'error', '레어도 정보가 일치하지 않아요.');
  end if;

  for v_idx in 1..v_total loop
    if p_auto_sell_sub_ar and is_sub_ar(p_rarities[v_idx]) then
      v_sold_count := v_sold_count + 1;
      v_sold_payout := v_sold_payout + bulk_sell_price(p_rarities[v_idx]);
    else
      v_kept_ids := v_kept_ids || p_card_ids[v_idx];
      v_kept_count := v_kept_count + 1;
    end if;
  end loop;

  select coalesce(sum(count), 0)::int
    into v_current
    from card_ownership
   where user_id = p_user_id;

  if v_current + v_kept_count > 50000 then
    raise exception
      '지갑 보유 한도 초과 — 현재 %장 / 50,000장. 팔거나 감별/전시로 정리한 뒤 다시 시도하세요.',
      v_current
      using errcode = 'P0001';
  end if;

  insert into pack_opens (user_id, set_code)
    values (p_user_id, p_set_code)
    returning id into v_pack_id;

  insert into pulls (user_id, card_id, set_code, pack_open_id)
  select p_user_id, c, p_set_code, v_pack_id
    from unnest(p_card_ids) as c;

  if v_kept_count > 0 then
    insert into card_ownership (user_id, card_id, count, last_pulled_at)
    select p_user_id, c, count(*)::int, now()
      from unnest(v_kept_ids) as c
     group by c
    on conflict (user_id, card_id) do update
      set count = card_ownership.count + excluded.count,
          last_pulled_at = now();
  end if;

  if v_sold_payout > 0 then
    update users set points = points + v_sold_payout
      where id = p_user_id
      returning points into v_new_points;
  else
    select points into v_new_points from users where id = p_user_id;
  end if;

  return json_build_object('ok', true,
    'pack_open_id', v_pack_id,
    'sold_count', v_sold_count,
    'sold_earned', v_sold_payout,
    'kept_count', v_kept_count,
    'points', v_new_points);
end;
$$;

grant execute on function record_pack_pull_v4(uuid, text, text[], text[], boolean) to anon, authenticated;

create or replace function record_pack_pulls_batch(
  p_user_id uuid,
  p_set_code text,
  p_pulls jsonb,
  p_auto_sell_rarities text[]
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pack_count int;
  v_total_kept int := 0;
  v_total_sold_count int := 0;
  v_total_sold_payout int := 0;
  v_current int;
  v_new_points int;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  if p_pulls is null or jsonb_typeof(p_pulls) <> 'array' then
    return json_build_object('ok', false, 'error', '팩 데이터가 없어요.');
  end if;

  v_pack_count := jsonb_array_length(p_pulls);
  if v_pack_count = 0 then
    return json_build_object('ok', false, 'error', '팩 데이터가 비어 있어요.');
  end if;

  create temporary table tmp_pack_cards (
    pack_seq int not null,
    card_id text not null,
    rarity text not null,
    is_kept boolean not null
  ) on commit drop;

  insert into tmp_pack_cards (pack_seq, card_id, rarity, is_kept)
  with packs as (
    select
      (ord - 1)::int as pack_seq,
      pack_obj
    from jsonb_array_elements(p_pulls) with ordinality as t(pack_obj, ord)
  ),
  flattened as (
    select
      p.pack_seq,
      c.card_id,
      r.rarity,
      c.idx
    from packs p
    cross join lateral (
      select value::text as card_id, ord as idx
      from jsonb_array_elements_text(p.pack_obj->'card_ids') with ordinality as t(value, ord)
    ) c
    cross join lateral (
      select value::text as rarity, ord as idx
      from jsonb_array_elements_text(p.pack_obj->'rarities') with ordinality as t(value, ord)
    ) r
    where c.idx = r.idx
  )
  select
    pack_seq,
    card_id,
    rarity,
    not (p_auto_sell_rarities is not null and rarity = any(p_auto_sell_rarities)) as is_kept
  from flattened;

  select count(*) filter (where is_kept), count(*) filter (where not is_kept),
         coalesce(sum(case when not is_kept then bulk_sell_price(rarity) else 0 end), 0)
    into v_total_kept, v_total_sold_count, v_total_sold_payout
    from tmp_pack_cards;

  select coalesce(sum(count), 0)::int
    into v_current
    from card_ownership
   where user_id = p_user_id;

  if v_current + v_total_kept > 50000 then
    raise exception
      '지갑 보유 한도 초과 — 현재 %장 / 50,000장. 팔거나 감별/전시로 정리한 뒤 다시 시도하세요.',
      v_current
      using errcode = 'P0001';
  end if;

  create temporary table tmp_pack_ids (
    pack_seq int primary key,
    pack_open_id uuid not null default gen_random_uuid()
  ) on commit drop;

  insert into tmp_pack_ids (pack_seq)
  select distinct pack_seq from tmp_pack_cards;

  insert into pack_opens (id, user_id, set_code)
  select pack_open_id, p_user_id, p_set_code from tmp_pack_ids;

  insert into pulls (user_id, card_id, set_code, pack_open_id)
  select p_user_id, t.card_id, p_set_code, ids.pack_open_id
    from tmp_pack_cards t
    join tmp_pack_ids ids on ids.pack_seq = t.pack_seq;

  if v_total_kept > 0 then
    insert into card_ownership (user_id, card_id, count, last_pulled_at)
    select p_user_id, card_id, count(*)::int, now()
      from tmp_pack_cards
     where is_kept
     group by card_id
    on conflict (user_id, card_id) do update
      set count = card_ownership.count + excluded.count,
          last_pulled_at = now();
  end if;

  if v_total_sold_payout > 0 then
    update users set points = points + v_total_sold_payout
      where id = p_user_id
      returning points into v_new_points;
  else
    select points into v_new_points from users where id = p_user_id;
  end if;

  return json_build_object('ok', true,
    'pack_count', v_pack_count,
    'total_kept', v_total_kept,
    'total_sold_count', v_total_sold_count,
    'total_sold_earned', v_total_sold_payout,
    'points', v_new_points);
end;
$$;

grant execute on function record_pack_pulls_batch(uuid, text, jsonb, text[]) to anon, authenticated;

-- 3) PCL 한도 50,000 — assert_pcl_cap / bulk_submit_psa_grading
create or replace function assert_pcl_cap(p_user_id uuid, p_incoming int)
returns void
language plpgsql
as $$
declare
  v_current int;
begin
  select count(*)::int into v_current
    from psa_gradings
   where user_id = p_user_id;
  if v_current + p_incoming > 50000 then
    raise exception
      'PCL 슬랩 보유 한도 초과 — 현재 %장 / 50,000장. 일괄 판매로 정리한 뒤 다시 시도하세요.',
      v_current
      using errcode = 'P0001';
  end if;
end;
$$;

create or replace function bulk_submit_psa_grading(
  p_user_id uuid,
  p_card_ids text[],
  p_rarities text[] default null,
  p_auto_sell_below_grade int default null
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_card_id text;
  v_rarity text;
  v_idx int := 0;
  v_count int;
  v_grade int;
  v_roll numeric;
  v_bonus int;
  v_total_bonus int := 0;
  v_success int := 0;
  v_fail int := 0;
  v_skipped int := 0;
  v_cap_skipped int := 0;
  v_results jsonb := '[]'::jsonb;
  v_new_points int;
  v_auto_sold_count int := 0;
  v_auto_sold_earned int := 0;
  v_pcl_10_delta int := 0;
  v_sell_payout int;
  v_should_auto_sell boolean;
  v_pcl_current int;
  v_pcl_room int;
  v_pcl_used int := 0;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  if p_card_ids is null or array_length(p_card_ids, 1) is null then
    return json_build_object('ok', false, 'error', '감정할 카드가 없어요.');
  end if;

  select count(*)::int into v_pcl_current from psa_gradings where user_id = p_user_id;
  v_pcl_room := greatest(0, 50000 - v_pcl_current);

  foreach v_card_id in array p_card_ids loop
    v_idx := v_idx + 1;
    v_rarity := case
      when p_rarities is null then null
      when array_length(p_rarities, 1) >= v_idx then p_rarities[v_idx]
      else null
    end;

    if v_rarity is null or not is_psa_eligible_rarity(v_rarity) then
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_object(
        'card_id', v_card_id, 'ok', false, 'error', 'ineligible_rarity'
      );
      continue;
    end if;

    select count into v_count from card_ownership
      where user_id = p_user_id and card_id = v_card_id for update;
    if not found or coalesce(v_count, 0) < 1 then
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_object(
        'card_id', v_card_id, 'ok', false, 'error', 'not_owned'
      );
      continue;
    end if;

    update card_ownership set count = count - 1, last_pulled_at = now()
      where user_id = p_user_id and card_id = v_card_id;
    delete from card_ownership
      where user_id = p_user_id and card_id = v_card_id and count = 0;

    v_roll := random() * 100;

    if v_roll < 70 then
      v_fail := v_fail + 1;
      v_results := v_results || jsonb_build_object(
        'card_id', v_card_id, 'ok', true, 'failed', true
      );
      continue;
    end if;

    v_grade := case
      when v_roll < 78   then 6
      when v_roll < 88   then 7
      when v_roll < 96   then 8
      when v_roll < 99.5 then 9
      else 10
    end;

    v_bonus := case
      when v_grade = 10 then 50000
      when v_grade = 9  then 30000
      when v_grade = 8  then 10000
      when v_grade in (6, 7) then 3000
      else 0
    end;

    v_should_auto_sell :=
      p_auto_sell_below_grade is not null
      and v_grade < p_auto_sell_below_grade;

    if v_should_auto_sell then
      v_sell_payout := pcl_sell_price(v_grade);
      v_auto_sold_count := v_auto_sold_count + 1;
      v_auto_sold_earned := v_auto_sold_earned + v_sell_payout;
      v_total_bonus := v_total_bonus + v_bonus + v_sell_payout;
      v_success := v_success + 1;

      v_results := v_results || jsonb_build_object(
        'card_id', v_card_id, 'ok', true, 'failed', false,
        'grade', v_grade, 'bonus', v_bonus,
        'auto_sold', true, 'sell_payout', v_sell_payout
      );
      continue;
    end if;

    if v_pcl_used >= v_pcl_room then
      v_cap_skipped := v_cap_skipped + 1;
      v_results := v_results || jsonb_build_object(
        'card_id', v_card_id, 'ok', false, 'error', 'pcl_cap',
        'grade', v_grade
      );
      continue;
    end if;

    if v_grade = 10 then
      v_pcl_10_delta := v_pcl_10_delta + 1;
    end if;

    insert into psa_gradings (user_id, card_id, grade, rarity)
      values (p_user_id, v_card_id, v_grade, v_rarity);
    v_pcl_used := v_pcl_used + 1;

    v_total_bonus := v_total_bonus + v_bonus;
    v_success := v_success + 1;

    v_results := v_results || jsonb_build_object(
      'card_id', v_card_id, 'ok', true, 'failed', false,
      'grade', v_grade, 'bonus', v_bonus
    );
  end loop;

  if v_pcl_10_delta > 0 then
    update users set pcl_10_wins = pcl_10_wins + v_pcl_10_delta
      where id = p_user_id;
  end if;

  if v_total_bonus > 0 then
    update users set points = points + v_total_bonus
      where id = p_user_id
      returning points into v_new_points;
  else
    select points into v_new_points from users where id = p_user_id;
  end if;

  return json_build_object(
    'ok', true,
    'results', v_results,
    'success_count', v_success,
    'fail_count', v_fail,
    'skipped_count', v_skipped,
    'cap_skipped_count', v_cap_skipped,
    'auto_sold_count', v_auto_sold_count,
    'auto_sold_earned', v_auto_sold_earned,
    'bonus', v_total_bonus,
    'points', v_new_points
  );
end;
$$;

grant execute on function bulk_submit_psa_grading(uuid, text[], text[], int) to anon, authenticated;

-- 4) wild_battles_log + 5) wild_cooldown_until 컬럼
create table if not exists wild_battles_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  prize_points int not null,
  rank_points int not null default 50,
  created_at timestamptz not null default now()
);

create index if not exists wild_battles_log_user_created_idx
  on wild_battles_log(user_id, created_at desc);

alter table users
  add column if not exists wild_cooldown_until timestamptz;

-- 6) wild_battle_reward — 로그 인서트 추가, 기존 동작 유지
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
  v_new_points int;
begin
  update users
     set points = points + v_amount,
         wild_wins = wild_wins + 1
   where id = p_user_id
   returning points into v_new_points;

  insert into wild_battles_log (user_id, prize_points, rank_points)
    values (p_user_id, v_amount, 50);

  return json_build_object(
    'ok', true,
    'awarded', v_amount,
    'rank_points', 50,
    'points', v_new_points
  );
end;
$$;

grant execute on function wild_battle_reward(uuid, int) to anon, authenticated;

-- 7) wild_battle_loss — 쿨타임 셋팅 + cooldown_until 응답
create or replace function wild_battle_loss(
  p_user_id uuid,
  p_grading_id uuid
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_card_id text;
  v_grade int;
  v_rarity text;
  v_main_ids uuid[];
  v_cooldown_until timestamptz;
begin
  select coalesce(main_card_ids, '{}'::uuid[]) into v_main_ids
    from users where id = p_user_id;
  if p_grading_id = any(v_main_ids) then
    return json_build_object(
      'ok', false,
      'error', '펫으로 등록된 슬랩은 야생 전투에 사용할 수 없어요.'
    );
  end if;

  select card_id, grade, rarity into v_card_id, v_grade, v_rarity
    from psa_gradings g
    where g.id = p_grading_id
      and g.user_id = p_user_id
      and not exists (select 1 from showcase_cards c where c.grading_id = g.id)
    for update;
  if not found then
    return json_build_object('ok', false, 'error', '슬랩을 찾을 수 없거나 전시 중입니다.');
  end if;

  delete from psa_gradings where id = p_grading_id;

  v_cooldown_until := now() + interval '30 seconds';
  update users set wild_cooldown_until = v_cooldown_until
    where id = p_user_id;

  return json_build_object(
    'ok', true,
    'card_id', v_card_id,
    'grade', v_grade,
    'rarity', v_rarity,
    'cooldown_until', v_cooldown_until
  );
end;
$$;

grant execute on function wild_battle_loss(uuid, uuid) to anon, authenticated;

-- 8) get_wild_cooldown — 클라 mount 시 쿨타임 조회
create or replace function get_wild_cooldown(p_user_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_until timestamptz;
  v_seconds int;
begin
  select wild_cooldown_until into v_until
    from users where id = p_user_id;
  if v_until is null or v_until <= now() then
    return json_build_object(
      'ok', true,
      'cooldown_until', null,
      'seconds_left', 0
    );
  end if;
  v_seconds := ceil(extract(epoch from (v_until - now())))::int;
  return json_build_object(
    'ok', true,
    'cooldown_until', v_until,
    'seconds_left', greatest(v_seconds, 0)
  );
end;
$$;

grant execute on function get_wild_cooldown(uuid) to anon, authenticated;

-- 9) get_user_activity rank 탭 — 야생 승리 +50 이벤트 추가
create or replace function get_user_activity(
  p_user_id uuid,
  p_tab text
) returns json
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_rows json;
begin
  if p_user_id is null then
    return '[]'::json;
  end if;

  if p_tab = 'rank' then
    with wins as (
      select
        ('부수기 성공' ||
          case when l.grade = 10 then ' (PCL10)'
               when l.grade = 9  then ' (PCL9)'
               else '' end) as label,
        coalesce(l.card_id, '?') as card_id,
        case when l.grade = 10 then 1000 else 500 end as points,
        'sabotage_win'::text as source,
        l.created_at as occurred_at
      from sabotage_logs l
      where l.attacker_id = p_user_id
        and l.success
      order by l.created_at desc
      limit 5
    ),
    defs as (
      select
        ('부수기 방어') as label,
        coalesce(l.card_id, '?') as card_id,
        150 as points,
        'sabotage_defense'::text as source,
        l.created_at as occurred_at
      from sabotage_logs l
      where l.victim_id = p_user_id
        and not l.success
      order by l.created_at desc
      limit 5
    ),
    losses as (
      select
        ('전시 카드 파괴 당함') as label,
        coalesce(l.card_id, '?') as card_id,
        -500 as points,
        'sabotage_loss'::text as source,
        l.created_at as occurred_at
      from sabotage_logs l
      where l.victim_id = p_user_id
        and l.success
      order by l.created_at desc
      limit 5
    ),
    wild as (
      select
        ('야생 승리') as label,
        null::text as card_id,
        coalesce(w.rank_points, 50) as points,
        'wild_win'::text as source,
        w.created_at as occurred_at
      from wild_battles_log w
      where w.user_id = p_user_id
      order by w.created_at desc
      limit 5
    ),
    merged as (
      select * from wins
      union all select * from defs
      union all select * from losses
      union all select * from wild
    )
    select coalesce(
      json_agg(
        json_build_object(
          'label', m.label,
          'card_id', m.card_id,
          'points', m.points,
          'source', m.source,
          'occurred_at', m.occurred_at
        )
        order by m.occurred_at desc
      ),
      '[]'::json
    ) into v_rows
    from (
      select * from merged order by occurred_at desc limit 5
    ) m;

  elsif p_tab = 'power' then
    with showcases as (
      select
        ('전시 (' || g2.rarity || ' PCL' || g2.grade || ')') as label,
        g2.card_id as card_id,
        (rarity_power(g2.rarity) * pcl_power(g2.grade))::int as points,
        'showcase_display'::text as source,
        sc.created_at as occurred_at
      from showcase_cards sc
      join user_showcases us on us.id = sc.showcase_id
      join psa_gradings g2 on g2.id = sc.grading_id
      where us.user_id = p_user_id
      order by sc.created_at desc
      limit 5
    ),
    pokedex as (
      -- 20260563 에서 pokedex_power_bonus(int) 가 drop 되어, 누적 차분
      -- 방식이 invalid. pokedex_rarity_score(text) 로 등급별 정액 사용.
      select
        ('도감 등록 (' || coalesce(p.rarity, '-') || ')') as label,
        p.card_id as card_id,
        coalesce(pokedex_rarity_score(coalesce(p.rarity, '')), 0) as points,
        'pokedex_register'::text as source,
        p.registered_at as occurred_at
      from pokedex_entries p
      where p.user_id = p_user_id
      order by p.registered_at desc
      limit 5
    ),
    losses as (
      select
        ('센터 카드 파괴 당함 (PCL' || coalesce(l.grade, 0) || ')') as label,
        coalesce(l.card_id, '?') as card_id,
        -coalesce(pcl_power(l.grade), 0) as points,
        'showcase_destroyed'::text as source,
        l.created_at as occurred_at
      from sabotage_logs l
      where l.victim_id = p_user_id
        and l.success
      order by l.created_at desc
      limit 5
    ),
    merged as (
      select * from showcases
      union all select * from pokedex
      union all select * from losses
    )
    select coalesce(
      json_agg(
        json_build_object(
          'label', m.label,
          'card_id', m.card_id,
          'points', m.points,
          'source', m.source,
          'occurred_at', m.occurred_at
        )
        order by m.occurred_at desc
      ),
      '[]'::json
    ) into v_rows
    from (
      select * from merged order by occurred_at desc limit 5
    ) m;

  elsif p_tab = 'pet' then
    select coalesce(
      json_agg(
        json_build_object(
          'label', m.label,
          'card_id', m.card_id,
          'points', m.points,
          'source', m.source,
          'occurred_at', m.occurred_at
        )
        order by m.occurred_at desc
      ),
      '[]'::json
    ) into v_rows
    from (
      select
        ('펫 슬롯 (' || g.rarity || ')') as label,
        g.card_id as card_id,
        (rarity_score(g.rarity) * 10)::int as points,
        'pet_slot'::text as source,
        g.graded_at as occurred_at
      from psa_gradings g
      join users u on u.id = g.user_id
      where g.user_id = p_user_id
        and g.id = any(coalesce(u.main_card_ids, '{}'::uuid[]))
        and g.grade = 10
      order by g.graded_at desc
      limit 5
    ) m;

  else
    return '[]'::json;
  end if;

  return coalesce(v_rows, '[]'::json);
end;
$$;

grant execute on function get_user_activity(uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
