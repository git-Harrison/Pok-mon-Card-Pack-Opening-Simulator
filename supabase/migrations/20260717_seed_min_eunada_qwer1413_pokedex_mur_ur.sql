-- ============================================================
-- 도감 시드 — min / eunada / qwer1413 3 계정 MUR + UR 전부 등록 완료.
--
-- 사용자 요구:
--   "3개 계정에 MUR/UR 도감 전부 등록완료 된걸로 체크. 세트효과 +
--    도감 전투력 반영. 랭킹/체육관/프로필에서도 반영된 전투력 잘
--    나오는지."
--
-- 정책:
--   · pokedex_entries 직접 INSERT (source_grading_id = null, 슬랩 미보유
--     상태에서도 강제 등록 가능 — 실제 등록 RPC 의 슬랩 소비 우회).
--   · ON CONFLICT (user_id, card_id) DO NOTHING — 멱등.
--   · users.pokedex_count = pokedex_entries 실제 row 수로 reconcile.
--   · psa_gradings 미터치 — 슬랩 보유 여부와 무관하게 도감만 채움.
--   · 펫 / 방어덱 / 전시 / 지갑 모두 미터치.
--
-- 자동 반영 (마이그레이션 적용 즉시):
--   · 세트효과 (pokedex_completion_bonus uuid):
--       MUR 8/8  →  +150,000
--       UR  61/61 →  +90,000
--       합계      →  +240,000 (이미 보유분이 있으면 그만큼 가산)
--     랭킹 / 프로필 / 체육관 모두 live read 라 즉시 반영.
--   · 도감 전투력 (pokedex_power_bonus int) — pokedex_count 곡선 가산.
--
-- 의존성:
--   · 20260524 (pokedex_entries 테이블)
--   · 20260681 (pokedex_completion_bonus v5 — 풀세트 합 485,000)
--   · 20260664 / 20260679 / 20260680 (card_types — 19 set 카탈로그)
-- ============================================================

do $$
declare
  v_target_users constant text[] := array['min', 'eunada', 'qwer1413'];
  v_user_login text;
  v_user_id uuid;
  v_inserted int;
  v_total int;
  v_completion int;
  v_power_bonus int;
begin
  foreach v_user_login in array v_target_users loop
    select id into v_user_id from users where user_id = v_user_login;
    if not found then
      raise notice '[pokedex MUR/UR seed] user % 미존재 — skip', v_user_login;
      continue;
    end if;

    -- card_types 의 MUR + UR 전부 INSERT, 이미 등록된 카드는 skip.
    with new_inserts as (
      insert into pokedex_entries (user_id, card_id, rarity, source_grading_id)
      select v_user_id, ct.card_id, ct.rarity, null
        from card_types ct
       where ct.rarity in ('MUR', 'UR')
         and not exists (
           select 1 from pokedex_entries pe
            where pe.user_id = v_user_id
              and pe.card_id = ct.card_id
         )
      on conflict (user_id, card_id) do nothing
      returning id
    )
    select count(*)::int into v_inserted from new_inserts;

    -- pokedex_count 캐시 reconcile — 실제 row 수와 강제 동기화.
    update users u
       set pokedex_count = (
         select count(*)::int from pokedex_entries pe where pe.user_id = u.id
       )
     where u.id = v_user_id
     returning pokedex_count into v_total;

    v_completion  := pokedex_completion_bonus(v_user_id);
    v_power_bonus := pokedex_power_bonus(v_user_id);

    raise notice '[pokedex MUR/UR seed] user=% +% 등록 / 도감총 % / 세트효과=% / 도감전투력=%',
      v_user_login, v_inserted, v_total, v_completion, v_power_bonus;
  end loop;
end $$;

notify pgrst, 'reload schema';
