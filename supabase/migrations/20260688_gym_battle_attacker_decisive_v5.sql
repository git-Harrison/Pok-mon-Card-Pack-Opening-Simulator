-- ============================================================
-- 체육관 전투 밸런스 — 공격자 결정적 우위 + 방어자 화력 약화 (v5)
--
-- 사용자 리포트 (v4 적용 후에도 방어자 우세 지속):
--   "비슷한 수준이면 공격자가 더 자주 이겨야 한다."
--   "방어자가 압도적으로 강한 카드일 때만 방어자가 이겨야 한다."
--   "공격자 +10% ATK 정도로는 체감이 안 된다 — 더 확실하게."
--   "유저 전투력 기반 hidden 보정이 남아있다면 완전 제거."
--
-- v4 → v5 변경 요약:
--   · gym_attacker_atk_multiplier()  1.10 → 1.30  (+20%p 추가 강화)
--   · gym_attacker_hp_multiplier()   신규 — 1.15  (공격자 생존력)
--   · gym_defender_atk_multiplier()  신규 — 0.85  (방어자 화력 약화)
--   · gym_defender_hp_multiplier()   1.00 유지     (이미 v4 에서 보정 제거)
--   · gym_power_bonus_rate()         항상 0 유지   (center_power 영향 없음)
--   · gym_mur_attack_multiplier()    1.05 유지     (MUR 공격 우대)
--   · gym_type_match_multiplier()    1.10 유지     (속성 일치 — 양측 동일 적용
--                                                   이라 사실상 상쇄)
--
-- 실제 체감 (동일 등급 SR×3 vs SR×3, 속성 일치):
--   · 공격자 한 마리: HP 110×1.15 = 126,  ATK 24×1.30×1.10 = 34
--   · 방어자 한 마리: HP 110,             ATK 24×0.85×1.10 = 22
--   · 평균 데미지로 환산하면 공격자가 4턴에 KO, 방어자는 6턴 필요.
--   · 도전자 선공 + 턴순서 보존(20260660) 결합 → 공격자 60~70% 승률.
--
--   방어자가 한 등급 위 (UR) 일 때:
--   · 공격자 SR: HP 126, ATK 34
--   · 방어자 UR: HP 165, ATK 39×0.85×1.10 = 36
--   · 화력은 유사, HP 차이로 방어자 우세 유지 → 카드 자산 차이는 보존.
--
--   방어자가 두 등급 위 (MUR) 일 때:
--   · 공격자 SR: HP 126, ATK 34
--   · 방어자 MUR: HP 240, ATK 60×0.85×1.10 = 56
--   · 방어자 명확 우세 → "강한 방어덱은 여전히 의미 있다" 보존.
--
-- 영향 범위:
--   · gym_pet_battle_stats(uuid,int,int,text,text,boolean) — 본문만 재정의.
--     시그니처/컬럼 동일.
--   · resolve_gym_battle (20260660) — 시그니처/호출 동일. 새 stat 자동 적용.
--   · default NPC 시뮬 (점령 X 체육관) — gym_pokemon 경로는 본 마이그레이션
--     영향 받지 않음 (defender stat 함수 미호출).
--   · UI / pet_score / 메달 / 도감 — 무영향.
--
-- 멱등 — 모든 변경은 CREATE OR REPLACE FUNCTION. 기존 시그니처 유지.
-- ============================================================

-- ── 1) 공격자 ATK 보정 — v4 1.10 → v5 1.30 ──────────────────
create or replace function gym_attacker_atk_multiplier()
returns numeric language sql immutable
set search_path = public, extensions
as $$ select 1.30::numeric $$;

-- ── 2) 공격자 HP 보정 — 신규 ─────────────────────────────────
-- 공격자 펫 3마리의 생존력을 확보. KOF 식 슬롯 교체에서 첫 펫이 너무
-- 일찍 쓰러져 후속 슬롯 기여가 사라지는 문제를 완화.
create or replace function gym_attacker_hp_multiplier()
returns numeric language sql immutable
set search_path = public, extensions
as $$ select 1.15::numeric $$;

-- ── 3) 방어자 ATK 보정 — 신규 (약화) ─────────────────────────
-- "방어덱이 기본적으로 버티며 이기는 구조" 를 깨기 위해 방어자 화력을
-- -15% 약화. 카드 base 차이는 그대로 살아있어 강한 방어덱(UR/MUR)의
-- 의미는 유지됨.
create or replace function gym_defender_atk_multiplier()
returns numeric language sql immutable
set search_path = public, extensions
as $$ select 0.85::numeric $$;

-- ── 4) 방어자 HP 보정 — v4 1.00 유지 (no-op, helper 호출만 유지) ─
-- 이미 v4 에서 1.10 → 1.00 으로 hidden HP 보너스 제거됨. 재정의는
-- idempotent 호환을 위해 동일 본문으로 한 번 더 선언.
create or replace function gym_defender_hp_multiplier()
returns numeric language sql immutable
set search_path = public, extensions
as $$ select 1.00::numeric $$;

