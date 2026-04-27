-- ============================================================
-- set_main_cards: 동일 카드 (card_id) 중복 등록 금지.
--
-- 기존: 같은 슬랩(grading_id) 중복은 차단됐으나, 같은 card_id 다른
--   슬랩은 허용 → 사용자 1명이 차리자드 PCL10 5장 모두 펫으로 등록
--   가능. 펫 다양성 의도와 어긋남.
-- 패치: 입력된 grading_ids 의 card_id 가 distinct 인지 검사.
--   중복이면 거부.
-- 기존 거부 사유 (전시중 / 본인소유 / PCL10) 와 동일한 위치에 검사
--   추가. 다른 분기는 그대로.
-- ============================================================

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
  v_displayed_count int;
  v_distinct_card_count int;
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

    select count(*)::int into v_displayed_count
      from showcase_cards sc
     where sc.grading_id = any(v_ids);
    if v_displayed_count > 0 then
      return json_build_object(
        'ok', false,
        'error', '전시 중인 슬랩은 펫으로 등록할 수 없어요. 센터에서 전시 해제 후 다시 시도하세요.'
      );
    end if;

    -- 신규: card_id 중복 차단. distinct count 가 입력 길이와 다르면 중복.
    select count(distinct card_id)::int into v_distinct_card_count
      from psa_gradings g
     where g.id = any(v_ids);
    if v_distinct_card_count <> array_length(v_ids, 1) then
      return json_build_object(
        'ok', false,
        'error', '같은 카드를 두 번 펫으로 등록할 수 없어요.'
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
