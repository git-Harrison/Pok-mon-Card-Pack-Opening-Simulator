-- ============================================================
-- 체육관 최소 전투력 전체 상향 (Ch1~Ch3)
--
-- 사용자 요청: 진입 장벽 강화. Ch1 쉬움 / Ch2 중상위 / Ch3 최상위.
--
--   Ch1 — 쉬움
--     풀     80,000
--     물    140,000
--     바위  220,000
--     전기  320,000
--     불꽃  450,000
--     땅    600,000
--     얼음  780,000
--     에스퍼 980,000
--   Ch2 — 어려움
--     노말  1,250,000
--     격투  1,600,000
--     벌레  2,000,000
--   Ch3 — 매우 어려움
--     독    2,400,000
--     비행  2,900,000
--     고스트 3,500,000
--     페어리 4,200,000
--     강철  5,000,000
--     악    5,900,000
--     드래곤 7,000,000
--
-- 위계: 풀 < 물 < 바위 < 전기 < 불꽃 < 땅 < 얼음 < 에스퍼 < 노말
--      < 격투 < 벌레 < 독 < 비행 < 고스트 < 페어리 < 강철 < 악 < 드래곤
-- Ch4 미변경.
-- ============================================================

-- Ch1
update gyms set min_power =   80000 where id = 'gym-grass';
update gyms set min_power =  140000 where id = 'gym-water';
update gyms set min_power =  220000 where id = 'gym-rock';
update gyms set min_power =  320000 where id = 'gym-electric';
update gyms set min_power =  450000 where id = 'gym-fire';
update gyms set min_power =  600000 where id = 'gym-ground';
update gyms set min_power =  780000 where id = 'gym-ice';
update gyms set min_power =  980000 where id = 'gym-psychic';

-- Ch2
update gyms set min_power = 1250000 where id = 'gym-normal';
update gyms set min_power = 1600000 where id = 'gym-fighting';
update gyms set min_power = 2000000 where id = 'gym-bug';

-- Ch3
update gyms set min_power = 2400000 where id = 'gym-poison';
update gyms set min_power = 2900000 where id = 'gym-flying';
update gyms set min_power = 3500000 where id = 'gym-ghost';
update gyms set min_power = 4200000 where id = 'gym-fairy';
update gyms set min_power = 5000000 where id = 'gym-steel';
update gyms set min_power = 5900000 where id = 'gym-dark';
update gyms set min_power = 7000000 where id = 'gym-dragon';

notify pgrst, 'reload schema';
