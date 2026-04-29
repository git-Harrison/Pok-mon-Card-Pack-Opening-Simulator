-- ============================================================
-- get_my_defense_pet_ids(uuid) — 사용자가 점령 중인 체육관들의
-- 방어덱에 등록된 grading_id 들을 모아서 uuid[] 로 반환.
--
-- 용도:
--   카드 지갑 PclMode 가 슬랩별 사용 상태(센터/체육관/펫) 표시 +
--   클릭 차단할 때, 어떤 슬랩이 방어덱에 묶여 있는지 알아야 함.
--   기존 get_gyms_state 는 has_defense_deck (boolean) 만 노출.
--
-- 멱등 — CREATE OR REPLACE.
-- ============================================================

create or replace function get_my_defense_pet_ids(p_user_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(array_agg(distinct t.id), '{}'::uuid[])
    from (
      select unnest(coalesce(o.defense_pet_ids, '{}'::uuid[])) as id
        from gym_ownerships o
       where o.owner_user_id = p_user_id
    ) t
   where t.id is not null;
$$;

grant execute on function get_my_defense_pet_ids(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
