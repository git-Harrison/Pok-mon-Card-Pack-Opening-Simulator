-- ============================================================
-- wild_battle_loss: 펫 등록 슬랩 파괴 금지 가드 추가.
--
-- 기존 (20260505):
--   - 전시 중 슬랩만 거부 (showcase_cards NOT EXISTS).
--   - 펫 슬랩은 클라이언트 단(fetchUndisplayedGradings)에서만 걸렀음.
-- 문제:
--   - 사용자가 야생 전투 중 다른 탭/세션에서 슬랩을 펫으로 등록하면
--     race condition 으로 펫 슬랩이 파괴될 수 있음.
--   - main_card_ids 에 dangling UUID 가 남아 pet_score 가 부정확해짐.
-- 패치:
--   - users.main_card_ids 포함 여부 추가 검사. 포함이면 거부.
--   - 메시지: "펫으로 등록된 슬랩은 야생 전투에 사용할 수 없어요."
-- 슬랩 파괴 자체는 그대로 영구 삭제 (delete from psa_gradings) —
-- PCL 지갑 탭 / 랭킹 / 전투력 모두 즉시 반영됨.
-- ============================================================

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
begin
  select coalesce(main_card_ids, '{}'::uuid[]) into v_main_ids
    from users where id = p_user_id;
  if p_grading_id = any(v_main_ids) then
    return json_build_object(
      'ok', false,
      'error', '펫으로 등록된 슬랩은 야생 전투에 사용할 수 없어요.'
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
