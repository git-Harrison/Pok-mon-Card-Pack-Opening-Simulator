-- ============================================================
-- 메달 backfill — 한 번이라도 점령한 적 있는 모든 사용자에게 메달 보장.
--
-- 사용자 보고: "체육관 점령 시 메달 영구 지급은 최초 1회가 아니라,
-- 한번이라도 점령 시 해당 계정에 영구 지급. 같은 메달은 1개씩만."
--
-- 현재 gym_resolve_challenge 의 win 분기는:
--   insert into user_gym_medals(...) on conflict (user_id, gym_id)
--   do nothing
-- 이므로 매 승리마다 시도하고, 이미 보유 시 no-op. PK 가
-- (user_id, gym_id) 라 같은 메달은 1개씩만. → 로직은 이미 의도대로.
--
-- 다만 다음 케이스에서 누락된 사용자가 있을 수 있어 backfill:
--   1) 과거 메달 시스템 도입 이전에 점령했던 유저
--   2) gym_medals 행이 뒤늦게 추가됐거나, 메달 insert 가 일시적으로
--      실패했던 케이스 (트랜잭션 롤백 등)
--   3) gym_resolve_challenge 분기 이전 버전(20260586 등) 에서 다른
--      경로로 점령된 케이스
--
-- 조치: gym_battle_logs.result='won' 인 모든 (challenger_user_id,
-- gym_id) 쌍에 대해 user_gym_medals 를 보충. + 현재 gym_ownerships
-- 의 owner_user_id 도 같이. 둘 다 PK conflict 시 그대로 유지.
-- ============================================================

-- 1) 과거 승리 로그 기반 backfill — gym_battle_logs.
insert into user_gym_medals (user_id, gym_id, medal_id, used_pets, earned_at)
  select distinct on (l.challenger_user_id, l.gym_id)
    l.challenger_user_id,
    l.gym_id,
    m.id,
    null::jsonb,
    l.ended_at
  from gym_battle_logs l
  join gym_medals m on m.gym_id = l.gym_id
  where l.result = 'won'
    and l.challenger_user_id is not null
  order by l.challenger_user_id, l.gym_id, l.ended_at asc
on conflict (user_id, gym_id) do nothing;

-- 2) 현재 점령 중인 사용자도 한 번 더 — 로그가 누락됐을 수 있음.
insert into user_gym_medals (user_id, gym_id, medal_id, used_pets, earned_at)
  select o.owner_user_id, o.gym_id, m.id, null::jsonb, o.captured_at
    from gym_ownerships o
    join gym_medals m on m.gym_id = o.gym_id
   where o.owner_user_id is not null
on conflict (user_id, gym_id) do nothing;

notify pgrst, 'reload schema';
