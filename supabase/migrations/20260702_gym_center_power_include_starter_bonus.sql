-- ============================================================
-- 체육관 도전 가능 여부 판단 — 유저 전투력에 starter LV 보너스 합산.
--
-- 문제:
--   20260699 에서 내 포켓몬 LV 보너스(starter_power_bonus)를
--   get_profile / get_user_rankings 의 center_power 합산에 추가했지만
--   gym_compute_user_center_power 는 건드리지 않았음. 그 결과:
--     - 프로필/랭킹 center_power = 합산 포함 (예: 495k)
--     - 체육관 min_power 게이트가 쓰는 center_power = 합산 미포함 (예: 400k)
--   → 표시값과 도전 조건이 어긋나 "도전 가능한데 전투력 부족" 으로 막힘.
--
-- 수정:
--   gym_compute_user_center_power 에 user_starter_power_bonus(p_user_id) 만
--   추가. 이 함수는:
--     (a) resolve_gym_battle 의 min_power 게이트
--     (b) 클라이언트의 체육관 화면 표시값 (computeUserCenterPower)
--   양쪽에 쓰이므로 두 곳이 같이 보정됨.
--
-- 전투 산식 무영향:
--   gym_compute_user_center_power 의 결과는 resolve_gym_battle 에서
--   gym_pet_battle_stats(..., v_center_power, ...) 의 인자로도 전달되지만
--   gym_pet_battle_stats 본문은 v5 부터 p_center_power 를 미사용
--   (주석: "(4) center_power 기반 보정 미사용"). 따라서 starter 보너스가
--   전투 stat (HP/ATK/피해량/피해감소) 에 영향 주는 경로는 없음 — 사용자
--   요구사항 ("유저 전투력 기반 전투 스탯 보정 다시 넣지 말 것") 그대로.
--
-- 동기화:
--   본 수정 후 center_power 합산식은 4 곳에서 동일:
--     gym_compute_user_center_power · get_profile · get_user_rankings ·
--     (클라 표시: server 값 그대로 사용)
--   = showcase + pokedex_bonus + pokedex_completion + pet_score
--     + medal_buff + starter_power_bonus
-- ============================================================

create or replace function gym_compute_user_center_power(p_user_id uuid)
returns int
language sql
stable
set search_path = public, extensions
as $$
  select coalesce((
    -- showcase_power 합산
    select sum(showcase_power(g2.rarity, g2.grade))::int
    from showcase_cards sc
    join user_showcases us on us.id = sc.showcase_id
    join psa_gradings g2 on g2.id = sc.grading_id
    where us.user_id = p_user_id
  ), 0)
  + coalesce(pokedex_power_bonus(p_user_id), 0)
  + coalesce(pokedex_completion_bonus(p_user_id), 0)
  + coalesce((
    select pet_score from users where id = p_user_id
  ), 0)
  -- 메달 buff 합산 (per-gym 차등 — gym_medal_buff(gym_id))
  + coalesce((
    select sum(gym_medal_buff(g.id))::int
      from user_gym_medals m
      join gyms g on g.id = m.gym_id
     where m.user_id = p_user_id
  ), 0)
  -- 내 포켓몬 LV 보너스 (20260699 도입). 포켓몬 미선택 유저는 0.
  -- 표시/도전조건용; 전투 stat 산식에는 영향 없음 (gym_pet_battle_stats 가
  -- p_center_power 를 미사용).
  + coalesce(user_starter_power_bonus(p_user_id), 0);
$$;

grant execute on function gym_compute_user_center_power(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

-- 마이그레이션: 20260702_gym_center_power_include_starter_bonus.sql
