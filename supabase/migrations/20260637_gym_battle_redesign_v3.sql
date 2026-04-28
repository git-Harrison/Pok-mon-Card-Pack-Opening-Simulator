-- ============================================================
-- 체육관 전투 스펙 v3 — PCL10 전용 + sqrt 정규화 + MUR 최상위 효율
--
-- 사용자 요구사항 (체육관 밸런스 정상화):
--   1) 체육관 시스템은 무조건 PCL 10 카드만 사용 가능. PCL 9 이하는
--      방어덱 등록 / 도전 / 전투 계산 모두 거부.
--   2) PCL 등급별 배율(grade_mult) 폐기 — 어차피 PCL 10 이므로 의미 X.
--   3) center_power 정규화 — sqrt 기반 + 상한.
--      일반: rate = min(0.35, sqrt(cp) / 3000)
--      MUR : rate = min(0.45, sqrt(cp) / 2800)
--   4) 방어자 보너스는 HP 만 (× 1.10). ATK 가중 폐기.
--   5) MUR 공격자 ATK × 1.05 (선택 보정).
--   6) 체육관 속성 일치 시 ATK × 1.10.
--   7) 희귀도 기본 스탯 재정의 — MUR 240/60 등 폭 확대.
--   8) 모든 밸런스 수치는 공통 함수로 분리 — 향후 패치 용이.
--
-- 영향 범위:
--   · gym_pet_battle_stats(uuid,int,int,text,text,boolean) — 산식 전면 교체
--   · resolve_gym_battle / set_gym_defense_deck — 시그니처 변경 없음, 기존
--     PCL10 검증은 그대로 유지. gym_pet_battle_stats 가 grade≠10 일 때
--     row 반환하지 않으므로 호출 측에서 자연스럽게 abort.
--   · gym_pokemon (default NPC) — 난이도별 정규화된 스탯으로 재시드.
--
-- 폐기 (kept-for-safety):
--   · gym_rarity_stats / gym_grade_mult — 더 이상 호출되지 않지만 함수
--     자체는 남겨둠 (다른 마이그레이션에서 의존하지 않음 확인 완료).
-- ============================================================

-- ── 1) 밸런스 상수 (단일 진실의 원천) ──────────────────────────

create or replace function gym_required_grade()
returns int language sql immutable
set search_path = public, extensions
as $$ select 10::int $$;

create or replace function gym_defender_hp_multiplier()
returns numeric language sql immutable
set search_path = public, extensions
as $$ select 1.10::numeric $$;

create or replace function gym_mur_attack_multiplier()
returns numeric language sql immutable
set search_path = public, extensions
as $$ select 1.05::numeric $$;

create or replace function gym_type_match_multiplier()
returns numeric language sql immutable
set search_path = public, extensions
as $$ select 1.10::numeric $$;

grant execute on function gym_required_grade() to anon, authenticated;
grant execute on function gym_defender_hp_multiplier() to anon, authenticated;
grant execute on function gym_mur_attack_multiplier() to anon, authenticated;
grant execute on function gym_type_match_multiplier() to anon, authenticated;

-- ── 2) 희귀도별 기본 hp / atk ──────────────────────────────────
-- 사용자 권장값:
--   AR 90/18  SR 110/24  SAR 135/31  UR 165/39  MUR 240/60
-- 그 외(C,U,R,RR,MA) 는 위계 유지하며 비례 배치. MA 는 사용자 펫 점수
-- 위계와 동일하게 SR < MA 가 아니라 SR > MA (100/21).

create or replace function gym_rarity_base_stats(p_rarity text)
returns table(hp int, atk int)
language sql immutable
set search_path = public, extensions
as $$
  select
    case p_rarity
      when 'MUR' then 240 when 'UR'  then 165 when 'SAR' then 135
      when 'SR'  then 110 when 'MA'  then 100 when 'AR'  then  90
      when 'RR'  then  70 when 'R'   then  60 when 'U'   then  50
      when 'C'   then  50 else 50
    end::int,
    case p_rarity
      when 'MUR' then 60 when 'UR'  then 39 when 'SAR' then 31
      when 'SR'  then 24 when 'MA'  then 21 when 'AR'  then 18
      when 'RR'  then 14 when 'R'   then 12 when 'U'   then 10
      when 'C'   then 10 else 10
    end::int;
$$;

grant execute on function gym_rarity_base_stats(text) to anon, authenticated;

