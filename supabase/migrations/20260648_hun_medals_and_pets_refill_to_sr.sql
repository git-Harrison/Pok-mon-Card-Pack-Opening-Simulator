-- ============================================================
-- (1) hun 계정 메달 4종 시드 — 잎새/물결/바위/얼음
-- (2) hun 빈 펫 슬롯 추가 채움 — MUR > UR > SAR > SR 우선순위
--
-- 사용자 요청:
--   "hun 계정에 잎새/파도(물결)/암석(바위)/빙하(얼음) 메달 시드.
--    그리고 다시 펫 속성마다 빈 슬롯 PCL10 MUR>UR>SAR>SR 순으로 채워."
--
-- (1) 메달 매핑:
--   잎새 메달 ← gym-grass (풀)
--   물결 메달 ← gym-water (물)
--   바위 메달 ← gym-rock  (바위)
--   얼음 메달 ← gym-ice   (얼음)
--   user_gym_medals (user_id, gym_id) PK 라 ON CONFLICT 로 멱등.
--   메달 보유는 영구 — 체육관 점령 잃어도 유지.
--
-- (2) 펫 빈 슬롯 추가 채움:
--   20260647 와 동일 패턴이지만 SR 까지 포함 (MUR/UR/SAR 다음 폴백).
--   카탈로그(card_types) 에서 직접 시드 — 보유 안 한 카드는 새
--   PCL10 슬랩으로 insert. 멱등 — 같은 card_id 가 이미 어딘가
--   슬롯에 있으면 skip.
-- ============================================================

-- ── (1) 메달 시드 ─────────────────────────────────────────
do $$
declare
  v_user_id uuid;
  v_gym_id text;
  v_medal_id uuid;
  v_added int := 0;
begin
  select id into v_user_id from users where user_id = 'hun';
  if not found then
    raise notice 'user hun 미존재 — medal seed skip';
    return;
  end if;

  for v_gym_id in
    select unnest(array['gym-grass', 'gym-water', 'gym-rock', 'gym-ice'])
  loop
    select id into v_medal_id from gym_medals where gym_id = v_gym_id;
    if v_medal_id is null then
      raise notice '  [%] 메달 템플릿 없음 — skip', v_gym_id;
      continue;
    end if;

    insert into user_gym_medals (user_id, gym_id, medal_id, earned_at)
      values (v_user_id, v_gym_id, v_medal_id, now())
      on conflict (user_id, gym_id) do nothing;

    if found then
      v_added := v_added + 1;
      raise notice '  [%] 메달 시드 OK', v_gym_id;
    end if;
  end loop;

  raise notice 'hun 메달 시드 완료: % 개', v_added;
end $$;

-- ── (2) 펫 빈 슬롯 채움 — MUR > UR > SAR > SR ─────────────
do $$
declare
  v_user_id uuid;
  v_by_type jsonb;
  v_type text;
  v_current_ids uuid[];
  v_already_used_card_ids text[];
  v_needed int;
  v_card record;
  v_grading_id uuid;
  v_new_inserts int := 0;
  v_added_total int := 0;
  TYPES constant text[] := array[
    '노말','불꽃','물','풀','전기','얼음','격투','독','땅',
    '비행','에스퍼','벌레','바위','고스트','드래곤','악','강철','페어리'
  ];
begin
  select id into v_user_id from users where user_id = 'hun';
  if not found then
    raise notice 'user hun 미존재 — pet refill skip';
    return;
  end if;

  select coalesce(main_cards_by_type, '{}'::jsonb)
    into v_by_type
    from users where id = v_user_id;

  foreach v_type in array TYPES loop
    v_current_ids := array(
      select (e.value)::uuid
        from jsonb_array_elements_text(
          coalesce(v_by_type -> v_type, '[]'::jsonb)
        ) e
    );
    v_needed := 3 - coalesce(array_length(v_current_ids, 1), 0);
    if v_needed <= 0 then continue; end if;

    -- 모든 type 슬롯에 들어간 card_id (cross-type 중복 방지).
    select coalesce(array_agg(distinct g.card_id), '{}'::text[])
      into v_already_used_card_ids
      from psa_gradings g
     where g.id = any(flatten_pet_ids_by_type(v_by_type));

    -- 카탈로그에서 MUR > UR > SAR > SR 우선순위로 선정.
    for v_card in
      select ct.card_id, ct.rarity
        from card_types ct
       where ct.wild_type = v_type
         and ct.rarity in ('MUR', 'UR', 'SAR', 'SR')
         and not (ct.card_id = any(v_already_used_card_ids))
       order by case ct.rarity
                  when 'MUR' then 1
                  when 'UR'  then 2
                  when 'SAR' then 3
                  when 'SR'  then 4
                  else 99
                end,
                ct.card_id
       limit v_needed
    loop
      v_grading_id := null;
      select id into v_grading_id
        from psa_gradings
       where user_id = v_user_id
         and card_id = v_card.card_id
         and grade = 10
       limit 1;

      if v_grading_id is null then
        insert into psa_gradings (user_id, card_id, grade, rarity)
          values (v_user_id, v_card.card_id, 10, v_card.rarity)
          returning id into v_grading_id;
        v_new_inserts := v_new_inserts + 1;
      end if;

      v_current_ids := v_current_ids || v_grading_id;
      v_already_used_card_ids := v_already_used_card_ids || v_card.card_id;
      v_added_total := v_added_total + 1;
      raise notice '  [%] +% (%) grading=%', v_type, v_card.card_id, v_card.rarity, v_grading_id;
    end loop;

    if coalesce(array_length(v_current_ids, 1), 0) > 0 then
      v_by_type := jsonb_set(
        v_by_type, array[v_type], to_jsonb(v_current_ids), true
      );
    end if;
  end loop;

  update users
     set main_cards_by_type = v_by_type
   where id = v_user_id;

  if v_new_inserts > 0 then
    update users
       set pcl_10_wins = coalesce(pcl_10_wins, 0) + v_new_inserts
     where id = v_user_id;
  end if;

  update users
     set pet_score = compute_user_pet_score(v_user_id)
   where id = v_user_id;

  raise notice 'hun 빈 슬롯 채움 완료 (MUR/UR/SAR/SR): % 슬롯, % 신규 insert',
    v_added_total, v_new_inserts;
end $$;

notify pgrst, 'reload schema';
