-- ============================================================
-- Multi-pack batched persist — record_pack_pulls_batch
--
-- Replaces the N sequential record_pack_pull_v4 calls used by the
-- multi-box flow with a single transaction:
--   * one advisory lock
--   * one INSERT into pack_opens (multi-row)
--   * one INSERT into pulls (set-based join)
--   * one UPSERT into card_ownership (aggregated by card_id)
--   * one points credit for the auto-sell payout total
--
-- Input shape:
--   p_pulls = jsonb array of objects, each
--     { "card_ids": text[], "rarities": text[] }
--   one element per pack; arrays must be the same length.
--
-- Cap check is over the WHOLE batch — if any pack would push the
-- user past 15,000 kept cards, the entire batch is rejected and
-- nothing is written.
--
-- record_pack_pull_v4 is kept untouched for the single-pack path.
-- ============================================================

create or replace function record_pack_pulls_batch(
  p_user_id uuid,
  p_set_code text,
  p_pulls jsonb,
  p_auto_sell_sub_ar boolean
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
    not (p_auto_sell_sub_ar and is_sub_ar(rarity)) as is_kept
  from flattened;

  select count(*) filter (where is_kept), count(*) filter (where not is_kept),
         coalesce(sum(case when not is_kept then bulk_sell_price(rarity) else 0 end), 0)
    into v_total_kept, v_total_sold_count, v_total_sold_payout
    from tmp_pack_cards;

  select coalesce(sum(count), 0)::int
    into v_current
    from card_ownership
   where user_id = p_user_id;

  if v_current + v_total_kept > 15000 then
    raise exception
      '지갑 보유 한도 초과 — 현재 %장 / 15,000장. 팔거나 감별/전시로 정리한 뒤 다시 시도하세요.',
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

grant execute on function record_pack_pulls_batch(uuid, text, jsonb, boolean) to anon, authenticated;

notify pgrst, 'reload schema';
