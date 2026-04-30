-- ============================================================
-- 내 포켓몬 도감 헤더 — 동일 속성 PCL10 보유 카드(MUR/UR/SAR) 카운트.
--
-- 컨셉: /my-pokemon owned view 의 도감 헤더에서 "현재 캐릭터(스타터)와
-- 같은 wild_type 의 PCL10 슬랩 중 미사용 분" 을 레어도별 표시.
--
-- 미사용 = 다음 어디에도 등록 안 된 슬랩:
--   · users.main_card_ids        (펫 슬롯 1차)
--   · users.main_cards_by_type   (펫 슬롯 by type — flatten_pet_ids_by_type)
--   · showcase_cards.grading_id  (전시)
--   · gym_ownerships.defense_pet_ids (체육관 방어덱)
--
-- 같은 card_id 의 PCL10 슬랩이 여러 장이고 그중 1장이라도 미사용이면
-- "보유 가능" 으로 카운트. 같은 card_id 는 distinct 로 1번만.
-- ============================================================

create or replace function get_starter_companion_counts(
  p_user_id uuid,
  p_type    text
) returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mur int;
  v_ur  int;
  v_sar int;
begin
  with used_grading_ids as (
    -- 펫 슬롯 1차
    select unnest(coalesce(u.main_card_ids, '{}'::uuid[])) as id
      from users u where u.id = p_user_id
    union
    -- 펫 슬롯 by type
    select unnest(
      flatten_pet_ids_by_type(coalesce(u.main_cards_by_type, '{}'::jsonb))
    ) from users u where u.id = p_user_id
    union
    -- 전시
    select sc.grading_id
      from showcase_cards sc
      join user_showcases us on us.id = sc.showcase_id
     where us.user_id = p_user_id
       and sc.grading_id is not null
    union
    -- 체육관 방어덱
    select unnest(coalesce(go.defense_pet_ids, '{}'::uuid[]))
      from gym_ownerships go where go.owner_user_id = p_user_id
  ),
  available_cards as (
    select distinct g.card_id, g.rarity
      from psa_gradings g
      join card_types ct on ct.card_id = g.card_id
     where g.user_id = p_user_id
       and g.grade   = 10
       and ct.wild_type = p_type
       and g.rarity in ('MUR', 'UR', 'SAR')
       and g.id not in (select id from used_grading_ids where id is not null)
  )
  select
    coalesce(sum(case when rarity = 'MUR' then 1 else 0 end), 0)::int,
    coalesce(sum(case when rarity = 'UR'  then 1 else 0 end), 0)::int,
    coalesce(sum(case when rarity = 'SAR' then 1 else 0 end), 0)::int
    into v_mur, v_ur, v_sar
    from available_cards;

  return json_build_object(
    'mur', coalesce(v_mur, 0),
    'ur',  coalesce(v_ur,  0),
    'sar', coalesce(v_sar, 0)
  );
end;
$$;

grant execute on function get_starter_companion_counts(uuid, text)
  to anon, authenticated;

notify pgrst, 'reload schema';
