-- ============================================================
-- get_undisplayed_gradings 가 체육관 방어 덱 슬랩도 제외하도록 확장.
--
-- 사용자 보고: 야생 컨텐츠 시작 시 카드 선택 리스트에 (1) 센터 전시,
-- (2) 펫 등록, (3) 체육관 방어 덱 등록된 PCL 슬랩이 모두 빠져 있어야
-- 하는데, 현재는 (3) 만 노출됨. 방어 덱은 점령자가 다른 사람에게
-- 점령당하면 영구 삭제 대상이라 야생 전투에서 잃을 수도 있음 →
-- 사용 자체를 막는 게 안전.
--
-- 영향 RPC 사용처:
--   · WildView (야생 전투 슬랩 picker)        ← 핵심 fix 대상
--   · CenterView (전시 picker) — 방어 덱 슬랩 전시 막는 부수효과 ✓
--   · BulkSellView (PCL 일괄 판매) — 방어 덱 보호 부수효과 ✓
--
-- 조치: 기존 NOT EXISTS (showcase / main_card_ids) 두 절에 NOT
-- EXISTS (gym_ownerships.defense_pet_ids) 한 절 추가.
-- ============================================================

create or replace function get_undisplayed_gradings(p_user_id uuid)
returns setof psa_gradings
language sql
stable
set search_path = public, extensions
as $$
  select g.*
    from psa_gradings g
   where g.user_id = p_user_id
     and not exists (select 1 from showcase_cards c where c.grading_id = g.id)
     and not exists (
       select 1 from users u
        where u.id = p_user_id
          and g.id = any(coalesce(u.main_card_ids, '{}'::uuid[]))
     )
     and not exists (
       select 1 from gym_ownerships o
        where o.owner_user_id = p_user_id
          and g.id = any(coalesce(o.defense_pet_ids, '{}'::uuid[]))
     )
   order by g.graded_at desc
$$;

grant execute on function get_undisplayed_gradings(uuid) to anon, authenticated;
notify pgrst, 'reload schema';
