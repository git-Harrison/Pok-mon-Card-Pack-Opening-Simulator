-- ============================================================
-- hun 계정 18 type 체육관 메달 완전 흭득 (1개 부족 → 18 채움)
--
-- 직전 시드 (20260750) 에서 hun 은 17 메달까지만 흭득됨 (이유 불명 —
-- 특정 체육관에 medal_id mapping 실패 또는 시드 순서 이슈 추정).
-- ch4_user_stats 가 18 메달을 요구하므로 도전 불가.
--
-- 이 마이그레이션은 cross join + ON CONFLICT DO NOTHING 으로 기존 17개는
-- 보존하고 빠진 1개만 추가. 멱등.
-- ============================================================

insert into user_gym_medals (user_id, gym_id, medal_id, earned_at, used_pets)
select u.id, g.id, gm.id, now(), '{"pets": [], "seeded": true}'::jsonb
  from users u
  cross join gyms g
  join gym_medals gm on gm.gym_id = g.id
 where u.user_id = 'hun'
   and g.chapter in (1, 2, 3)
on conflict (user_id, gym_id) do nothing;

notify pgrst, 'reload schema';
