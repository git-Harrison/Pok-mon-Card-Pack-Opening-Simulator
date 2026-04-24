-- ============================================================
-- Wallet cap: user can hold at most 1,000 cards total.
-- record_pack_pull now rejects pulls that would push total over
-- the cap — the client's box-open flow already surfaces the error
-- and refunds the buyBox on failure.
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
  v_card_id text;
  v_current int;
  v_incoming int := coalesce(array_length(p_card_ids, 1), 0);
begin
  select coalesce(sum(count), 0)::int
    into v_current
    from card_ownership
   where user_id = p_user_id;

  if v_current + v_incoming > 1000 then
    raise exception
      '지갑 보유 한도 초과 — 현재 %장 / 1,000장. 팔거나 감별/전시로 정리한 뒤 다시 시도하세요.',
      v_current
      using errcode = 'P0001';
  end if;

  insert into pack_opens (user_id, set_code) values (p_user_id, p_set_code)
    returning id into v_pack_id;

  foreach v_card_id in array p_card_ids loop
    insert into pulls (user_id, card_id, set_code, pack_open_id)
      values (p_user_id, v_card_id, p_set_code, v_pack_id);
    insert into card_ownership (user_id, card_id, count)
      values (p_user_id, v_card_id, 1)
      on conflict (user_id, card_id)
      do update set count = card_ownership.count + 1,
                    last_pulled_at = now();
  end loop;

  return json_build_object('ok', true, 'pack_open_id', v_pack_id);
end;
$$;

grant execute on function record_pack_pull(uuid, text, text[]) to anon, authenticated;

notify pgrst, 'reload schema';
