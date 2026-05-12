-- ============================================================
-- rmstn137 계정 — 내 포켓몬 Lv.20 + 18 체육관 메달 완전 흭득.
--
-- 사용자 요청:
--   "rmstn137 계정 내 포켓몬 LV20 으로 올려줘. 바로 진화할 수 있게.
--    전투력 + 갱신 잘 해주고."
--   "메달도 18개 전부 흭득한거로 해줘 rmstn137 계정만."
--
-- 1) starter Lv.20 / 2차 진화 대기 (20260754 의 min LV20 패턴 그대로):
--    level           = 20  ← Lv.20 도달
--    xp              = 0   ← 방금 도달
--    evolution_stage = 1   ← 1차 진화 완료, 2차 진화 대기 ("진화하기" 노출)
--
-- 자동 반영:
--    · 유저 전투력 +350,000 (starter_level_power_bonus(20))
--    · get_profile / get_user_rankings 라이브 재계산 → 다음 API 호출부터 즉시 반영
--    · 체육관 전투 스탯에는 미반영 (정책: 표시/랭킹용)
--
-- 2) chapter 1-3 체육관 18 메달 일괄 부여 (멱등):
--    cross join + ON CONFLICT DO NOTHING — 기존 보유 메달 보존, 빠진 것만 추가.
--    used_pets 마커는 'manual_seed' 키로 — 20260756_revert (seeded=true 기준)
--    와 의도적으로 다른 키를 사용해 추후 revert 휘말림 방지.
--
-- 자동 반영:
--    · 메달 전투력 = sum(gym_medal_buff(g.id)) — get_profile / get_user_rankings
--      라이브 집계라 row insert 즉시 새 합계 반환.
--
-- 멱등: UPDATE + INSERT ON CONFLICT DO NOTHING.
-- ============================================================

do $$
declare
  v_user_id uuid;
  v_starter_updated int;
  v_medals_before int;
  v_medals_after int;
begin
  select id into v_user_id from users where user_id = 'rmstn137';
  if not found then
    raise notice '[rmstn137 seed] user rmstn137 미존재 — skip';
    return;
  end if;

  -- ── 1) starter Lv.20 / evolution_stage 1 ──
  update user_starter
     set level           = 20,
         xp              = 0,
         evolution_stage = 1
   where user_id = v_user_id;

  get diagnostics v_starter_updated = row_count;
  if v_starter_updated = 0 then
    raise notice '[rmstn137 seed] 포켓몬 미선택 — starter 부분 skip (user_starter row 없음)';
  else
    raise notice '[rmstn137 seed] starter OK — Lv.20 2차 진화 대기 (전투력 +350,000)';
  end if;

  -- ── 2) chapter 1-3 18 체육관 메달 ──
  select count(*) into v_medals_before
    from user_gym_medals m
    join gyms g on g.id = m.gym_id
   where m.user_id = v_user_id and g.chapter in (1, 2, 3);

  insert into user_gym_medals (user_id, gym_id, medal_id, earned_at, used_pets)
  select v_user_id, g.id, gm.id, now(),
         '{"pets": [], "manual_seed": "rmstn137_lv20"}'::jsonb
    from gyms g
    join gym_medals gm on gm.gym_id = g.id
   where g.chapter in (1, 2, 3)
  on conflict (user_id, gym_id) do nothing;

  select count(*) into v_medals_after
    from user_gym_medals m
    join gyms g on g.id = m.gym_id
   where m.user_id = v_user_id and g.chapter in (1, 2, 3);

  raise notice '[rmstn137 seed] medals: % → % (target 18)',
    v_medals_before, v_medals_after;
end $$;

notify pgrst, 'reload schema';

-- 마이그레이션: 20260762_seed_rmstn137_lv20.sql
