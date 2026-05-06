-- ============================================================
-- 체육관 방어덱 — 같은 card_id 중복 등록 차단 + 기존 중복 데이터 정리.
--
-- 사용자 보고:
--   같은 카드 종류 (예: SAR 메가루카리오) 가 같은 방어덱 3 슬롯에 모두
--   등록되는 케이스 발생. 서버 검사가 distinct grading_id 만 확인하고
--   distinct card_id 는 안 봐서 발생. 슬랩 인스턴스가 여럿이면 통과됨.
--
-- 변경:
--   1) set_gym_defense_deck — 검증에 distinct card_id 검사 추가.
--      슬랩 자체 중복 검사는 그대로 유지.
--   2) 기존 데이터 정리 — gym_ownerships.defense_pet_ids 가 같은 card_id
--      중복을 포함하면 통째 NULL (점령자가 재셋업). 점령은 유지.
--
-- 룰 그대로 유지:
--   - 체육관 속성 룰 (1차 또는 2차 일치 시 가능) 유지.
--   - 다른 보안 검사 (소유자 / PCL10 / 펫 슬롯 등록 여부 등) 유지.
-- ============================================================

create or replace function set_gym_defense_deck(
  p_user_id uuid,
  p_gym_id text,
  p_pet_grading_ids uuid[],
  p_pet_types text[]
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_owner record;
  v_main_ids uuid[];
  v_by_type_data jsonb;
  v_pet_id uuid;
  v_gym record;
  v_old_def uuid[];
  v_returned uuid[];
  v_new_main uuid[];
  v_slot_left int;
  v_normalized_types text[];
  v_card_id text;
  v_distinct_card_count int;
begin
  if p_user_id is null or p_gym_id is null then
    return json_build_object('ok', false, 'error', '요청이 올바르지 않아요.');
  end if;
  if p_pet_grading_ids is null
     or coalesce(array_length(p_pet_grading_ids, 1), 0) <> 3 then
    return json_build_object('ok', false, 'error', '펫 3마리를 선택해주세요.');
  end if;
  if (select count(distinct id) from unnest(p_pet_grading_ids) as id) <> 3 then
    return json_build_object('ok', false, 'error', '펫 3마리는 서로 달라야 해요.');
  end if;

  -- ▶ NEW: 같은 card_id 가 슬롯 3개에 들어가지 않게 distinct card_id 검사.
  -- 다른 PHYSICAL 슬랩이라도 같은 카드 종류면 거부 — UI 의 dedup 검증과 일관.
  select count(distinct g.card_id)::int into v_distinct_card_count
    from unnest(p_pet_grading_ids) as gid
    join psa_gradings g on g.id = gid;
  if v_distinct_card_count <> 3 then
    return json_build_object('ok', false,
      'error', '같은 카드 종류는 방어덱에 한 번만 등록할 수 있어요.');
  end if;

  perform pg_advisory_xact_lock(hashtext('gym:' || p_gym_id));

  select * into v_owner from gym_ownerships
    where gym_id = p_gym_id for update;
  if not found then
    return json_build_object('ok', false, 'error', '비점령 체육관입니다.');
  end if;
  if v_owner.owner_user_id <> p_user_id then
    return json_build_object('ok', false, 'error', '체육관 소유자만 방어 덱을 설정할 수 있어요.');
  end if;

  select * into v_gym from gyms where id = p_gym_id;

  v_normalized_types := array[]::text[];
  for i in 1..3 loop
    select g.card_id into v_card_id
      from psa_gradings g where g.id = p_pet_grading_ids[i];
    if v_card_id is null
       or not card_eligible_for_type(v_card_id, v_gym.type) then
      return json_build_object('ok', false,
        'error', format('이 체육관은 %s 속성 펫만 방어 덱에 등록 가능합니다.', v_gym.type),
        'gym_type', v_gym.type);
    end if;
    v_normalized_types := v_normalized_types || v_gym.type;
  end loop;

  select coalesce(main_card_ids, '{}'::uuid[]),
         coalesce(main_cards_by_type, '{}'::jsonb)
    into v_main_ids, v_by_type_data
    from users where id = p_user_id for update;
  v_main_ids := v_main_ids || coalesce(
    flatten_pet_ids_by_type(v_by_type_data),
    '{}'::uuid[]
  );

  for v_pet_id in select unnest(p_pet_grading_ids) loop
    if not exists (
      select 1 from psa_gradings g
       where g.id = v_pet_id and g.user_id = p_user_id and g.grade = 10
    ) then
      return json_build_object('ok', false,
        'error', '본인 소유 PCL10 슬랩만 등록 가능합니다.');
    end if;
    if not (
      v_pet_id = any(v_main_ids)
      or v_pet_id = any(coalesce(v_owner.defense_pet_ids, '{}'::uuid[]))
    ) then
      return json_build_object('ok', false,
        'error', '펫 슬롯에 등록되지 않은 슬랩이에요. 먼저 펫 등록 후 방어 덱에 넣을 수 있어요.');
    end if;
  end loop;

  v_old_def := coalesce(v_owner.defense_pet_ids, '{}'::uuid[]);
  v_returned := array(
    select id from unnest(v_old_def) as id
     where not (id = any(p_pet_grading_ids))
  );

  v_new_main := array(
    select id from unnest(coalesce(
      (select main_card_ids from users where id = p_user_id),
      '{}'::uuid[]
    )) as id
     where not (id = any(p_pet_grading_ids))
  );
  v_slot_left := greatest(0, 10 - coalesce(array_length(v_new_main, 1), 0));
  if v_slot_left > 0 and coalesce(array_length(v_returned, 1), 0) > 0 then
    v_new_main := v_new_main || v_returned[1:v_slot_left];
  end if;

  update users set main_card_ids = v_new_main where id = p_user_id;
  update users
     set main_cards_by_type = (
       select coalesce(jsonb_object_agg(k.key, t.cleaned), '{}'::jsonb)
         from jsonb_each(coalesce(main_cards_by_type, '{}'::jsonb)) k(key, value)
         cross join lateral (
           select coalesce(
             jsonb_agg(eid.value)
               filter (where (eid.value)::uuid <> all(p_pet_grading_ids)),
             '[]'::jsonb) as cleaned
             from jsonb_array_elements_text(k.value) eid
         ) t
     )
   where id = p_user_id;

  update gym_ownerships
     set defense_pet_ids = p_pet_grading_ids,
         defense_pet_types = v_normalized_types
   where gym_id = p_gym_id;

  return json_build_object(
    'ok', true,
    'gym_id', p_gym_id,
    'defense_pet_ids', to_jsonb(p_pet_grading_ids)
  );
end;
$$;

grant execute on function set_gym_defense_deck(uuid, text, uuid[], text[])
  to anon, authenticated;

-- ── 기존 중복 방어덱 정리 ──
-- gym_ownerships.defense_pet_ids 안의 grading_ids 의 card_id 가 distinct 3
-- 이 아니면 통째 NULL. 점령(소유권/메달) 자체는 유지. 점령자가 재셋업
-- 하면 됨 — get_gyms_state 가 has_defense_deck=false 로 바뀌어 NPC 경로
-- 진행 또는 점령자가 알림 받고 새 카드로 다시 셋업.
do $$
declare
  o_rec record;
  v_distinct int;
begin
  for o_rec in
    select gym_id, defense_pet_ids
      from gym_ownerships
     where defense_pet_ids is not null
       and coalesce(array_length(defense_pet_ids, 1), 0) > 0
  loop
    select count(distinct g.card_id)::int into v_distinct
      from unnest(o_rec.defense_pet_ids) as pid
      join psa_gradings g on g.id = pid;
    if v_distinct <> coalesce(array_length(o_rec.defense_pet_ids, 1), 0) then
      update gym_ownerships
         set defense_pet_ids = null,
             defense_pet_types = null
       where gym_id = o_rec.gym_id;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

-- 마이그레이션: 20260709_gym_defense_distinct_card_id.sql
