-- ============================================================
-- eunada / min 펫 초기화 + MUR>UR>SAR>SR 우선순위로 전 속성 펫 재등록.
--
-- 사용자 요구:
--   "eunada, min 계정에 등록된 모든 속성 펫 삭제하고 MUR/UR/SAR/SR 로 모든
--    속성 펫 등록. MUR 부터 다 채우고 부족하면 UR, 그래도 부족하면 SAR,
--    그 다음 SR." (단순 재등록 — 카드지갑 신규 INSERT 없음.)
--
-- 처리 (20260706 hun pet_reset_and_mur_kit 의 1·2 단계만, MUR-kit 단계
-- 제외):
--   1) main_cards_by_type / main_card_ids 비움 (전시·방어덱은 미터치).
--   2) 보유 PCL10 슬랩을 (MUR>UR>SAR>SR, graded_at) 순으로 정렬.
--      각 슬랩의 (wild_type, wild_type_2) 중 빈 자리 (3 미만) 있는 type
--      에 배치. 같은 card_id 는 한 type 에만 (cross-slot 중복 X — 서버
--      set_pet_for_type 검증과 일치). 트레이너/에너지 등 wild_type null
--      카드는 펫 후보 X. 전시/방어덱에 쓰이는 슬랩은 제외.
--   3) pet_score 재계산.
--
-- 멱등 주의: 본문 수정 후 CI 가 재적용하면 또 reset+refill 됨. 중간에
-- 사용자가 펫 구성을 바꿨다면 사용자 변경 분이 날아갈 수 있으므로
-- 의도 없이 본문 손대지 말 것.
--
-- 의존성: 20260706 (패턴), 20260733 (eunada 카드지갑 MUR+UR 시드 — 이
-- 마이그 적용 시점에 eunada 가 MUR/UR 풀 보유 보장).
-- ============================================================

create or replace function _tmp_pet_reset_priority_refill(p_user_text text)
returns void
language plpgsql
as $$
declare
  v_user_id uuid;
  v_used_ids uuid[] := '{}'::uuid[];
  v_used_card_ids text[] := '{}'::text[];
  v_slots jsonb := '{}'::jsonb;
  v_slab record;
  v_type text;
  v_existing_arr jsonb;
  v_picked_type text;
  v_pet_count int := 0;
begin
  select id into v_user_id from users where user_id = p_user_text;
  if not found then
    raise notice '[% pet refill] user 미존재 — skip', p_user_text;
    return;
  end if;

  update users
     set main_cards_by_type = '{}'::jsonb,
         main_card_ids = '{}'::uuid[]
   where id = v_user_id;

  v_used_ids := array(
    select sc.grading_id
      from showcase_cards sc
      join user_showcases us on us.id = sc.showcase_id
     where us.user_id = v_user_id
       and sc.grading_id is not null
  ) || array(
    select x
      from gym_ownerships go,
           unnest(coalesce(go.defense_pet_ids, '{}'::uuid[])) x
     where go.owner_user_id = v_user_id
       and go.defense_pet_ids is not null
  );

  for v_slab in
    select g.id, g.card_id, g.rarity, ct.wild_type, ct.wild_type_2
      from psa_gradings g
      join card_types ct on ct.card_id = g.card_id
     where g.user_id = v_user_id
       and g.grade = 10
       and g.rarity in ('MUR','UR','SAR','SR')
       and ct.wild_type is not null
       and not (g.id = any(v_used_ids))
     order by
       case g.rarity
         when 'MUR' then 1 when 'UR'  then 2
         when 'SAR' then 3 when 'SR'  then 4
         else 99
       end,
       g.graded_at
  loop
    if v_slab.card_id = any(v_used_card_ids) then
      continue;
    end if;

    v_picked_type := null;
    foreach v_type in array
      array_remove(array[v_slab.wild_type, v_slab.wild_type_2], null)
    loop
      v_existing_arr := coalesce(v_slots -> v_type, '[]'::jsonb);
      if jsonb_array_length(v_existing_arr) < 3 then
        v_picked_type := v_type;
        exit;
      end if;
    end loop;

    if v_picked_type is not null then
      v_existing_arr := coalesce(v_slots -> v_picked_type, '[]'::jsonb);
      v_slots := jsonb_set(
        v_slots, array[v_picked_type],
        v_existing_arr || to_jsonb(v_slab.id::text), true
      );
      v_used_card_ids := v_used_card_ids || v_slab.card_id;
      v_pet_count := v_pet_count + 1;
    end if;
  end loop;

  update users
     set main_cards_by_type = v_slots
   where id = v_user_id;

  update users
     set pet_score = compute_user_pet_score(v_user_id)
   where id = v_user_id;

  raise notice '[% pet refill] 펫 % 마리 등록 (% 속성)',
    p_user_text, v_pet_count,
    (select count(*) from jsonb_object_keys(v_slots));
end $$;

select _tmp_pet_reset_priority_refill('eunada');
select _tmp_pet_reset_priority_refill('min');

drop function _tmp_pet_reset_priority_refill(text);

notify pgrst, 'reload schema';

-- 마이그레이션: 20260734_seed_eunada_min_pet_reset_priority_refill.sql
