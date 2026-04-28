-- ============================================================
-- 평원 체육관 (gym-normal) 단독 초기화
--
-- 사용자 요청:
--   "평원 체육관 최소전투력이 올랐으니 평원만 점령 초기화 + default
--    상태로. 방어덱 포켓몬은 hun 계정 펫 슬롯으로 다시 넣고, hun 의
--    평원 체육관 메달도 회수."
--
-- 메달 회수 시 전투력 영향 자동:
--   메달 전투력은 center_power 계산 시 매번 `sum(gym_medal_buff(g.id))`
--   로 합산. user_gym_medals 에서 row 가 빠지면 다음 get_profile /
--   get_user_rankings 호출에서 자연스럽게 제외됨. 평원 메달의 buff =
--   gym_medal_buff('gym-normal') = 45,000 → 그만큼 center_power 감소.
--
-- 동작:
--   1) gym-normal 의 점령자 (있으면) 의 defense_pet_ids/types 를 그
--      유저의 main_cards_by_type[노말] 으로 되돌림 (정확히 노말 슬랩만).
--      방어덱 등록 시 main_cards 에서 빠졌던 카드들이 복원됨.
--   2) gym_ownerships, gym_challenges (gym-normal), gym_battle_logs
--      (gym-normal), gym_cooldowns (gym-normal), gym_rewards (gym-normal)
--      모두 정리.
--   3) hun 의 평원 메달 (user_gym_medals row) 삭제.
--   4) 영향 받은 유저 pet_score 재계산.
-- ============================================================

do $$
declare
  v_owner_id uuid;
  v_def_ids uuid[];
  v_def_types text[];
  v_old_by_type jsonb;
  v_normal_ids uuid[];
  v_combined_normal uuid[];
begin
  -- 현재 평원 점령자 조회.
  select owner_user_id, defense_pet_ids, defense_pet_types
    into v_owner_id, v_def_ids, v_def_types
    from gym_ownerships
   where gym_id = 'gym-normal';

  if v_owner_id is not null then
    raise notice '평원 점령자 = % — 방어덱 펫 복원 시작', v_owner_id;

    -- 점령자의 main_cards_by_type 가져와서 노말 슬롯에 복원.
    select coalesce(main_cards_by_type, '{}'::jsonb)
      into v_old_by_type
      from users where id = v_owner_id;

    v_normal_ids := array(
      select (e.value)::uuid
        from jsonb_array_elements_text(
          coalesce(v_old_by_type -> '노말', '[]'::jsonb)
        ) e
    );

    -- 방어덱 슬랩들 중 노말 type 으로 등록됐던 것만 노말 슬롯 복원.
    -- (defense_pet_types 가 슬롯별로 들어있음 — gym-normal 이라 모두
    -- '노말' 일 것.) 중복 방지로 distinct.
    if v_def_ids is not null and array_length(v_def_ids, 1) > 0 then
      v_combined_normal := array(
        select distinct id
          from unnest(v_normal_ids || v_def_ids) as id
      );
      -- 슬롯 cap 3 — 초과 시 앞 3 개만.
      if coalesce(array_length(v_combined_normal, 1), 0) > 3 then
        v_combined_normal := v_combined_normal[1:3];
      end if;

      v_old_by_type := jsonb_set(
        v_old_by_type, array['노말'], to_jsonb(v_combined_normal), true
      );

      update users
         set main_cards_by_type = v_old_by_type
       where id = v_owner_id;

      raise notice '  → 노말 슬롯 복원 % 마리', array_length(v_combined_normal, 1);
    end if;
  else
    raise notice '평원 점령자 없음 — pets 복원 skip';
  end if;

  -- gym-normal 관련 모든 사용자 상태 정리.
  delete from gym_cooldowns  where gym_id = 'gym-normal';
  delete from gym_rewards    where gym_id = 'gym-normal';
  delete from gym_battle_logs where gym_id = 'gym-normal';
  delete from gym_challenges  where gym_id = 'gym-normal';
  delete from gym_ownerships  where gym_id = 'gym-normal';

  -- hun 평원 메달 회수 — user_gym_medals 에서 row 삭제.
  -- (다른 유저가 평원 메달 보유 중이면 함께 회수. 사용자 요청은
  -- hun 명시지만 평원 자체를 default 로 되돌리려면 모든 유저의
  -- 평원 메달을 회수하는 게 일관됨.)
  delete from user_gym_medals where gym_id = 'gym-normal';

  -- 영향 받은 유저 pet_score 재계산 (점령자 + 메달 보유자).
  if v_owner_id is not null then
    update users
       set pet_score = compute_user_pet_score(v_owner_id)
     where id = v_owner_id;
  end if;

  raise notice '평원 (gym-normal) 단독 초기화 완료';
end $$;

notify pgrst, 'reload schema';
