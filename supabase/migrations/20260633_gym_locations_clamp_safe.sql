-- ============================================================
-- 체육관 좌표 정밀 조정 — 영역 밖 잘림 방지.
--
-- 사용자 보고: "맵에 제대로 위치한것들도 있고 영역밖으로 나간 체육관들도
-- 있네." 핀 SVG (36×38px) + 라벨 (이름 + status pill + type 뱃지) 가
-- 핀 아래로 ~30~40px 더 차지 → viewBox 100×130 기준 y 가 너무 작거나
-- 너무 크면 잘림.
--
-- 안전 범위:
--   x ∈ [12, 88]  (좌우 핀 폭 ≈ 8% 여유)
--   y ∈ [16, 96]  (상단 핀 머리 + 하단 라벨 영역 ≈ 8% / 30%)
-- 모든 18 체육관 좌표 위 범위로 재조정.
-- ============================================================

-- Ch 1 (8) — 상단 너무 위로 가있던 것 + 하단 미세 조정.
update gyms set location_x = 20, location_y = 16 where id = 'gym-psychic';
update gyms set location_x = 72, location_y = 20 where id = 'gym-ice';
update gyms set location_x = 34, location_y = 28 where id = 'gym-ground';
update gyms set location_x = 18, location_y = 52 where id = 'gym-rock';
update gyms set location_x = 50, location_y = 48 where id = 'gym-electric';
update gyms set location_x = 80, location_y = 50 where id = 'gym-fire';
update gyms set location_x = 22, location_y = 80 where id = 'gym-grass';
update gyms set location_x = 62, location_y = 82 where id = 'gym-water';

-- Ch 2 (3) — 삼각 배치, 안전 영역 안.
update gyms set location_x = 50, location_y = 30 where id = 'gym-normal';
update gyms set location_x = 24, location_y = 88 where id = 'gym-bug';
update gyms set location_x = 76, location_y = 88 where id = 'gym-fighting';

-- Ch 3 (7) — 7 체육관 분산, 모두 안전 영역.
update gyms set location_x = 16, location_y = 24 where id = 'gym-poison';
update gyms set location_x = 50, location_y = 18 where id = 'gym-flying';
update gyms set location_x = 84, location_y = 26 where id = 'gym-steel';
update gyms set location_x = 30, location_y = 56 where id = 'gym-ghost';
update gyms set location_x = 72, location_y = 60 where id = 'gym-fairy';
update gyms set location_x = 22, location_y = 96 where id = 'gym-dark';
update gyms set location_x = 78, location_y = 96 where id = 'gym-dragon';

notify pgrst, 'reload schema';
