-- ============================================================
-- 체육관 데이터 전체 초기화.
--
-- 사용자 정책: 체육관 관련 데이터 모두 초기화. 이미 지급된 포인트
-- (users.points) / 랭킹 누적 포인트 (users.gym_daily_rank_pts /
-- users.wild_wins / users.showcase_rank_pts 등) 는 보존.
--
-- 정리 대상 (사용자 데이터):
--   · gym_ownerships     — 현재 점령 + 방어덱 정보
--   · gym_challenges     — 도전 진행 / 종료 기록
--   · gym_cooldowns      — 본인 재도전 쿨타임
--   · gym_battle_logs    — 전투 history
--   · user_gym_medals    — 획득 메달 (메달 기반 +10K 버프 모두 회수)
--   · gym_rewards        — capture/daily 등 보상 청구 로그
--
-- 보존 (seed):
--   · gyms               — 체육관 8 개 정의
--   · gym_pokemon        — NPC 관장 포켓몬
--   · gym_medals         — 메달 마스터 정의
--
-- 보존 (사용자 누적 — 이미 지급된 자산):
--   · users.points              (포인트 잔액)
--   · users.gym_daily_rank_pts  (일일 보상 누적 랭킹 포인트)
--   · users.wild_wins / showcase_rank_pts / pcl_10_wins 등 모든 누적
--
-- 부수 효과:
--   · 메달 0 개 → center_power 의 메달 버프 (medals × 10,000) 사라짐.
--     users.center_power 는 동적 계산이라 자동 반영 (저장 컬럼 X).
--   · 방어덱에 들어있던 슬랩들은 psa_gradings 에 그대로 남음. 사용자가
--     원래 main_card_ids 에서 빼서 defense 로 옮긴 상태였으므로,
--     초기화 후 main 에도 by_type 에도 없을 수 있음 — 사용자가 /profile
--     에서 펫 재등록 가능. (손실 없음 — get_undisplayed_gradings 에
--     다시 노출되어 picker 에서 보임.)
--   · pet_score 자체는 main_card_ids ∪ by_type 기반이라 영향 X — 단,
--     안전하게 전 사용자 재계산 한 번.
-- ============================================================

-- 보호 — 트랜잭션 단위 cleanup. 부분 실패 시 전체 롤백.
do $$
declare
  v_o_count int;
  v_c_count int;
  v_cd_count int;
  v_l_count int;
  v_m_count int;
  v_r_count int;
begin
  -- 카운트 미리 → 결과 로깅.
  select count(*) into v_o_count from gym_ownerships;
  select count(*) into v_c_count from gym_challenges;
  select count(*) into v_cd_count from gym_cooldowns;
  select count(*) into v_l_count from gym_battle_logs;
  select count(*) into v_m_count from user_gym_medals;
  select count(*) into v_r_count from gym_rewards;

  -- TRUNCATE 가 빠르고 sequence reset 까지 — 단 외래키가 cascade 면
  -- 안전. 보수적으로 DELETE 사용 (트리거 / RLS 가 있을 수 있어서).
  delete from gym_battle_logs;
  delete from gym_challenges;
  delete from gym_cooldowns;
  delete from user_gym_medals;
  delete from gym_rewards;
  delete from gym_ownerships;

  raise notice 'gym reset: ownership=% / challenges=% / cooldowns=% / battle_logs=% / medals=% / rewards=%',
    v_o_count, v_c_count, v_cd_count, v_l_count, v_m_count, v_r_count;
end$$;

-- pet_score 재계산 — 방어 덱이 사라진 상태에서도 합산은 main + by_type
-- 인지 확인 차원. 값은 동일해야 함 (compute_user_pet_score 는 defense
-- 무시하므로). idempotent.
update users
   set pet_score = compute_user_pet_score(id);

notify pgrst, 'reload schema';
