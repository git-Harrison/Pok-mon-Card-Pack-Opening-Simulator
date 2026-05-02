-- ============================================================
-- 체육관 전투 밸런스 — 공격자 친화 + 유저 전투력 스탯 보정 제거 (v4)
--
-- 사용자 요구 (체육관 진입장벽 완화):
--   1) 방어덱 3마리 쪽으로 과도하게 유리하던 구조 완화.
--   2) 공격자 펫 3마리 전투 스탯을 방어자보다 살짝 유리하게.
--   3) 유저 전투력(center_power) 으로 hp/atk 가산되는 hidden multiplier 제거.
--      → 전투력은 표시/매칭(min_power 게이트) 용도로만 유지.
--   4) 펫 자체 base 스탯, 속성 일치 보정, MUR 공격 우대, 도전자 선공 은
--      그대로 유지 — 카드 자체 가치는 보존.
--
-- 변경 요약 (v3 대비):
--   · gym_defender_hp_multiplier()       1.10 → 1.00  (방어자 HP 보너스 제거)
--   · gym_power_bonus_rate(cp, rarity)   sqrt 정규화 → 항상 0 (전투력 → 스탯
--                                        변환 무력화. 함수는 시그니처 호환
--                                        목적으로 잔존, kept-for-safety.)
--   · gym_attacker_atk_multiplier()      신규 — 1.10 (공격자 ATK 일괄 +10%)
--   · gym_pet_battle_stats(...)          본문 재정의:
--       - center_power rate 가산 분기 제거 (v_base 그대로 사용).
--       - 공격자(p_is_defender=false) 시 ATK × gym_attacker_atk_multiplier().
--       - MUR 공격자 ATK ×1.05, 속성 일치 ×1.10 유지.
--       - 방어자 HP 보정은 gym_defender_hp_multiplier() = 1.00 이라 사실상 no-op.
--
-- 영향 범위:
--   · resolve_gym_battle (20260686) — 시그니처/호출부 동일. gym_pet_battle_stats
--     반환 stat 만 새 산식으로 자동 적용. 도전자 선공 / 턴 시뮬 / 보상 / 점령
--     로직 일체 변경 없음.
--   · default NPC 시드 (20260640) — gym_pokemon 본문에는 영향 없음. NPC 적
--     atk 의 속성 일치 ×1.10 도 resolve_gym_battle 안에서 그대로 동작.
--   · UI / center_power 표시 / min_power 도전 게이트 — 그대로.
--   · pet_score / 메달 / 도감 보너스 — 변경 없음 (이들은 center_power 안에
--     모이고, 그 center_power 가 전투 스탯에 영향 안 주게 된 것이 핵심).
--
-- 신규/저 cp 유저 체감:
--   · 이전 v3: cp 30k AR×3 → rate ~5.8%, defender HP +10%. 신규 유저는 +6% 와
--     +10% 사이 약 4%p 불리.
--   · v4 이후: 양측 cp 보너스 0, defender HP 보너스 0, 공격자 ATK +10%.
--     공격자가 동일 카드 기준 일관되게 약 10% 유리 (속성 / MUR 보정은 별개).
--   · 방어덱이 더 강한 카드를 깔았다면 base 차이로 여전히 방어자 우세 가능 →
--     "방어덱 무의미" 문제 발생 안 함.
--
-- 멱등 — 모든 변경은 CREATE OR REPLACE FUNCTION. 기존 시그니처 유지.
-- ============================================================

-- ── 1) 방어자 HP 보너스 제거 ──────────────────────────────────
create or replace function gym_defender_hp_multiplier()
returns numeric language sql immutable
set search_path = public, extensions
as $$ select 1.00::numeric $$;

-- ── 2) 유저 전투력 → 스탯 보정 무력화 ────────────────────────
-- 시그니처는 v3 와 동일. 본문만 0 으로 단축. gym_pet_battle_stats v4 는
-- 이 함수를 호출하지 않지만, 외부/구버전 코드가 혹시 참조해도 안전하게
-- 0 을 받도록 잔존.
create or replace function gym_power_bonus_rate(
  p_center_power int,
  p_rarity text
) returns numeric
language sql immutable
set search_path = public, extensions
as $$ select 0::numeric $$;

-- ── 3) 공격자 ATK 보정 — 신규 ─────────────────────────────────
-- 도전자(p_is_defender=false) 의 모든 희귀도에 적용되는 일괄 ATK 보정.
-- 진입장벽 완화 + 공격자 우위 확보 목적. 1.10 = 약 +10%.
create or replace function gym_attacker_atk_multiplier()
returns numeric language sql immutable
set search_path = public, extensions
as $$ select 1.10::numeric $$;

grant execute on function gym_defender_hp_multiplier() to anon, authenticated;
grant execute on function gym_power_bonus_rate(int, text) to anon, authenticated;
grant execute on function gym_attacker_atk_multiplier() to anon, authenticated;

-- ── 4) gym_pet_battle_stats — v4 산식 ────────────────────────
-- v3 대비 변경점만:
--   · center_power rate 가산 제거 (v_base_hp/atk 그대로 사용).
--   · 공격자(p_is_defender=false) ATK × gym_attacker_atk_multiplier().
-- 그 외 (PCL10 게이트, 속성 정규화, 희귀도 base, 방어자 HP 보정,
-- MUR 공격자 보정, 속성 일치 ATK 보정, 반환 컬럼) 는 v3 와 동일.

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

  -- (3) 희귀도별 기본 스탯 — v3 테이블 그대로 사용.
  select gs.hp, gs.atk into v_base_hp, v_base_atk
    from gym_rarity_base_stats(v_grading.rarity) gs;

  -- (4) center_power 보정은 v4 에서 제거됨 — 유저 전투력은 스탯에 영향 X.
  v_hp  := v_base_hp::numeric;
  v_atk := v_base_atk::numeric;

  -- (5) 방어자 HP 보정 — v4 에서 1.00 (no-op) 이지만 helper 호출 유지.
  if p_is_defender then
    v_hp := v_hp * gym_defender_hp_multiplier();
  end if;

  -- (6) 공격자 ATK 보정 — v4 신규. 모든 희귀도에 +10%.
  if not p_is_defender then
    v_atk := v_atk * gym_attacker_atk_multiplier();
  end if;

  -- (7) MUR 공격자 ATK 보정 — 희소가치 차등 (기존 유지).
  if v_grading.rarity = 'MUR' and not p_is_defender then
    v_atk := v_atk * gym_mur_attack_multiplier();
  end if;

  -- (8) 체육관 속성 일치 ATK 보정 (양측 동일 — 기존 유지).
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
