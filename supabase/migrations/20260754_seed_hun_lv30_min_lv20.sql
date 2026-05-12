-- ============================================================
-- hun → Lv.30 (최종 진화 완료), min → Lv.20 (2차 진화 대기) 시드.
--
-- 사용자 요구:
--   "hun 계정 내 포켓몬 LV30 + 전투력 갱신, min 계정 LV20."
--
-- 셋업:
--   hun: level=30, xp=0, evolution_stage=2  ← 최종 진화 완료 (is_max=true)
--   min: level=20, xp=0, evolution_stage=1  ← 2차 진화 대기 ("진화하기" 노출)
--
-- 자동 반영 (마이그레이션 적용 즉시, 별도 컬럼 갱신 불필요):
--   · hun: 유저 전투력 +1,050,000 (starter_level_power_bonus(30))
--   · min: 유저 전투력 +350,000   (starter_level_power_bonus(20))
--   · get_profile / get_user_rankings 가 user_starter_power_bonus(uid) 를
--     라이브 호출 → API 응답에서 즉시 새 값.
--   · 체육관 전투 스탯에는 미반영 (정책: 표시/랭킹용 성장 지표).
--
-- 미변경: species / nickname / caught_at — 기존 값 유지.
-- 포켓몬 미선택 (user_starter row 없음) 인 계정은 no-op.
--
-- 멱등: UPDATE 만. 반복 적용해도 결과 동일.
-- ============================================================

do $$
declare
  v_user_id uuid;
  v_updated int;
begin
  -- ── hun → Lv.30 / stage 2 ──
  select id into v_user_id from users where user_id = 'hun';
  if not found then
    raise notice '[hun Lv.30 seed] user hun 미존재 — skip';
  else
    update user_starter
       set level           = 30,
           xp              = 0,
           evolution_stage = 2
     where user_id = v_user_id;
    get diagnostics v_updated = row_count;
    if v_updated = 0 then
      raise notice '[hun Lv.30 seed] hun 포켓몬 미선택 — skip (user_starter row 없음)';
    else
      raise notice '[hun Lv.30 seed] OK — Lv.30 최종 진화 완료 (전투력 +1,050,000)';
    end if;
  end if;

  -- ── min → Lv.20 / stage 1 ──
  select id into v_user_id from users where user_id = 'min';
  if not found then
    raise notice '[min Lv.20 seed] user min 미존재 — skip';
  else
    update user_starter
       set level           = 20,
           xp              = 0,
           evolution_stage = 1
     where user_id = v_user_id;
    get diagnostics v_updated = row_count;
    if v_updated = 0 then
      raise notice '[min Lv.20 seed] min 포켓몬 미선택 — skip (user_starter row 없음)';
    else
      raise notice '[min Lv.20 seed] OK — Lv.20 2차 진화 대기 (전투력 +350,000)';
    end if;
  end if;
end $$;

-- 마이그레이션: 20260754_seed_hun_lv30_min_lv20.sql
