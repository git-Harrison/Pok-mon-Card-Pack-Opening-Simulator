-- ============================================================
-- get_all_gradings_with_display 에 in_defense_deck 플래그 추가.
--
-- 사용자 보고: /profile 펫 슬롯 picker 에서 체육관 방어덱에 등록된
-- 슬랩이 "등록됨" 표시 안 되고 선택 가능하게 나옴.
-- 원인: defense_pet_ids 는 main_card_ids 에서 빠졌고, picker 의
-- displayed/main 검사만으로는 방어덱 슬랩을 알 수 없음.
-- 조치: 슬랩 별 in_defense_deck flag 노출 → 클라가 picker 에서 disabled
-- 표시 + "방어 덱" 라벨로 차단.
-- ============================================================

create or replace function get_all_gradings_with_display(p_user_id uuid)
returns json
language sql
stable
set search_path = public, extensions
as $$
  select coalesce(json_agg(row_to_json(r) order by r.graded_at desc), '[]'::json)
    from (
      select
        g.id,
        g.user_id,
        g.card_id,
        g.grade,
        g.graded_at,
        g.rarity,
        exists(select 1 from showcase_cards c where c.grading_id = g.id) as displayed,
        exists(
          select 1 from gym_ownerships o
           where o.owner_user_id = p_user_id
             and g.id = any(coalesce(o.defense_pet_ids, '{}'::uuid[]))
        ) as in_defense_deck
      from psa_gradings g
      where g.user_id = p_user_id
    ) r
$$;

grant execute on function get_all_gradings_with_display(uuid) to anon, authenticated;
notify pgrst, 'reload schema';
