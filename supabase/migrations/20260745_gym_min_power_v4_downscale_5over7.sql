-- ============================================================
-- 체육관 최소 전투력 전체 하향 — v3 (20260649) × 5/7 비례 스케일
--
-- 사용자 요청: 진입 장벽 완화. 드래곤 7M → 5M 기준으로 나머지도 비례.
--
--   Ch1 — 쉬움
--     풀     80,000 →    60,000
--     물    140,000 →   100,000
--     바위  220,000 →   160,000
--     전기  320,000 →   230,000
--     불꽃  450,000 →   320,000
--     땅    600,000 →   430,000
--     얼음  780,000 →   560,000
--     에스퍼 980,000 →   700,000
--   Ch2 — 어려움
--     노말  1,250,000 →   900,000
--     격투  1,600,000 → 1,150,000
--     벌레  2,000,000 → 1,430,000
--   Ch3 — 매우 어려움
--     독    2,400,000 → 1,710,000
--     비행  2,900,000 → 2,070,000
--     고스트 3,500,000 → 2,500,000
--     페어리 4,200,000 → 3,000,000
--     강철  5,000,000 → 3,570,000
--     악    5,900,000 → 4,210,000
--     드래곤 7,000,000 → 5,000,000
--
-- 위계 strict 단조 유지: 60 < 100 < 160 < 230 < 320 < 430 < 560 < 700
--   < 900 < 1150 < 1430 < 1710 < 2070 < 2500 < 3000 < 3570 < 4210 < 5000 (천 단위)
-- Ch4 미변경.
-- ============================================================

-- Ch1
update gyms set min_power =   60000 where id = 'gym-grass';
update gyms set min_power =  100000 where id = 'gym-water';
update gyms set min_power =  160000 where id = 'gym-rock';
update gyms set min_power =  230000 where id = 'gym-electric';
update gyms set min_power =  320000 where id = 'gym-fire';
update gyms set min_power =  430000 where id = 'gym-ground';
update gyms set min_power =  560000 where id = 'gym-ice';
update gyms set min_power =  700000 where id = 'gym-psychic';

-- Ch2
update gyms set min_power =  900000 where id = 'gym-normal';
update gyms set min_power = 1150000 where id = 'gym-fighting';
update gyms set min_power = 1430000 where id = 'gym-bug';

-- Ch3
update gyms set min_power = 1710000 where id = 'gym-poison';
update gyms set min_power = 2070000 where id = 'gym-flying';
update gyms set min_power = 2500000 where id = 'gym-ghost';
update gyms set min_power = 3000000 where id = 'gym-fairy';
update gyms set min_power = 3570000 where id = 'gym-steel';
update gyms set min_power = 4210000 where id = 'gym-dark';
update gyms set min_power = 5000000 where id = 'gym-dragon';

notify pgrst, 'reload schema';
