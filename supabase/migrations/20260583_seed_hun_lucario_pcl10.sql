-- ============================================================
-- 어드민 hun 계정 메가루카리오 (m1l-092 / MUR) PCL10 슬랩 2장 보장.
-- 20260580 의 일부지만 사용자가 명시적으로 다시 요청 → 멱등 시드.
-- ============================================================

do $$
declare
  v_user_id uuid;
  v_existing int;
  v_to_insert int;
  i int;
begin
  select id into v_user_id from users where user_id = 'hun';
  if not found then
    raise notice 'user hun 미존재 — seed skip';
    return;
  end if;

  select count(*)::int into v_existing
    from psa_gradings
    where user_id = v_user_id
      and card_id = 'm1l-092'
      and grade = 10;
  v_to_insert := greatest(0, 2 - v_existing);

  for i in 1..v_to_insert loop
    insert into psa_gradings (user_id, card_id, grade, rarity)
      values (v_user_id, 'm1l-092', 10, 'MUR');
  end loop;

  if v_to_insert > 0 then
    update users
       set pcl_10_wins = coalesce(pcl_10_wins, 0) + v_to_insert
     where id = v_user_id;
  end if;

  raise notice 'hun 메가루카리오 PCL10 seed: % 장 추가', v_to_insert;
end $$;
