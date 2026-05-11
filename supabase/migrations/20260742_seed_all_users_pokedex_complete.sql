-- ============================================================
-- 도감 시드 — 모든 유저, 모든 카드(card_types 전부) 등록 완료.
--
-- 사용자 요구:
--   "모든 유저 도감 전부 등록완료로 해주고, 도감 등급 세트효과도 전부
--    적용시켜서 전투력 올려줘. 체육관에서도 잘 반영돼야 함."
--
-- 정책 (20260726 / 20260717 패턴 그대로, 범위만 전 등급):
--   · pokedex_entries 직접 INSERT (source_grading_id = null).
--   · ON CONFLICT (user_id, card_id) DO NOTHING — 이미 등록 카드 보존.
--   · users.pokedex_count 를 pokedex_entries 실제 row 수로 reconcile.
--   · psa_gradings / 펫 / 방어덱 / 전시 미터치 — 도감 항목만 추가.
--
-- 자동 반영 (마이그레이션 적용 즉시 — DB 함수 live read):
--   · pokedex_completion_bonus(user_id) — 풀세트 +485,000 (20260681 v5).
--       MUR  8/8  → +150,000   UR  61/61 → +90,000
--       SAR 184/184→ +65,000   SR 243/243→ +50,000
--       AR  414/414→ +40,000   MA   5/5  → +30,000
--       RR  253/253→ +24,000   R   288/288→ +18,000
--       U   604/604→ +10,000   C   845/845→  +8,000
--   · pokedex_power_bonus(user_id) — 등급별 정액 합 (20260563).
--       MUR 1000×8 + UR 400×61 + SAR 250×184 + AR 180×414 + SR 130×243
--       + MA 100×5 + RR 50×253 + R 30×288 + U 15×604 + C 8×845
--       = 8000 + 24400 + 46000 + 74520 + 31590 + 500 + 12650 + 8640
--         + 9060 + 6760 = ~222,120
--   · gym_compute_user_center_power (20260702) 가 두 값 모두 합산 →
--     체육관 도전 게이트 / 슬롯 보너스에 즉시 반영.
--   · get_profile / get_user_rankings 도 동일 함수 호출.
--
-- 스케일: card_types 전체 2905 종 (8+61+184+243+414+5+253+288+604+845).
--   9 유저 기준 최대 ~26,145 row INSERT (이미 등록된 항목은 skip).
--
-- 의존성:
--   · 20260524 (pokedex_entries 테이블)
--   · 20260681 (pokedex_completion_bonus v5)
--   · 20260563 (pokedex_power_bonus v2)
--   · 20260664 / 20260679 / 20260680 (card_types — 19 set 카탈로그)
-- ============================================================

do $$
declare
  v_user record;
  v_inserted int;
  v_total int;
  v_completion int;
  v_power_bonus int;
  v_grand_inserted int := 0;
begin
  for v_user in select id, user_id from users order by user_id
  loop
    with new_inserts as (
      insert into pokedex_entries (user_id, card_id, rarity, source_grading_id)
      select v_user.id, ct.card_id, ct.rarity, null
        from card_types ct
       where not exists (
         select 1 from pokedex_entries pe
          where pe.user_id = v_user.id
            and pe.card_id = ct.card_id
       )
      on conflict (user_id, card_id) do nothing
      returning id
    )
    select count(*)::int into v_inserted from new_inserts;

    update users u
       set pokedex_count = (
         select count(*)::int from pokedex_entries pe where pe.user_id = u.id
       )
     where u.id = v_user.id
     returning pokedex_count into v_total;

    v_completion  := pokedex_completion_bonus(v_user.id);
    v_power_bonus := pokedex_power_bonus(v_user.id);

    raise notice '[seed pokedex complete] % : +% 등록 / 도감총 % / 세트효과=% / 도감전투력=%',
      v_user.user_id, v_inserted, v_total, v_completion, v_power_bonus;
    v_grand_inserted := v_grand_inserted + v_inserted;
  end loop;

  raise notice '[seed pokedex complete] 전체 신규 INSERT 합계: %', v_grand_inserted;
end $$;

notify pgrst, 'reload schema';

-- 마이그레이션: 20260742_seed_all_users_pokedex_complete.sql
