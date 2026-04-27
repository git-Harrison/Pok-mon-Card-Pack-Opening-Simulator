-- ============================================================
-- 어드민 hun 계정에 PCL10 MUR 슬랩 5종 × 2장씩 시드.
--
-- MUR 카드 5종 (현재 카탈로그 기준):
--   m1l-092  메가루카리오
--   m1s-092  메가가디안
--   m2-116   메가 리자몽 X ex (골드)
--   m2a-250  메가 망나뇽 ex (골드)
--   m3-117   메가지가르데 ex
--
-- 멱등성:
--   각 카드별로 hun 의 기존 PCL10 보유 수를 카운트하고
--   부족분만 채워넣음. 재실행해도 카드당 2장 초과 안 함.
-- pcl_10_wins 카운터도 동일 분만 증가.
-- ============================================================

do $$
declare
  v_user_id uuid;
  v_card record;
  v_existing int;
  v_to_insert int;
  v_total_added int := 0;
  i int;
begin
  select id into v_user_id from users where user_id = 'hun';
  if not found then
    raise notice 'user hun 미존재 — seed skip';
    return;
  end if;

  for v_card in
    select card_id, rarity
      from (values
        ('m1l-092'::text, 'MUR'::text),
        ('m1s-092', 'MUR'),
        ('m2-116',  'MUR'),
        ('m2a-250', 'MUR'),
        ('m3-117',  'MUR')
      ) as t(card_id, rarity)
  loop
    select count(*)::int into v_existing
      from psa_gradings
      where user_id = v_user_id
        and card_id = v_card.card_id
        and grade = 10;
    v_to_insert := greatest(0, 2 - v_existing);
    for i in 1..v_to_insert loop
      insert into psa_gradings (user_id, card_id, grade, rarity)
        values (v_user_id, v_card.card_id, 10, v_card.rarity);
    end loop;
    v_total_added := v_total_added + v_to_insert;
  end loop;

  if v_total_added > 0 then
    update users
       set pcl_10_wins = coalesce(pcl_10_wins, 0) + v_total_added
     where id = v_user_id;
  end if;

  raise notice 'hun MUR PCL10 seed: % 장 추가', v_total_added;
end $$;
