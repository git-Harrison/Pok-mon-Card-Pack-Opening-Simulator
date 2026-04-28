-- ============================================================
-- 체육관 좌표 모바일 정밀 조정.
--
-- 사용자 보고: "스탭 2,3 은 어느정도 일치, 아래쪽 체육관 높이 조금
-- 올려주면 되고 스탭 1 이 조금 어수선하네."
--
-- 조치:
--  Ch 1 — 4 row 정렬 재배치 (top/upper-mid/center/bottom).
--  Ch 2 — 하단 2개 (벌레/격투) y 88 → 80 으로 8 단위 올림.
--  Ch 3 — 하단 2개 (악/드래곤) y 96 → 88 로 8 단위 올림.
-- ============================================================

-- Ch 1 — 4 row 정렬:
--  Row 1 (y=18): psychic(좌) / ice(우)
--  Row 2 (y=36): ground(가운데)
--  Row 3 (y=56): rock / electric / fire (좌·중·우)
--  Row 4 (y=80): grass / water
update gyms set location_x = 22, location_y = 18 where id = 'gym-psychic';
update gyms set location_x = 78, location_y = 18 where id = 'gym-ice';
update gyms set location_x = 50, location_y = 36 where id = 'gym-ground';
update gyms set location_x = 22, location_y = 56 where id = 'gym-rock';
update gyms set location_x = 50, location_y = 56 where id = 'gym-electric';
update gyms set location_x = 78, location_y = 56 where id = 'gym-fire';
update gyms set location_x = 28, location_y = 80 where id = 'gym-grass';
update gyms set location_x = 72, location_y = 80 where id = 'gym-water';

-- Ch 2 — 하단 2개 y 88 → 80 (8 단위 올림).
update gyms set location_x = 50, location_y = 28 where id = 'gym-normal';
update gyms set location_x = 24, location_y = 80 where id = 'gym-bug';
update gyms set location_x = 76, location_y = 80 where id = 'gym-fighting';

-- Ch 3 — 하단 2개 y 96 → 88 (8 단위 올림).
update gyms set location_x = 16, location_y = 24 where id = 'gym-poison';
update gyms set location_x = 50, location_y = 18 where id = 'gym-flying';
update gyms set location_x = 84, location_y = 26 where id = 'gym-steel';
update gyms set location_x = 30, location_y = 56 where id = 'gym-ghost';
update gyms set location_x = 72, location_y = 60 where id = 'gym-fairy';
update gyms set location_x = 22, location_y = 88 where id = 'gym-dark';
update gyms set location_x = 78, location_y = 88 where id = 'gym-dragon';

notify pgrst, 'reload schema';
