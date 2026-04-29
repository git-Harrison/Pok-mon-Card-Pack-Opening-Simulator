-- ============================================================
-- 일반 카드(지갑) 보유 한도 50,000 → 100,000.
--
-- record_pack_pulls_batch 와 record_pack_pull_v4 두 함수의 cap 검사
-- 만 50000 → 100000 으로 상향. 함수 본체 / 인자 시그니처 / 응답 키
-- 는 직전 버전(20260590 / 20260589) 그대로 유지.
--
-- PCL 슬랩 한도(assert_pcl_cap, bulk_submit_psa_grading 의 v_pcl_room)
-- 는 50,000 그대로 — 사용자 요청은 "일반 카드"만.
-- ============================================================

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
  v_total_deleted int := 0;
  v_current int;
  v_new_points int;
  v_kept_card_ids text[];
begin
  set local statement_timeout = '60s';

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  if p_pulls is null or jsonb_typeof(p_pulls) <> 'array' then
    return json_build_object('ok', false, 'error', '팩 데이터가 없어요.');
  end if;

  v_pack_count := jsonb_array_length(p_pulls);
  if v_pack_count = 0 then
    return json_build_object('ok', false, 'error', '팩 데이터가 비어 있어요.');
  end if;

  with packs as (
    select pack_obj
      from jsonb_array_elements(p_pulls) as t(pack_obj)
  ),
  flattened as (
    select
      c.card_id,
      r.rarity
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
  ),
  classified as (
    select
      card_id,
      rarity,
      not (p_auto_sell_rarities is not null and rarity = any(p_auto_sell_rarities)) as is_kept
    from flattened
  )
  select
    coalesce(array_agg(card_id) filter (where is_kept), '{}'::text[]),
    coalesce(count(*) filter (where is_kept), 0)::int,
    coalesce(count(*) filter (where not is_kept), 0)::int
    into v_kept_card_ids, v_total_kept, v_total_deleted
    from classified;

  select coalesce(sum(count), 0)::int
    into v_current
    from card_ownership
   where user_id = p_user_id;
  if v_current + v_total_kept > 100000 then
    raise exception
      '지갑 보유 한도 초과 — 현재 %장 / 100,000장. 팔거나 감별/전시로 정리한 뒤 다시 시도하세요.',
      v_current
      using errcode = 'P0001';
  end if;

  insert into pack_opens (user_id, set_code)
  select p_user_id, p_set_code
    from generate_series(1, v_pack_count);

  if v_total_kept > 0 then
    insert into card_ownership (user_id, card_id, count, last_pulled_at)
    select p_user_id, c, count(*)::int, now()
      from unnest(v_kept_card_ids) as c
     group by c
    on conflict (user_id, card_id) do update
      set count = card_ownership.count + excluded.count,
          last_pulled_at = now();
  end if;

  select points into v_new_points from users where id = p_user_id;

  return json_build_object('ok', true,
    'pack_count', v_pack_count,
    'total_kept', v_total_kept,
    'total_sold_count', v_total_deleted,
    'total_sold_earned', 0,
    'total_deleted_count', v_total_deleted,
    'points', v_new_points);
end;
$$;

grant execute on function record_pack_pulls_batch(uuid, text, jsonb, text[]) to anon, authenticated;

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
  v_deleted_count int := 0;
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
      v_deleted_count := v_deleted_count + 1;
    else
      v_kept_ids := v_kept_ids || p_card_ids[v_idx];
      v_kept_count := v_kept_count + 1;
    end if;
  end loop;

  select coalesce(sum(count), 0)::int
    into v_current
    from card_ownership
   where user_id = p_user_id;

  if v_current + v_kept_count > 100000 then
    raise exception
      '지갑 보유 한도 초과 — 현재 %장 / 100,000장. 팔거나 감별/전시로 정리한 뒤 다시 시도하세요.',
      v_current
      using errcode = 'P0001';
  end if;

  insert into pack_opens (user_id, set_code)
    values (p_user_id, p_set_code)
    returning id into v_pack_id;

  if v_kept_count > 0 then
    insert into card_ownership (user_id, card_id, count, last_pulled_at)
    select p_user_id, c, count(*)::int, now()
      from unnest(v_kept_ids) as c
     group by c
    on conflict (user_id, card_id) do update
      set count = card_ownership.count + excluded.count,
          last_pulled_at = now();
  end if;

  select points into v_new_points from users where id = p_user_id;

  return json_build_object('ok', true,
    'pack_open_id', v_pack_id,
    'sold_count', v_deleted_count,
    'sold_earned', 0,
    'deleted_count', v_deleted_count,
    'kept_count', v_kept_count,
    'points', v_new_points);
end;
$$;

grant execute on function record_pack_pull_v4(uuid, text, text[], text[], boolean) to anon, authenticated;

notify pgrst, 'reload schema';
