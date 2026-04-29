-- ============================================================
-- 도감 자동 등록 버그(20260543)로 발생한 dangling 참조 정리.
--
-- 사용자 요청:
--   "기존에 잘못 등록된 데이터가 있다면 정리 (옵션: 필요 시 마이그레이션)"
--
-- 배경:
--   20260543 픽스 이전, 사용자가 펫(main_cards_by_type) 또는 방어덱
--   (gym_ownerships.defense_pet_ids) 에 슬랩을 등록한 상태에서
--   "도감 일괄 등록" 을 누르면 그 슬랩이 도감으로 빨려 들어가며
--   psa_gradings row 가 삭제됨. 결과로:
--     · main_cards_by_type 의 jsonb 배열에 dangling uuid 가 남음.
--     · main_card_ids (legacy) 도 동일.
--     · gym_ownerships.defense_pet_ids 에도 dangling uuid 가 남음.
--
-- 정책:
--   · 도감 entry 자체는 보존. (PCL10 획득 → 등록은 어쨌거나 사용자
--     의도에 부합하는 결과로 간주 — 단, 펫/방어덱 슬롯에는 더 이상
--     없는 게 맞음.)
--   · 펫/방어덱 슬롯에서 죽은 grading_id 만 청소.
--   · 청소 후 pet_score / pokedex_count 를 실제 데이터에 맞춰 재동기화.
--
-- 멱등 — 죽은 ID 가 없으면 그대로 끝남. CI 재실행 안전.
-- ============================================================

-- 1) main_card_ids (legacy) — 살아있는 grading 만 남김.
update users u
   set main_card_ids = coalesce((
     select array_agg(id)
       from unnest(u.main_card_ids) as id
      where exists (
        select 1 from psa_gradings g
         where g.id = id and g.user_id = u.id and g.grade = 10
      )
   ), '{}'::uuid[])
 where coalesce(array_length(u.main_card_ids, 1), 0) > 0
   and exists (
     select 1
       from unnest(u.main_card_ids) as id
      where not exists (
        select 1 from psa_gradings g
         where g.id = id and g.user_id = u.id and g.grade = 10
      )
   );

-- 2) main_cards_by_type — type 별 jsonb 배열에서 죽은 ID 제거.
do $$
declare
  v_user record;
  v_by_type jsonb;
  v_new_by_type jsonb;
  v_type text;
  v_arr jsonb;
  v_kept uuid[];
  v_id uuid;
  v_changed boolean;
  v_total_cleaned int := 0;
begin
  for v_user in
    select id, main_cards_by_type
      from users
     where coalesce(main_cards_by_type, '{}'::jsonb) <> '{}'::jsonb
  loop
    v_by_type := v_user.main_cards_by_type;
    v_new_by_type := '{}'::jsonb;
    v_changed := false;

    for v_type in select jsonb_object_keys(v_by_type) loop
      v_arr := v_by_type -> v_type;
      v_kept := '{}'::uuid[];

      for v_id in
        select (e.value)::uuid
          from jsonb_array_elements_text(v_arr) e
      loop
        if exists (
          select 1 from psa_gradings g
           where g.id = v_id and g.user_id = v_user.id and g.grade = 10
        ) then
          v_kept := v_kept || v_id;
        else
          v_changed := true;
          v_total_cleaned := v_total_cleaned + 1;
          raise notice '[user %] type % dangling % 제거', v_user.id, v_type, v_id;
        end if;
      end loop;

      if coalesce(array_length(v_kept, 1), 0) > 0 then
        v_new_by_type := jsonb_set(v_new_by_type, array[v_type], to_jsonb(v_kept), true);
      end if;
    end loop;

    if v_changed then
      update users set main_cards_by_type = v_new_by_type where id = v_user.id;
    end if;
  end loop;

  raise notice 'main_cards_by_type 청소 완료: % 개 dangling uuid 제거', v_total_cleaned;
end $$;

-- 3) gym_ownerships.defense_pet_ids — 죽은 grading 제거.
--    배열에 NULL 이 섞이거나 길이 < 3 이 되면 set_gym_defense_deck
--    가드가 다음번 갱신을 강제하므로 안전. 0 으로 비우면 게임은
--    NPC 모드로 폴백 (resolve_gym_battle 에서 array_length=3 체크).
do $$
declare
  v_owner record;
  v_kept uuid[];
  v_id uuid;
  v_total_cleaned int := 0;
begin
  for v_owner in
    select gym_id, owner_user_id, defense_pet_ids, defense_pet_types
      from gym_ownerships
     where coalesce(array_length(defense_pet_ids, 1), 0) > 0
  loop
    v_kept := '{}'::uuid[];
    foreach v_id in array v_owner.defense_pet_ids loop
      if exists (
        select 1 from psa_gradings g
         where g.id = v_id and g.user_id = v_owner.owner_user_id and g.grade = 10
      ) then
        v_kept := v_kept || v_id;
      else
        v_total_cleaned := v_total_cleaned + 1;
        raise notice '[gym %] dangling defense % 제거', v_owner.gym_id, v_id;
      end if;
    end loop;

    -- 3 마리 가드 — 누구 하나라도 죽었으면 방어덱 전체를 NULL 로
    --              만들어 비점령 상태로 폴백.
    if coalesce(array_length(v_kept, 1), 0) <> 3 then
      update gym_ownerships
         set defense_pet_ids = null,
             defense_pet_types = null
       where gym_id = v_owner.gym_id;
    end if;
  end loop;

  raise notice 'defense_pet_ids 청소 완료: % 개 dangling uuid 제거', v_total_cleaned;
end $$;

-- 4) pet_score 재동기화 (펫 청소된 사용자들).
update users u
   set pet_score = compute_user_pet_score(u.id);

-- 5) pokedex_count 재동기화 (실제 entry 수에 맞춤).
update users u
   set pokedex_count = coalesce((
     select count(*)::int from pokedex_entries pe where pe.user_id = u.id
   ), 0);

notify pgrst, 'reload schema';
