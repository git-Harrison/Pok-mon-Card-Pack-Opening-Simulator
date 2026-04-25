-- ============================================================
-- Wallet caps v3
--   · Wallet card cap   5,000 → 10,000
--   · PCL slab cap      1,000 →    500
--
-- Only the cap thresholds change. record_pack_pull keeps the
-- advisory lock + batched inserts from v2; assert_pcl_cap is
-- re-declared with the new ceiling and unchanged signature so
-- submit_psa_grading / bulk_submit_psa_grading pick it up.
-- ============================================================

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
  v_current int;
  v_incoming int := coalesce(array_length(p_card_ids, 1), 0);
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  select coalesce(sum(count), 0)::int
    into v_current
    from card_ownership
   where user_id = p_user_id;

  if v_current + v_incoming > 10000 then
    raise exception
      '지갑 보유 한도 초과 — 현재 %장 / 10,000장. 팔거나 감별/전시로 정리한 뒤 다시 시도하세요.',
      v_current
      using errcode = 'P0001';
  end if;

  insert into pack_opens (user_id, set_code)
    values (p_user_id, p_set_code)
    returning id into v_pack_id;

  insert into pulls (user_id, card_id, set_code, pack_open_id)
  select p_user_id, c, p_set_code, v_pack_id
    from unnest(p_card_ids) as c;

  insert into card_ownership (user_id, card_id, count, last_pulled_at)
  select p_user_id, c, count(*)::int, now()
    from unnest(p_card_ids) as c
   group by c
  on conflict (user_id, card_id) do update
    set count = card_ownership.count + excluded.count,
        last_pulled_at = now();

  return json_build_object('ok', true, 'pack_open_id', v_pack_id);
end;
$$;

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
  if v_current + p_incoming > 500 then
    raise exception
      'PCL 슬랩 보유 한도 초과 — 현재 %장 / 500장. 일괄 판매로 정리한 뒤 다시 시도하세요.',
      v_current
      using errcode = 'P0001';
  end if;
end;
$$;

grant execute on function record_pack_pull(uuid, text, text[]) to anon, authenticated;

notify pgrst, 'reload schema';
