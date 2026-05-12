-- ============================================================
-- 20260750 일괄 메달 시드 revert — 9 유저 × 18 메달 (162 row) 회수.
--
-- 배경:
--   20260750_seed_all_users_18_medals.sql 가 Ch4 입장 자격 테스트 편의로
--   모든 유저에게 chapter 1-3 체육관 메달 18 개를 일괄 부여했음. 사용자
--   요청: "잘못 들어간 것 같으니 원래대로 돌려놔."
--
-- 식별 방법:
--   시드 row 는 used_pets = '{"pets": [], "seeded": true}'::jsonb 마커를
--   가짐. 실제 플레이로 얻은 메달은 used_pets.pets 에 실 출전 펫 데이터가
--   들어 있고 seeded key 가 없음. 따라서 used_pets ->> 'seeded' = 'true'
--   조건으로 시드 row 만 정확히 식별 가능.
--
--   20260750 시드는 ON CONFLICT (user_id, gym_id) DO NOTHING 였으므로
--   기존에 정당하게 보유 중이던 메달 row 는 변경되지 않았음. 즉 이 DELETE
--   는 실제 플레이로 얻은 메달은 일절 건드리지 않음.
--
-- 자동 반영:
--   · get_profile.center_power / get_user_rankings.center_power 가
--     user_gym_medals 를 sum(gym_medal_buff(...)) 로 live 집계하므로
--     row 삭제 즉시 메달 전투력이 정확히 감소함.
--   · pet_score 는 메달 비의존 → 변경 없음.
--
-- 멱등: 두 번째 실행 시 매칭 row 0 → no-op.
-- ============================================================

do $$
declare
  v_before bigint;
  v_after  bigint;
  v_users_touched int;
begin
  select count(*) into v_before
    from user_gym_medals where used_pets ->> 'seeded' = 'true';

  select count(distinct user_id) into v_users_touched
    from user_gym_medals where used_pets ->> 'seeded' = 'true';

  raise notice '[medal revert] 시드 row % 개 (유저 % 명) 삭제 예정',
    v_before, v_users_touched;

  delete from user_gym_medals where used_pets ->> 'seeded' = 'true';

  select count(*) into v_after
    from user_gym_medals where used_pets ->> 'seeded' = 'true';

  raise notice '[medal revert] 삭제 완료. 남은 seeded row: % (기대 0)', v_after;
end $$;

notify pgrst, 'reload schema';

-- 마이그레이션: 20260756_revert_bulk_medal_seed.sql
