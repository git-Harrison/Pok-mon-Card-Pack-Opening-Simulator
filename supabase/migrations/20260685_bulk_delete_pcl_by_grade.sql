-- ============================================================
-- PCL 슬랩 일괄 삭제 — 카드지갑 정리용. 사용자가 등급을 골라
-- 그 등급의 슬랩을 한 번에 삭제.
--
-- 정책:
--   · 등급 PCL 6~10 만 valid (시스템에 PCL 1~5 는 존재 X).
--   · 사용 중 슬랩은 보호 — 삭제 안 됨:
--       1) 전시 중 (showcase_cards.grading_id)
--       2) 체육관 방어덱 (gym_ownerships.defense_pet_ids[])
--       3) 펫 등록 (legacy main_card_ids + main_cards_by_type union)
--       4) 대기 선물 (gifts pending + 미만료)
--   · 도감 박제된 슬랩은 이미 psa_gradings 에서 삭제된 상태라 별도
--     처리 불필요.
--
-- 응답 — { ok, grade, total, locked, deleted }.
--   total   : 해당 등급의 user 보유 슬랩 수 (잠긴 것 포함).
--   locked  : 사용 중이라 보호된 슬랩 수.
--   deleted : 실제 삭제된 슬랩 수.
--
-- 클라가 사용자에게 "20장 중 15장 삭제, 5장은 사용중이라 유지" 안내.
-- ============================================================

create or replace function bulk_delete_pcl_by_grade(
  p_user_id uuid,
  p_grade int
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_total int;
  v_deleted int;
  v_pet_ids uuid[];
begin
  if p_user_id is null then
    return json_build_object('ok', false, 'error', '인증 필요.');
  end if;
  if p_grade is null or p_grade not in (6, 7, 8, 9, 10) then
    return json_build_object('ok', false,
      'error', '유효한 PCL 등급(6~10)이 아니에요.');
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  select count(*)::int into v_total
    from psa_gradings
   where user_id = p_user_id and grade = p_grade;

  -- 펫 등록된 grading_id 들 (legacy main_card_ids + by_type union).
  select coalesce(main_card_ids, '{}'::uuid[])
       || coalesce(
            flatten_pet_ids_by_type(coalesce(main_cards_by_type, '{}'::jsonb)),
            '{}'::uuid[]
          )
    into v_pet_ids
    from users
   where id = p_user_id;

  with del as (
    delete from psa_gradings g
     where g.user_id = p_user_id
       and g.grade = p_grade
       and not exists (
         select 1 from showcase_cards c where c.grading_id = g.id
       )
       and not exists (
         select 1 from gym_ownerships o
          where o.owner_user_id = p_user_id
            and g.id = any(coalesce(o.defense_pet_ids, '{}'::uuid[]))
       )
       and not (g.id = any(coalesce(v_pet_ids, '{}'::uuid[])))
       and not exists (
         select 1 from gifts gf
          where gf.grading_id = g.id
            and gf.status = 'pending'
            and gf.expires_at > now()
       )
     returning g.id
  )
  select count(*)::int into v_deleted from del;

  return json_build_object(
    'ok', true,
    'grade', p_grade,
    'total', v_total,
    'locked', greatest(0, v_total - v_deleted),
    'deleted', v_deleted
  );
end;
$$;

grant execute on function bulk_delete_pcl_by_grade(uuid, int) to anon, authenticated;

notify pgrst, 'reload schema';
