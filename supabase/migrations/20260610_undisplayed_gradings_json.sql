-- ============================================================
-- get_undisplayed_gradings 반환 타입 setof → json 으로 변경.
--
-- 사용자 보고: 일괄 판매 페이지에서 PCL 6/7/8/9 등급을 팔면 PCL 10
-- 등급 카드 수가 늘어나는 버그.
-- 원인: setof psa_gradings 반환이 PostgREST 의 max-rows (기본 1000) 에
-- 걸려 보유 PCL 슬랩이 1000장 초과 시 잘림. 판매로 위쪽 행이 빠지면
-- 잘려있던 아래쪽(다른 등급 + 오래된 graded_at) 행이 노출되어
-- 등급별 카운트가 들쭉날쭉해짐.
-- 조치: get_all_gradings_with_display 처럼 json_agg 로 묶어 반환 →
-- PostgREST 가 1행 (json) 으로 보고 row-limit 적용 안 함.
-- 클라이언트 (fetchUndisplayedGradings) 도 list 그대로 받아 처리.
--
-- 함수 시그니처 변경이라 drop 후 재생성. 기존 setof 버전 함수가
-- 호출되는 곳: BulkSellView / WildView / ProfileView (eligible PCL10
-- picker) 등 전부 클라 수신측에서 array 로 처리하므로 호환.
-- ============================================================

drop function if exists get_undisplayed_gradings(uuid);

create or replace function get_undisplayed_gradings(p_user_id uuid)
returns json
language sql
stable
set search_path = public, extensions
as $$
  select coalesce(
    json_agg(
      json_build_object(
        'id', g.id,
        'user_id', g.user_id,
        'card_id', g.card_id,
        'grade', g.grade,
        'graded_at', g.graded_at,
        'rarity', g.rarity
      )
      order by g.graded_at desc
    ),
    '[]'::json
  )
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
     );
$$;

grant execute on function get_undisplayed_gradings(uuid) to anon, authenticated;
notify pgrst, 'reload schema';
