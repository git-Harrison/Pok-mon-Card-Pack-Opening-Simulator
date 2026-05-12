-- ============================================================
-- 9 유저 전원 × 18 type 체육관 메달 일괄 부여 (idempotent)
--
-- 목적:
--   - Ch4 "미지의 영역" 입장 자격(메달 18) 조건을 모든 테스트 유저가 충족
--   - 이전 단계 체육관 메달 흭득은 별개의 PvE 진행으로 따로 유지하지만,
--     테스트 편의를 위해 9 유저 모두에게 일괄 부여
--
-- INSERT 는 ON CONFLICT (user_id, gym_id) DO NOTHING — 이미 보유한 메달은
-- 보존 (earned_at / used_pets 안 건드림).
-- ============================================================

insert into user_gym_medals (user_id, gym_id, medal_id, earned_at, used_pets)
select u.id, g.id, gm.id, now(), '{"pets": [], "seeded": true}'::jsonb
  from users u
  cross join gyms g
  join gym_medals gm on gm.gym_id = g.id
 where g.chapter in (1, 2, 3)
on conflict (user_id, gym_id) do nothing;

notify pgrst, 'reload schema';
