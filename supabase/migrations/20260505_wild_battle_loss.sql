-- ============================================================
-- Wild battle loss destroys the grading permanently.
-- The grading row is deleted from psa_gradings, which also removes
-- the PCL rank points it contributed (via get_user_rankings sum).
-- A displayed grading can't be battled (client filters), but server
-- defends anyway with a NOT EXISTS check to be safe.
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
begin
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
