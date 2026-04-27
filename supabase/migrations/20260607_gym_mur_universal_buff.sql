-- ============================================================
-- 체육관 전투 — MUR 보너스 양측 통일 (방어자 한정 → 무관).
--
-- 사용자 보고: "MUR 카드는 비-MUR 한테 동등/낮은 전투력 상대에겐 지면
-- 안된다. 동급 MUR 이라도 내 power 가 같거나 높으면 내가 이겨야 한다."
--
-- 직전(20260604) 까지 MUR 추가 효율(ratio×2, cap×10) 은 p_is_defender
-- 일 때만 발동. 도전자(점령 시) MUR 은 일반 ratio×1 / cap×5 만 적용 →
-- center_power 동등 시 MUR vs UR 가 ~코인플립 (변동성에 휘둘림).
--
-- 시뮬레이션 (center_power=10000, slot 1):
--   · 무버프 MUR PCL10  ATK 288 / HP 690
--   · 무버프 UR  PCL10  ATK 240 / HP 660
--     → UR 이 MUR 죽이는 데 평균 2.9턴, MUR 이 UR 죽이는 데 2.3턴.
--       턴 차이 작고 jitter±10% / crit 5% 변동에 결과 뒤집힘.
--   · MUR-buff 적용 MUR PCL10  ATK 528 / HP 1190
--     → UR 이 MUR 죽이는 데 4.96턴, MUR 이 UR 죽이는 데 1.25턴.
--       MUR 압승. 변동성에도 결과 안전.
--
-- 조치: p_is_defender 플래그가 false 여도 rarity = 'MUR' 이면 보너스
-- 적용. (도전자 / 방어자 양쪽 동일.) 체육관 점령 버프(+10K center_power)
-- 와 합쳐 power 우위가 결과로 직결.
--
-- 비-MUR 카드는 종전 ratio×1 / cap×5 그대로 — MUR 의 희소 가치 유지.
-- ============================================================

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
  v_card_name text;
  v_pet_type text;
  v_base_hp int;
  v_base_atk int;
  v_grade_mult numeric;
  v_bonus_ratio numeric;
  v_cap_factor numeric;
  v_bonus int;
  v_atk_bonus int;
  v_hp_bonus int;
  v_final_hp int;
  v_final_atk int;
  v_valid_types constant text[] := array[
    '노말','불꽃','물','풀','전기','얼음','격투','독','땅',
    '비행','에스퍼','벌레','바위','고스트','드래곤','악','강철','페어리'
  ];
begin
  -- p_is_defender 는 시그니처 호환 위해 받지만 더 이상 MUR 보너스
  -- gate 로 쓰지 않음 (양측 동일 적용).
  perform p_is_defender;

  select g.id, g.card_id, g.grade, g.rarity into v_grading
    from psa_gradings g where g.id = p_grading_id;
  if not found then return; end if;

  v_card_name := v_grading.card_id;
  if p_pet_type = any(v_valid_types) then
    v_pet_type := p_pet_type;
  else
    v_pet_type := '노말';
  end if;

  select gs.hp, gs.atk into v_base_hp, v_base_atk
    from gym_rarity_stats(v_grading.rarity) gs;
  v_grade_mult := gym_grade_mult(v_grading.grade);
  v_base_hp := round(v_base_hp * v_grade_mult);
  v_base_atk := round(v_base_atk * v_grade_mult);

  -- 슬롯 별 ratio. 양쪽 동일 — center_power 차이가 그대로 결과로.
  v_bonus_ratio := case p_slot
    when 1 then 0.10
    when 2 then 0.08
    when 3 then 0.06
    else 0
  end;

  -- MUR 카드는 도전자/방어자 무관 추가 효율 (ratio×2, cap×10).
  -- 비-MUR 은 ratio×1, cap×5 유지.
  v_cap_factor := 5.0;
  if v_grading.rarity = 'MUR' then
    v_bonus_ratio := v_bonus_ratio * 2.0;
    v_cap_factor := 10.0;
  end if;

  v_bonus := round(coalesce(p_center_power, 0) * v_bonus_ratio)::int;
  v_atk_bonus := least(v_bonus, round(v_base_atk * v_cap_factor)::int);
  v_hp_bonus := least(round(v_bonus * 0.5)::int, round(v_base_hp * v_cap_factor)::int);

  v_final_hp := v_base_hp + v_hp_bonus;
  v_final_atk := v_base_atk + v_atk_bonus;

  if v_pet_type = p_gym_type then
    v_final_atk := round(v_final_atk * 1.05)::int;
  end if;

  hp := v_final_hp;
  atk := v_final_atk;
  type := v_pet_type;
  name := v_card_name;
  rarity := v_grading.rarity;
  grade := v_grading.grade;
  card_id := v_grading.card_id;
  return next;
end;
$$;

grant execute on function gym_pet_battle_stats(uuid, int, int, text, text, boolean) to anon, authenticated;

notify pgrst, 'reload schema';