-- ── 5) center_power → 스탯 보정 — v4 항상 0 유지 ─────────────
-- 사용자 전투력이 hp/atk 에 영향 주는 hidden multiplier 가 절대 되살아
-- 나지 않도록 본 마이그레이션에서도 한 번 더 0 으로 고정.
create or replace function gym_power_bonus_rate(
  p_center_power int,
  p_rarity text
) returns numeric
language sql immutable
set search_path = public, extensions
as $$ select 0::numeric $$;

grant execute on function gym_attacker_atk_multiplier() to anon, authenticated;
grant execute on function gym_attacker_hp_multiplier() to anon, authenticated;
grant execute on function gym_defender_atk_multiplier() to anon, authenticated;
grant execute on function gym_defender_hp_multiplier() to anon, authenticated;
grant execute on function gym_power_bonus_rate(int, text) to anon, authenticated;

-- ── 6) gym_pet_battle_stats — v5 산식 ────────────────────────
-- 시그니처/반환 컬럼 동일 (resolve_gym_battle 호출부 변경 없음).
--
-- 산식 순서:
--   (1) PCL 10 hard gate (grade != 10 이면 row 미반환 → 호출 측 abort).
--   (2) 펫 속성 정규화.
--   (3) 희귀도 base hp/atk 적재 (gym_rarity_base_stats).
--   (4) center_power 보정 — v5 에서도 사용 안 함 (gym_power_bonus_rate=0).
--   (5) 공격자/방어자 분기 보정:
--       - 공격자: HP × gym_attacker_hp_multiplier() (1.15)
--                 ATK × gym_attacker_atk_multiplier() (1.30)
--       - 방어자: HP × gym_defender_hp_multiplier() (1.00, no-op)
--                 ATK × gym_defender_atk_multiplier() (0.85)
--   (6) MUR 공격자 ATK × gym_mur_attack_multiplier() (1.05) — 유지.
--   (7) 속성 일치 ATK × gym_type_match_multiplier() (1.10) — 양측 동일.

create or replace function gym_pet_battle_stats(
  p_grading_id uuid,
  p_slot int,
  p_center_power int,
  p_gym_type text,
  p_pet_type text,
  p_is_defender boolean default false
) returns table(
  hp int, atk int, type text, name text, rarity text, grade int, card_id text
)
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  v_grading record;
  v_pet_type text;
  v_base_hp int;
  v_base_atk int;
  v_hp numeric;
  v_atk numeric;
  v_valid_types constant text[] := array[
    '노말','불꽃','물','풀','전기','얼음','격투','독','땅',
    '비행','에스퍼','벌레','바위','고스트','드래곤','악','강철','페어리'
  ];
begin
  select g.id, g.card_id, g.grade, g.rarity into v_grading
    from psa_gradings g where g.id = p_grading_id;
  if not found then return; end if;

  -- (1) PCL 10 hard gate.
  if v_grading.grade is null or v_grading.grade <> gym_required_grade() then
    return;
  end if;

  -- (2) 펫 속성 정규화.
  if p_pet_type = any(v_valid_types) then
    v_pet_type := p_pet_type;
  else
    v_pet_type := '노말';
  end if;

  -- (3) 희귀도 base hp/atk.
  select gs.hp, gs.atk into v_base_hp, v_base_atk
    from gym_rarity_base_stats(v_grading.rarity) gs;

  -- (4) center_power 보정은 v5 에서도 사용 안 함.
  v_hp  := v_base_hp::numeric;
  v_atk := v_base_atk::numeric;

  -- (5) 공격자 / 방어자 분기 보정.
  if p_is_defender then
    v_hp  := v_hp  * gym_defender_hp_multiplier();   -- 1.00
    v_atk := v_atk * gym_defender_atk_multiplier();  -- 0.85
  else
    v_hp  := v_hp  * gym_attacker_hp_multiplier();   -- 1.15
    v_atk := v_atk * gym_attacker_atk_multiplier();  -- 1.30
  end if;

  -- (6) MUR 공격자 ATK 보정 — 희소가치 차등 (유지).
  if v_grading.rarity = 'MUR' and not p_is_defender then
    v_atk := v_atk * gym_mur_attack_multiplier();
  end if;

  -- (7) 체육관 속성 일치 ATK 보정 (양측 동일 — 유지).
  if v_pet_type = p_gym_type then
    v_atk := v_atk * gym_type_match_multiplier();
  end if;

  hp := round(v_hp)::int;
  atk := round(v_atk)::int;
  type := v_pet_type;
  name := v_grading.card_id;
  rarity := v_grading.rarity;
  grade := v_grading.grade;
  card_id := v_grading.card_id;
  return next;
end;
$$;

grant execute on function gym_pet_battle_stats(uuid, int, int, text, text, boolean)
  to anon, authenticated;
grant execute on function gym_pet_battle_stats(uuid, int, int, text, text)
  to anon, authenticated;

notify pgrst, 'reload schema';
