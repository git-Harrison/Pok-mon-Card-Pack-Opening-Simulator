-- ============================================================
-- 챕터 난이도 progression 강화 + Ch2 슬림화 (5 → 3).
--
-- 사용자 요청: "스탭1이 스탭2보다 쉽고, 스탭2가 스탭3보다 쉬워야해.
-- Ch2 에 너무 많아 — 일부 Ch3 로 넘겨. Ch 안 체육관은 같은 난이도일
-- 필요는 없고 (mix), 보상은 체육관마다 다름 (이미 난이도 비례)."
--
-- 새 분포:
--  Ch 1 (잎새 지방, 8): 풀 / 물 / 바위 / 전기 / 불꽃 / 땅 / 얼음 / 에스퍼
--      — 기본 8 그대로.
--  Ch 2 (불의 군도, 3): 노말 / 격투 / 벌레 — 전부 EASY (600~1000).
--      Ch1 보다 max 도 낮고, Ch3 보다 훨씬 쉬움.
--  Ch 3 (어둠의 협곡, 7): 독 / 비행 / 고스트 / 페어리 / 강철 / 악 / 드래곤
--      — mixed EASY(독)/NORMAL/HARD/BOSS. 1200~8000.
--      이전 Ch2 였던 독·비행 이 Ch3 로 이동.
--  Ch 4 (미지의 영역, 0): 그대로 — 봉인된 차원.
-- ============================================================

-- 1) 독·비행 → Ch3 로 이동 (이전엔 Ch2).
update gyms set chapter = 3
 where id in ('gym-poison', 'gym-flying');

-- Ch2 는 이제 3개만.
update gyms set chapter = 2
 where id in ('gym-normal', 'gym-fighting', 'gym-bug');

-- 2) Ch2 위치 재배치 — 3 체육관 삼각 배치 (여유 공간).
update gyms set location_x = 50, location_y = 28  where id = 'gym-normal';
update gyms set location_x = 22, location_y = 90  where id = 'gym-bug';
update gyms set location_x = 78, location_y = 90  where id = 'gym-fighting';

-- 3) Ch3 위치 재배치 — 7 체육관 분산.
update gyms set location_x = 12, location_y = 22  where id = 'gym-poison';
update gyms set location_x = 50, location_y = 14  where id = 'gym-flying';
update gyms set location_x = 88, location_y = 26  where id = 'gym-steel';
update gyms set location_x = 30, location_y = 56  where id = 'gym-ghost';
update gyms set location_x = 72, location_y = 60  where id = 'gym-fairy';
update gyms set location_x = 18, location_y = 102 where id = 'gym-dark';
update gyms set location_x = 80, location_y = 102 where id = 'gym-dragon';

notify pgrst, 'reload schema';
