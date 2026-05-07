-- ============================================================
-- 핫픽스 — gym_pet_battle_stats 의 p_center_power INT → BIGINT 승격.
--
-- 사용자 보고: 체육관 도전 "전투 시작" 클릭 시
--   "function gym_pet_battle_stats(uuid, integer, bigint, text, text,
--    boolean) does not exist"
-- 에러로 대결 진행 불가.
--
-- 원인:
--   · 20260710/20260711 에서 users.pet_score / resolve_gym_battle 의
--     v_center_power, v_def_center_power 를 INT → BIGINT 로 승격.
--   · 그러나 gym_pet_battle_stats(uuid, int, int=p_center_power, ...)
--     함수는 그대로 INT 시그니처. PG 는 BIGINT → INT 자동 캐스트를
--     하지 않으므로 호출 매칭 실패 → "does not exist".
--   · 도감 세트효과 v5 (485k) + 메달 buff (드래곤 +300k) + pet_score
--     누적 + showcase 가산 합치면 center_power 가 INT max 근처까지 가는
--     케이스 존재 — 단순 캐스트로 회피하면 다시 overflow 위험.
--
-- 픽스:
--   1) 두 시그니처 (boolean 유/무) 모두 DROP — CREATE OR REPLACE 는
--      파라미터 타입 변경 시 신규 오버로드를 만들어 모호성 유발.
--   2) p_center_power 만 bigint 로 변경한 동일 본문(20260703 v7-호환,
--      현재 활성 정의) 재생성. 비즈니스 로직 변경 0.
--   3) 호출부는 BIGINT 변수 그대로 전달 — 추가 변경 불필요.
--
-- 멱등 — DROP IF EXISTS + CREATE.
-- ============================================================

drop function if exists gym_pet_battle_stats(uuid, int, int, text, text, boolean);
drop function if exists gym_pet_battle_stats(uuid, int, int, text, text);

create or replace function gym_pet_battle_stats(
  p_grading_id uuid,
  p_slot int,
  p_center_power bigint,
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
  v_card_t2 text;
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

  if v_grading.grade is null or v_grading.grade <> gym_required_grade() then
    return;
  end if;

  if p_pet_type = any(v_valid_types) then
    v_pet_type := p_pet_type;
  else
    v_pet_type := '노말';
  end if;

  select ct.wild_type_2 into v_card_t2
    from card_types ct where ct.card_id = v_grading.card_id;

  select gs.hp, gs.atk into v_base_hp, v_base_atk
    from gym_rarity_base_stats(v_grading.rarity) gs;

  v_hp  := v_base_hp::numeric;
  v_atk := v_base_atk::numeric;

  if p_is_defender then
    v_hp  := v_hp  * gym_defender_hp_multiplier();
    v_atk := v_atk * gym_defender_atk_multiplier();
  else
    v_hp  := v_hp  * gym_attacker_hp_multiplier();
    v_atk := v_atk * gym_attacker_atk_multiplier();
  end if;

  if v_grading.rarity = 'MUR' and not p_is_defender then
    v_atk := v_atk * gym_mur_attack_multiplier();
  end if;

  if v_pet_type = p_gym_type
     or (v_card_t2 is not null and v_card_t2 = p_gym_type) then
    v_atk := v_atk * gym_type_match_multiplier();
  end if;

  if v_grading.rarity = 'MUR' and p_is_defender then
    v_hp  := v_hp  * gym_mur_defender_hp_multiplier();
    v_atk := v_atk * gym_mur_defender_atk_multiplier();
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

grant execute on function gym_pet_battle_stats(uuid, int, bigint, text, text, boolean)
  to anon, authenticated;

notify pgrst, 'reload schema';

-- 마이그레이션: 20260723_gym_pet_battle_stats_bigint_center_power.sql
