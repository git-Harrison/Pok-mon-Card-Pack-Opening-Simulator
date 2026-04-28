-- ============================================================
-- 체육관 좌표 미세 조정 — 사용자 지정.
--
-- 이동 대상:
--  Ch 1: 암석 / 불꽃           — y -6 (위로 약간)
--  Ch 2: 날개(벌레) / 주먹(격투) — y -6 (위로 약간)
--  Ch 3: 환영(고스트) / 요정     — y -6 (위로 약간)
--  Ch 3: 심연(악) / 용혼(드래곤) — y -10 (다른 것들보다 더 위로)
-- ============================================================

-- Ch 1
update gyms set location_y = 50 where id = 'gym-rock';      -- 56 → 50
update gyms set location_y = 50 where id = 'gym-fire';      -- 56 → 50

-- Ch 2
update gyms set location_y = 74 where id = 'gym-bug';       -- 80 → 74
update gyms set location_y = 74 where id = 'gym-fighting';  -- 80 → 74

-- Ch 3
update gyms set location_y = 50 where id = 'gym-ghost';     -- 56 → 50
update gyms set location_y = 54 where id = 'gym-fairy';     -- 60 → 54
update gyms set location_y = 78 where id = 'gym-dark';      -- 88 → 78 (10 단위)
update gyms set location_y = 78 where id = 'gym-dragon';    -- 88 → 78 (10 단위)

notify pgrst, 'reload schema';
