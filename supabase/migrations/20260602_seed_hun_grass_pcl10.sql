-- ============================================================
-- hun 계정에 풀 속성 최고 등급 PCL10 슬랩 3종 시드 (사용자 요청)
--
-- 카탈로그 검사 결과 풀 속성 최고 rarity 3 종:
--   1) sv8a-234  초록가면 오거폰 ex (골드)   UR
--   2) sv2a-200  이상해꽃 ex                 SAR
--   3) sv5a-089  번청차 ex                   SAR
--
-- 각 1장씩 PCL10 으로 psa_gradings 에 insert. pcl_10_wins 카운터도
-- 같은 양만큼 누계 (랭킹 산식 정합).
-- 이미 시드된 카드는 건너뛰어 멱등 보장.
-- ============================================================

do $$
declare
  v_user_id uuid;
  v_to_insert record;
  v_added int := 0;
begin
  select id into v_user_id from users where user_id = 'hun';
  if not found then
    raise notice 'user hun 미존재 — seed skip';
    return;
  end if;

  for v_to_insert in
    select * from (
      values
        ('sv8a-234', 'UR'),
        ('sv2a-200', 'SAR'),
        ('sv5a-089', 'SAR')
    ) as t(card_id, rarity)
  loop
    if not exists (
      select 1 from psa_gradings
       where user_id = v_user_id
         and card_id = v_to_insert.card_id
         and grade = 10
    ) then
      insert into psa_gradings (user_id, card_id, grade, rarity)
        values (v_user_id, v_to_insert.card_id, 10, v_to_insert.rarity);
      v_added := v_added + 1;
    end if;
  end loop;

  if v_added > 0 then
    update users
       set pcl_10_wins = coalesce(pcl_10_wins, 0) + v_added
     where id = v_user_id;
  end if;

  raise notice 'hun 풀 PCL10 seed: % 장 추가', v_added;
end $$;
