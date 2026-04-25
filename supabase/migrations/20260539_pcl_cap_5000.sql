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
  if v_current + p_incoming > 5000 then
    raise exception
      'PCL 슬랩 보유 한도 초과 — 현재 %장 / 5,000장. 일괄 판매로 정리한 뒤 다시 시도하세요.',
      v_current
      using errcode = 'P0001';
  end if;
end;
$$;

notify pgrst, 'reload schema';
