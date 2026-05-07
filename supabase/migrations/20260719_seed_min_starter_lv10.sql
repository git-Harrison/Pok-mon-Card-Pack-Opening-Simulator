-- ============================================================
-- min 계정 — 내 포켓몬 Lv.10 진화 대기 상태로 셋업.
--
-- 사용자 요구:
--   "min 계정 내 포켓몬 LV 을 LV10 으로, 진화하기 버튼 노출, LV10 에
--    맞는 전투력 + 반영."
--
-- 셋업 (20260701_seed_hun_starter_lv10 와 동일 패턴):
--   level           = 10  ← Lv.10 도달
--   xp              = 0   ← 방금 도달
--   evolution_stage = 0   ← 1차 진화 미완료 (= "진화하기" 버튼 표시)
--
-- 자동 반영 (마이그레이션 적용 즉시):
--   · 유저 전투력 +95,000 (starter_level_power_bonus(10))
--   · get_profile.center_power / get_user_rankings.center_power 모두
--     user_starter_power_bonus(user_id) 를 live 호출 → 즉시 반영.
--   · 체육관 실제 전투 스탯에는 미반영 (gym_compute_user_center_power
--     가 보너스 제외, 정책: 표시/랭킹용 성장 지표).
--
-- 미변경:
--   · species / nickname / caught_at — 기존 값 유지.
--   · user_starter row 미존재 (포켓몬 미선택) 시 no-op.
--
-- 멱등: UPDATE 만 사용. 여러 번 적용해도 결과 동일.
-- ============================================================

do $$
declare
  v_user_id uuid;
  v_updated int;
begin
  select id into v_user_id from users where user_id = 'min';
  if not found then
    raise notice '[min starter Lv.10 seed] user min 미존재 — skip';
    return;
  end if;

  update user_starter
     set level           = 10,
         xp              = 0,
         evolution_stage = 0
   where user_id = v_user_id;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise notice '[min starter Lv.10 seed] min 의 포켓몬 미선택 — skip (user_starter row 없음)';
  else
    raise notice '[min starter Lv.10 seed] OK — Lv.10 진화 대기 상태로 셋업 (전투력 +95,000)';
  end if;
end $$;

-- 마이그레이션: 20260719_seed_min_starter_lv10.sql
