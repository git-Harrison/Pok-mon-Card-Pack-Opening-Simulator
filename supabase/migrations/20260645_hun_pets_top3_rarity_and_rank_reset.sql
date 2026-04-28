-- ============================================================
-- (1) hun 펫 재할당 — MUR/UR/SAR 만으로 채움
-- (2) 모든 유저의 gym_daily_rank_pts 리셋 (체육관 초기화 후속)
--
-- 사용자 요청:
--   "hun 계정에 펫 등록 다했는데 제일 높은카드로 해달라니까 R, U
--    등급 같은 것들을 넣었어. MUR, UR, SAR 카드로만 다 채워넣고
--    점수도 제대로 반영돼야 해. 그리고 랭킹 점수에 체육관 일일 +
--    돼있는 점수들 다 빼고 삭제해. 체육관 초기화했잖아."
--
-- 조치:
--   1) hun 의 main_cards_by_type 전체를 비우고 18 속성 순회하며
--      MUR/UR/SAR PCL10 카드만 골라 다시 채움. 해당 속성에 MUR/UR/SAR
--      카드가 없으면 그 속성 슬롯은 비워둠 (R, U 등 폴백 X).
--   2) main_card_ids (legacy) 전체 비움.
--   3) pet_score 재계산.
--   4) 모든 유저의 gym_daily_rank_pts = 0 (체육관 wipe 됐으니 누적
--      랭킹 점수도 리셋).
-- ============================================================

-- ── (1) hun 펫 재할당 ────────────────────────────────────
do $$
declare
  v_user_id uuid;
  v_by_type jsonb := '{}'::jsonb;
  v_type text;
  v_new_ids uuid[];
  v_added_total int := 0;
  TYPES constant text[] := array[
    '노말','불꽃','물','풀','전기','얼음','격투','독','땅',
    '비행','에스퍼','벌레','바위','고스트','드래곤','악','강철','페어리'
  ];
begin
  select id into v_user_id from users where user_id = 'hun';
  if not found then
    raise notice 'user hun 미존재 — top3-rarity refill skip';
    return;
  end if;

  -- 모든 type 슬롯을 새로 채움 — MUR/UR/SAR 만 허용.
  foreach v_type in array TYPES loop
    select array(
      select id
        from (
          select distinct on (g.card_id)
                 g.id,
                 g.card_id,
                 case g.rarity
                   when 'MUR' then 1
                   when 'UR'  then 2
                   when 'SAR' then 3
                   else 99
                 end as rk
            from psa_gradings g
            join card_types ct on ct.card_id = g.card_id
           where g.user_id = v_user_id
             and g.grade = 10
             and ct.wild_type = v_type
             and g.rarity in ('MUR', 'UR', 'SAR')
           order by g.card_id,
                    case g.rarity
                      when 'MUR' then 1
                      when 'UR'  then 2
                      when 'SAR' then 3
                      else 99
                    end
        ) per_card
       order by rk
       limit 3
    ) into v_new_ids;

    if coalesce(array_length(v_new_ids, 1), 0) > 0 then
      v_by_type := jsonb_set(
        v_by_type, array[v_type], to_jsonb(v_new_ids), true
      );
      v_added_total := v_added_total + array_length(v_new_ids, 1);
      raise notice '  [%] %마리 등록 (MUR/UR/SAR)', v_type, array_length(v_new_ids, 1);
    end if;
  end loop;

  update users
     set main_cards_by_type = v_by_type,
         main_card_ids = '{}'::uuid[]
   where id = v_user_id;

  update users
     set pet_score = compute_user_pet_score(v_user_id)
   where id = v_user_id;

  raise notice 'hun MUR/UR/SAR 펫 재할당 완료: 총 % 마리', v_added_total;
end $$;

-- ── (2) 모든 유저 gym_daily_rank_pts 리셋 ────────────────
update users set gym_daily_rank_pts = 0;

notify pgrst, 'reload schema';
