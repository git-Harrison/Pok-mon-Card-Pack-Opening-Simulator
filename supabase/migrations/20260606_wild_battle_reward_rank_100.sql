-- ============================================================
-- 야생 승리 rank_points 50 → 100 회귀 수정.
--
-- 사용자 보고: /users 활동 로그에 "야생 승리 +50p" 표시. 실제 랭킹
-- 계산은 wild_wins * 100 으로 적용되지만, wild_battle_reward 가
-- wild_battles_log.rank_points 에 50 을 인서트해서 활동 피드 라벨
-- 만 50 으로 보임.
--
-- 원인 추적:
--   · 20260581_economy_wild_showcase_bump.sql 에서 50 → 100 으로
--     올렸음 (wild_battle_reward 응답 + get_user_rankings 식).
--   · 20260584_box_caps_wild_v2.sql 가 wild_battles_log 신설하면서
--     wild_battle_reward 를 다시 정의 → 50 으로 회귀.
--   · 이후 get_user_rankings 는 다시 100 으로 수정됐지만 reward
--     함수 자체는 50 으로 고정 → 활동 로그 표시값만 어긋남.
--
-- 조치:
--   1) wild_battle_reward 를 100 으로 재수정.
--   2) 과거 50 으로 기록된 wild_battles_log 행 백필 → 100.
--   (get_user_activity 는 coalesce(rank_points, 50) 인데 컬럼이
--    NOT NULL DEFAULT 라 fallback 은 실제로 안 타므로 그대로 둠.)
-- ============================================================

create or replace function wild_battle_reward(
  p_user_id uuid,
  p_amount int
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_amount int := greatest(0, least(50000, coalesce(p_amount, 0)));
  v_new_points int;
begin
  update users
     set points = points + v_amount,
         wild_wins = wild_wins + 1
   where id = p_user_id
   returning points into v_new_points;

  insert into wild_battles_log (user_id, prize_points, rank_points)
    values (p_user_id, v_amount, 100);

  return json_build_object(
    'ok', true,
    'awarded', v_amount,
    'rank_points', 100,
    'points', v_new_points
  );
end;
$$;

grant execute on function wild_battle_reward(uuid, int) to anon, authenticated;

-- 백필: 기존 50 으로 기록된 wild_battles_log → 100. 랭킹 산식
-- (wild_wins * 100) 과 일치시켜 활동 로그 표시도 +100p 로 통일.
update wild_battles_log
   set rank_points = 100
 where rank_points = 50;

notify pgrst, 'reload schema';
