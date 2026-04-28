-- ============================================================
-- 펫 격리 정책 보강 — main_cards_by_type 까지 mutual exclusion 적용.
--
-- spec 2-1 도입 후 펫이 main_cards_by_type 으로 옮겨갔지만, 일부 server
-- RPC 가 여전히 legacy main_card_ids 만 체크 → by_type 펫이 격리 정책
-- 을 우회하는 회귀 발견.
--
-- 영향 RPC:
--   1) get_undisplayed_gradings — 야생 / 센터 / 지갑 picker 의 source.
--      현재: showcase + main_card_ids + defense_pet_ids 제외만.
--      문제: by_type 펫이 picker 에 노출 → 사용자가 야생 / 센터 등에서
--           실수로 사용 가능. 야생에서 패배하면 DELETE 됨 (data loss).
--   2) wild_battle_loss(p_grading_id) — 야생 패배 시 슬랩 DELETE.
--      현재: main_card_ids 검사만 → "펫" 거부 안 됨.
--      문제: by_type 펫이 wild 에서 사용되고 패배하면 슬랩 영구 삭제.
--
-- 조치:
--   · get_undisplayed_gradings 에 by_type 평탄화 NOT EXISTS 추가.
--   · wild_battle_loss 에 by_type 검사 추가.
-- ============================================================

-- 1) get_undisplayed_gradings — by_type 펫도 제외.
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
          and (
            g.id = any(coalesce(u.main_card_ids, '{}'::uuid[]))
            or g.id = any(flatten_pet_ids_by_type(coalesce(u.main_cards_by_type, '{}'::jsonb)))
          )
     )
     and not exists (
       select 1 from gym_ownerships o
        where o.owner_user_id = p_user_id
          and g.id = any(coalesce(o.defense_pet_ids, '{}'::uuid[]))
     );
$$;

grant execute on function get_undisplayed_gradings(uuid) to anon, authenticated;

-- 2) wild_battle_loss — by_type 펫도 거부.
create or replace function wild_battle_loss(
  p_user_id uuid,
  p_grading_id uuid
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_card_id text;
  v_grade int;
  v_rarity text;
  v_main_ids uuid[];
  v_by_type_ids uuid[];
begin
  -- legacy + 신구조 union — 둘 다 검사.
  select coalesce(main_card_ids, '{}'::uuid[]),
         flatten_pet_ids_by_type(coalesce(main_cards_by_type, '{}'::jsonb))
    into v_main_ids, v_by_type_ids
    from users where id = p_user_id;

  if p_grading_id = any(v_main_ids) or p_grading_id = any(v_by_type_ids) then
    return json_build_object(
      'ok', false,
      'error', '펫으로 등록된 슬랩은 야생 전투에 사용할 수 없어요.'
    );
  end if;

  -- 방어 덱 슬랩도 거부 (spec 0-1 mutual exclusion).
  if exists (
    select 1 from gym_ownerships
     where owner_user_id = p_user_id
       and p_grading_id = any(coalesce(defense_pet_ids, '{}'::uuid[]))
  ) then
    return json_build_object(
      'ok', false,
      'error', '체육관 방어 덱에 등록된 슬랩은 야생 전투에 사용할 수 없어요.'
    );
  end if;

  select card_id, grade, rarity into v_card_id, v_grade, v_rarity
    from psa_gradings g
    where g.id = p_grading_id
      and g.user_id = p_user_id
      and not exists (select 1 from showcase_cards c where c.grading_id = g.id)
    for update;
  if not found then
    return json_build_object('ok', false, 'error', '슬랩을 찾을 수 없거나 전시 중입니다.');
  end if;

  delete from psa_gradings where id = p_grading_id;

  return json_build_object(
    'ok', true,
    'card_id', v_card_id,
    'grade', v_grade,
    'rarity', v_rarity
  );
end;
$$;

grant execute on function wild_battle_loss(uuid, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
