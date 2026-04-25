-- 펫 슬롯 5장 → 10장 확장.
-- set_main_cards 의 서버측 cap 만 5 → 10 으로 갱신. pet_score 계산 공식
-- (rarity_power × 10) 은 유지되며, 최대값은 자연스럽게 10×10×10 = 1000 점.
-- /users 펫 랭킹 안내 텍스트도 클라이언트에서 MAX_PET_SCORE 상수를 보고
-- 출력하므로 함께 1000 으로 표시된다.

create or replace function set_main_cards(
  p_user_id uuid,
  p_grading_ids uuid[]
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ids uuid[];
  v_valid_count int;
  v_score int;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  v_ids := coalesce(p_grading_ids, '{}'::uuid[]);

  if array_length(v_ids, 1) is not null and array_length(v_ids, 1) > 10 then
    return json_build_object('ok', false, 'error', '펫은 최대 10장까지 등록할 수 있어요.');
  end if;

  if array_length(v_ids, 1) is not null then
    select count(*)::int into v_valid_count
      from psa_gradings g
     where g.id = any(v_ids)
       and g.user_id = p_user_id
       and g.grade = 10;
    if v_valid_count <> array_length(v_ids, 1) then
      return json_build_object(
        'ok', false,
        'error', '본인의 PCL10 슬랩만 펫으로 등록할 수 있어요.'
      );
    end if;
  end if;

  v_score := pet_score_for(v_ids);

  update users
     set main_card_ids = v_ids,
         pet_score = v_score
   where id = p_user_id;

  return json_build_object(
    'ok', true,
    'main_card_ids', to_jsonb(v_ids),
    'pet_score', v_score
  );
end;
$$;

grant execute on function set_main_cards(uuid, uuid[]) to anon, authenticated;

notify pgrst, 'reload schema';
