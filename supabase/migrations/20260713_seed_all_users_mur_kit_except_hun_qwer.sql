-- ============================================================
-- hun, qwer1413 제외 전체 유저 카드지갑에 MUR 종류별 1장 무조건 INSERT.
--
-- 사용자 정정:
--   "hun, qwer1413 제외 모든 계정에 현재 존재하는 모든 MUR 카드 종류별로
--    1장씩 무조건 추가. 이미 보유 중이어도 상관없이 추가, 중복 체크하지
--    말고 1장씩 넣어줘."
--
-- 처리:
--   · users 전체 × card_types(rarity='MUR') cross join 으로 INSERT.
--   · 멱등 가드 없음 — 매번 실행 시 N장 추가 (재실행하면 또 추가됨).
--     → 마이그레이션 ledger 가 "한 번 실행 후 checksum 일치" 로 막아주므로
--        재실행 위험은 ledger 기준 차단. 본 시드는 일회성 의도.
--   · pcl_10_wins 도 per-user MUR 종 수만큼 누적.
--
-- 미터치:
--   · UR/SAR/SR 카드.
--   · 펫 등록 (main_card_ids / main_cards_by_type).
--   · 체육관 방어덱 (gym_ownerships.defense_pet_ids).
--   · 전시 (showcase_cards).
--   · hun, qwer1413 계정은 명시적 제외.
-- ============================================================

do $$
declare
  v_inserted int := 0;
  v_users int := 0;
  v_mur_count int := 0;
begin
  select count(*)::int into v_mur_count
    from card_types where rarity = 'MUR';

  select count(*)::int into v_users
    from users
   where user_id is not null
     and user_id not in ('hun', 'qwer1413');

  with new_inserts as (
    insert into psa_gradings (user_id, card_id, grade, rarity)
    select u.id, ct.card_id, 10, 'MUR'
      from users u
      cross join card_types ct
     where u.user_id is not null
       and u.user_id not in ('hun', 'qwer1413')
       and ct.rarity = 'MUR'
    returning id
  )
  select count(*)::int into v_inserted from new_inserts;

  if v_inserted > 0 then
    update users u
       set pcl_10_wins = coalesce(u.pcl_10_wins, 0) + v_mur_count
     where u.user_id is not null
       and u.user_id not in ('hun', 'qwer1413');
  end if;

  raise notice '[bulk MUR seed] % users × % MUR types = %장 INSERT (hun/qwer1413 제외)',
    v_users, v_mur_count, v_inserted;
end $$;

-- 마이그레이션: 20260713_seed_all_users_mur_kit_except_hun_qwer.sql
