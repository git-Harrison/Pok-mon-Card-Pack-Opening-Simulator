-- ============================================================
-- 지갑 한도 15,000 → 20,000.
-- PCL 한도(20,000)와 동일하게 맞춰 총 보유량 약 40,000.
--
-- 영향 RPC:
--   1) record_pack_pull_v4 — 단발 팩 저장 (현재 클라이언트에선
--      박스 일괄에 흡수되어 거의 미사용이지만 시그니처는 유지).
--   2) record_pack_pulls_batch — 박스 일괄 저장 (실제 사용 경로).
--
-- 두 함수 모두 본문은 직전 정의(20260540 / 20260560) 그대로 두고
-- cap 임계값과 메시지 문구만 갱신하는 미니멀 패치.
-- ============================================================

-- 1) record_pack_pull_v4: 20260540 정의 그대로, cap 만 20000
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

  if v_current + v_kept_count > 20000 then
    raise exception
      '지갑 보유 한도 초과 — 현재 %장 / 20,000장. 팔거나 감별/전시로 정리한 뒤 다시 시도하세요.',
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

-- 2) record_pack_pulls_batch: 20260560 정의 그대로, cap 만 20000
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

  if v_current + v_total_kept > 20000 then
    raise exception
      '지갑 보유 한도 초과 — 현재 %장 / 20,000장. 팔거나 감별/전시로 정리한 뒤 다시 시도하세요.',
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

notify pgrst, 'reload schema';
