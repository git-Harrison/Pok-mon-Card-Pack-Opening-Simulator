-- ============================================================
-- 도감 시드 — hun 계정 UR + SAR 전부 등록 완료.
--
-- 사용자 요구:
--   "hun 계정 UR/SAR 도감 전부 등록 완료. MUR 은 이미 완료. 이미
--    완료된 항목은 건드리지 말 것."
--
-- 정책:
--   · pokedex_entries 직접 INSERT (source_grading_id = null).
--   · ON CONFLICT (user_id, card_id) DO NOTHING — 이미 등록된 카드는
--     자동 skip (MUR 포함 기존 항목 모두 보존).
--   · users.pokedex_count = pokedex_entries 실제 row 수로 reconcile.
--   · psa_gradings / 펫 / 방어덱 / 전시 미터치.
--
-- 자동 반영 (마이그레이션 적용 즉시):
--   · 세트효과 (pokedex_completion_bonus uuid):
--       UR  61/61  → +90,000
--       SAR 184/184 → +65,000
--       (MUR 기존 가산분과 합산)
--   · 도감 전투력 (pokedex_power_bonus int) — pokedex_count 곡선 가산.
--
-- 의존성:
--   · 20260524 (pokedex_entries 테이블)
--   · 20260681 (pokedex_completion_bonus v5)
--   · 20260664 / 20260679 / 20260680 (card_types — 19 set 카탈로그)
-- ============================================================

do $$
declare
  v_user_id uuid;
  v_inserted int;
  v_total int;
  v_completion int;
  v_power_bonus int;
begin
  select id into v_user_id from users where user_id = 'hun';
  if not found then
    raise notice '[hun UR/SAR seed] user hun 미존재 — skip';
    return;
  end if;

  with new_inserts as (
    insert into pokedex_entries (user_id, card_id, rarity, source_grading_id)
    select v_user_id, ct.card_id, ct.rarity, null
      from card_types ct
     where ct.rarity in ('UR', 'SAR')
       and not exists (
         select 1 from pokedex_entries pe
          where pe.user_id = v_user_id
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
   where u.id = v_user_id
   returning pokedex_count into v_total;

  v_completion  := pokedex_completion_bonus(v_user_id);
  v_power_bonus := pokedex_power_bonus(v_user_id);

  raise notice '[hun UR/SAR seed] +% 등록 / 도감총 % / 세트효과=% / 도감전투력=%',
    v_inserted, v_total, v_completion, v_power_bonus;
end $$;

notify pgrst, 'reload schema';
