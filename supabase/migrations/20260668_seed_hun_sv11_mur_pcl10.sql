-- ============================================================
-- hun 계정 시드 — SV11 신규 MUR 2종 PCL10 슬랩 1장씩 카드지갑 추가.
--
-- 사용자 요구:
--   "신규 추가된 MUR 카드 2종 (sv11b-174 제크로무 ex / sv11w-174
--    레시라무 ex) PCL10 슬랩 각 1장 hun 카드지갑에 시드. 도감/펫/
--    체육관 자동 반영 X — 카드지갑(psa_gradings)에만 추가."
--
-- 정책:
--   · psa_gradings INSERT 만 — 슬랩 보유 상태만 생성.
--   · pokedex_entries 미터치 — 도감 등록 안 됨.
--   · users.main_card_ids / main_cards_by_type 미터치 — 펫 자동 등록
--     안 됨.
--   · gym_ownerships.defense_pet_ids 미터치 — 체육관 방어덱 안 들어감.
--   · pcl_10_wins 카운터 만큼 가산 (감별 누적 통계 일관성).
--
-- 멱등:
--   · 이미 같은 card_id 의 PCL10 슬랩이 1장 이상 있으면 skip.
--
-- 의존성: 20260664 (card_types — sv11 카드 카탈로그).
-- ============================================================

do $$
declare
  v_user_id uuid;
  v_target_cards constant text[] := array['sv11b-174', 'sv11w-174'];
  v_card_id text;
  v_existing int;
  v_total_inserted int := 0;
begin
  select id into v_user_id from users where user_id = 'hun';
  if not found then
    raise notice '[hun sv11 mur seed] user hun 미존재 — skip';
    return;
  end if;

  foreach v_card_id in array v_target_cards loop
    -- 카탈로그 검증 — 실제 존재 + MUR 인지 확인.
    if not exists (
      select 1 from card_types
       where card_id = v_card_id
         and rarity = 'MUR'
    ) then
      raise notice '[hun sv11 mur seed] card_types 에 % (MUR) 없음 — skip', v_card_id;
      continue;
    end if;

    -- 멱등 — 이미 1장 이상 보유하면 skip.
    select count(*)::int into v_existing
      from psa_gradings
     where user_id = v_user_id
       and card_id = v_card_id
       and grade = 10;

    if v_existing >= 1 then
      raise notice '[hun sv11 mur seed] card=% 이미 % 장 보유 — skip',
        v_card_id, v_existing;
      continue;
    end if;

    insert into psa_gradings (user_id, card_id, grade, rarity)
      values (v_user_id, v_card_id, 10, 'MUR');

    v_total_inserted := v_total_inserted + 1;
    raise notice '[hun sv11 mur seed] card=% PCL10 1장 추가', v_card_id;
  end loop;

  if v_total_inserted > 0 then
    update users
       set pcl_10_wins = coalesce(pcl_10_wins, 0) + v_total_inserted
     where id = v_user_id;
    raise notice '[hun sv11 mur seed] 총 % 장 추가 (pcl_10_wins +%)',
      v_total_inserted, v_total_inserted;
  else
    raise notice '[hun sv11 mur seed] 추가할 슬랩 없음 (모두 이미 보유)';
  end if;
end $$;

notify pgrst, 'reload schema';
