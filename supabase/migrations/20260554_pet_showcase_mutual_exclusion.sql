-- 펫 ↔ 전시 상호 배타 강제.
--
-- 기존 정책은 부분적으로만 적용돼 있었음:
--   - bulk_create_showcases: 펫 슬랩 거부 ✓ (20260546 에서 추가)
--   - bulk_register_pokedex_entries: 펫·전시 슬랩 모두 제외 ✓ (20260543)
--   - display_grading (단일 슬롯 전시): 펫 체크 없음 ✗
--   - set_main_cards (펫 등록): 전시 체크 없음 ✗
--   - get_undisplayed_gradings (CenterView display picker 데이터 소스):
--     펫 제외 안 됨 → 사용자가 펫 슬랩을 단일 슬롯 전시로 시도 가능 ✗
--
-- 이번 패치로 양방향 배타를 모두 닫는다.
--   1) display_grading: grading 이 사용자 main_card_ids 에 있으면 거부
--   2) set_main_cards: grading 이 showcase_cards 에 있으면 거부
--   3) get_undisplayed_gradings: 펫 슬랩도 결과에서 제외 → CenterView
--      단일 전시 picker 와 ProfileView 클라이언트 양쪽이 동일한 source
--      of truth 사용

-- 1) 단일 전시: 펫 슬랩 거부
create or replace function display_grading(
  p_user_id uuid,
  p_showcase_id uuid,
  p_slot_index int,
  p_grading_id uuid
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_showcase record;
  v_capacity int;
  v_grading record;
  v_main_ids uuid[];
begin
  select * into v_showcase from user_showcases
    where id = p_showcase_id and user_id = p_user_id
    for update;
  if not found then
    return json_build_object('ok', false, 'error', '보관함을 찾을 수 없어요.');
  end if;

  v_capacity := showcase_capacity(v_showcase.showcase_type);
  if p_slot_index < 0 or p_slot_index >= v_capacity then
    return json_build_object('ok', false, 'error', '슬롯 번호가 올바르지 않아요.');
  end if;

  if exists(select 1 from showcase_cards
            where showcase_id = p_showcase_id and slot_index = p_slot_index) then
    return json_build_object('ok', false, 'error', '이미 전시 중인 슬롯이에요.');
  end if;

  select * into v_grading from psa_gradings
    where id = p_grading_id and user_id = p_user_id;
  if not found then
    return json_build_object('ok', false, 'error', '감별 기록을 찾을 수 없어요.');
  end if;
  if v_grading.grade not in (9, 10) then
    return json_build_object('ok', false, 'error', 'AURA 9·10 등급만 전시할 수 있어요.');
  end if;

  if exists(select 1 from showcase_cards where grading_id = p_grading_id) then
    return json_build_object('ok', false, 'error', '이미 다른 보관함에 전시 중이에요.');
  end if;

  -- 신규: 펫으로 등록된 슬랩은 전시 금지
  select coalesce(main_card_ids, '{}'::uuid[]) into v_main_ids
    from users where id = p_user_id;
  if p_grading_id = any(v_main_ids) then
    return json_build_object(
      'ok', false,
      'error', '펫으로 등록된 슬랩은 전시할 수 없어요. 프로필에서 펫 해제 후 다시 시도하세요.'
    );
  end if;

  insert into showcase_cards (showcase_id, slot_index, grading_id)
    values (p_showcase_id, p_slot_index, p_grading_id);

  return json_build_object('ok', true);
end;
$$;

grant execute on function display_grading(uuid, uuid, int, uuid) to anon, authenticated;

-- 2) 펫 등록: 전시 중인 슬랩 거부 (10 슬롯 cap 유지)
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

    -- 신규: 전시 중인 슬랩 포함 시 거부
    select count(*)::int into v_displayed_count
      from showcase_cards sc
     where sc.grading_id = any(v_ids);
    if v_displayed_count > 0 then
      return json_build_object(
        'ok', false,
        'error', '전시 중인 슬랩은 펫으로 등록할 수 없어요. 센터에서 전시 해제 후 다시 시도하세요.'
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

-- 3) CenterView display picker 데이터: 펫 슬랩도 제외
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
   order by g.graded_at desc
$$;

grant execute on function get_undisplayed_gradings(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