-- ── 3) center_power → 보너스 비율 (sqrt 정규화 + 상한) ─────────
-- 일반 카드: min(0.35, sqrt(cp)/3000)
--   cp 100k → 10.5%   cp 400k → 21.1%   cp 1M → 33.3%   cp 1.16M+ → 35%(cap)
-- MUR     : min(0.45, sqrt(cp)/2800)
--   cp 100k → 11.3%   cp 400k → 22.6%   cp 1M → 35.7%   cp 1.58M+ → 45%(cap)

create or replace function gym_power_bonus_rate(
  p_center_power int,
  p_rarity text
) returns numeric
language sql immutable
set search_path = public, extensions
as $$
  select case
    when p_rarity = 'MUR'
      then least(0.45::numeric,
                 sqrt(greatest(coalesce(p_center_power, 0), 0))::numeric / 2800)
    else
      least(0.35::numeric,
            sqrt(greatest(coalesce(p_center_power, 0), 0))::numeric / 3000)
  end;
$$;

grant execute on function gym_power_bonus_rate(int, text) to anon, authenticated;

-- ── 4) gym_pet_battle_stats — 새 산식 ──────────────────────────
-- 시그니처 호환 유지 (resolve_gym_battle 의 호출부 변경 X).
--
-- PCL 10 가 아닌 슬랩이 들어오면 row 를 반환하지 않음 → 호출 측의
-- "if not found" 가드가 challenge 를 abandoned 로 종결.

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
  v_rate numeric;
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

  -- (3) 희귀도별 기본 스탯.
  select gs.hp, gs.atk into v_base_hp, v_base_atk
    from gym_rarity_base_stats(v_grading.rarity) gs;

  -- (4) center_power 보정 (sqrt 정규화).
  v_rate := gym_power_bonus_rate(p_center_power, v_grading.rarity);
  v_hp  := v_base_hp  * (1 + v_rate);
  v_atk := v_base_atk * (1 + v_rate);

  -- (5) 방어자 HP 보정 (도전자 선공 보완용).
  if p_is_defender then
    v_hp := v_hp * gym_defender_hp_multiplier();
  end if;

  -- (6) MUR 공격자 ATK 보정 (희소가치 차등).
  if v_grading.rarity = 'MUR' and not p_is_defender then
    v_atk := v_atk * gym_mur_attack_multiplier();
  end if;

  -- (7) 체육관 속성 일치 ATK 보정.
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

-- ── 5) default NPC 포켓몬 정규화 ───────────────────────────────
-- 사용자 권장:
--   초급(EASY)   : HP 100~140 / ATK 20~35
--   중급(NORMAL) : HP 150~210 / ATK 35~55
--   상급(HARD)   : HP 220~320 / ATK 55~80
--   최상급(BOSS) : HP 260~380 / ATK 65~95   (BOSS 단계 추가 분리)
-- 슬롯 1 (선봉) → 3 (대장) 으로 갈수록 강해짐.

update gym_pokemon gp
   set hp = case g.difficulty
              when 'EASY'   then case gp.slot when 1 then 100 when 2 then 120 when 3 then 140 end
              when 'NORMAL' then case gp.slot when 1 then 150 when 2 then 180 when 3 then 210 end
              when 'HARD'   then case gp.slot when 1 then 220 when 2 then 270 when 3 then 320 end
              when 'BOSS'   then case gp.slot when 1 then 260 when 2 then 320 when 3 then 380 end
              else gp.hp
            end,
       atk = case g.difficulty
              when 'EASY'   then case gp.slot when 1 then 20 when 2 then 27 when 3 then 35 end
              when 'NORMAL' then case gp.slot when 1 then 35 when 2 then 45 when 3 then 55 end
              when 'HARD'   then case gp.slot when 1 then 55 when 2 then 67 when 3 then 80 end
              when 'BOSS'   then case gp.slot when 1 then 65 when 2 then 80 when 3 then 95 end
              else gp.atk
            end
  from gyms g
 where gp.gym_id = g.id;

-- ── 6) 검증 강화 — set_gym_defense_deck 에 PCL10 명시 가드 추가 안 함
--      (이미 마이그레이션 20260620 에서 grade=10 검증 중. 본 v3 의
--      gym_pet_battle_stats 도 grade≠10 일 때 row 미반환으로 abort.
--      이중 안전장치 의미.)

notify pgrst, 'reload schema';
