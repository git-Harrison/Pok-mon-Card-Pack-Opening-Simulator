-- ============================================================
-- hun 계정 — 내 포켓몬 테스트 데이터: Lv.10 진화 대기 상태로 셋업.
--
-- 목적:
--   - Lv.10 도달 → 1차 진화 가능 토스트 / "진화하기" 버튼 / 진화
--     애니메이션 흐름을 직접 테스트.
--   - LV 기반 유저 전투력 보너스 +95,000 (Lv.10) 표시 확인.
--
-- 셋업:
--   level            = 10   ← Lv.10 도달
--   xp               = 0    ← 방금 도달, 다음 레벨업 EXP 미축적
--   evolution_stage  = 0    ← 1차 진화 미완료 (= "진화 가능" 상태)
--
-- 미변경:
--   - species / nickname / caught_at — 기존 값 유지.
--   - 만약 hun 이 아직 포켓몬을 선택하지 않은 상태면 (user_starter row
--     미존재) 시드는 no-op. 화면에서 먼저 포켓몬을 선택해야 함.
--
-- 멱등: UPDATE 만 사용. 여러 번 적용해도 결과 동일.
-- ============================================================

do $$
declare
  v_user_id uuid;
begin
  select id into v_user_id from users where user_id = 'hun';
  if not found then
    raise notice '[hun starter Lv.10 seed] user hun 미존재 — skip';
    return;
  end if;

  update user_starter
     set level           = 10,
         xp              = 0,
         evolution_stage = 0
   where user_id = v_user_id;

  if not found then
    raise notice '[hun starter Lv.10 seed] hun 의 포켓몬 미선택 — skip (user_starter row 없음)';
  else
    raise notice '[hun starter Lv.10 seed] OK — Lv.10 진화 대기 상태로 셋업';
  end if;
end $$;

-- 마이그레이션: 20260701_seed_hun_starter_lv10.sql
