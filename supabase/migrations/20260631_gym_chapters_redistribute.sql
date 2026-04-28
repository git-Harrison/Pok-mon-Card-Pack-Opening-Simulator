-- ============================================================
-- 체육관 챕터 재분배 (3 챕터 + 4 미지의 영역) + 위치 재배치.
--
-- 사용자 요청: "두번째 챕터에 너무 다 몰려있잖아. 3번째 챕터까지 해주고
-- 4번째 챕터에 미지의 영역 으로 해줘. 웅장하고 어둡고 무섭게 자물쇠
-- 이모티콘 같은거 쓰지말고."
--
-- 새 분포:
--  Ch 1 (잎새 지방, 8): 풀 / 물 / 바위 / 전기 / 불꽃 / 땅 / 얼음 / 에스퍼
--  Ch 2 (불의 군도, 5): 노말 / 격투 / 벌레 / 독 / 비행
--  Ch 3 (어둠의 협곡, 5): 고스트 / 페어리 / 강철 / 악 / 드래곤
--  Ch 4 (미지의 영역, 0): 예약 — 클라가 웅장한 dark 배경으로 표시.
-- ============================================================

-- 1) 체육관 chapter 재할당.
update gyms set chapter = 1
 where id in (
   'gym-grass','gym-water','gym-rock','gym-electric',
   'gym-fire','gym-ground','gym-ice','gym-psychic'
 );

-- Chapter 2: 초반 (low-mid power, 600~2500).
update gyms set chapter = 2
 where id in (
   'gym-normal','gym-fighting','gym-bug','gym-poison','gym-flying'
 );

-- Chapter 3: 후반 (high power, 3000~8000).
update gyms set chapter = 3
 where id in (
   'gym-ghost','gym-fairy','gym-steel','gym-dark','gym-dragon'
 );

-- 2) Chapter 2 위치 재배치 — 5 체육관 균등 분포 (less crowded).
update gyms set location_x = 50, location_y = 18  where id = 'gym-normal';
update gyms set location_x = 88, location_y = 26  where id = 'gym-fighting';
update gyms set location_x = 8,  location_y = 50  where id = 'gym-bug';
update gyms set location_x = 8,  location_y = 90  where id = 'gym-poison';
update gyms set location_x = 88, location_y = 90  where id = 'gym-flying';

-- 3) Chapter 3 위치 — 다른 분포로 재배치 (어둠의 협곡 5 체육관).
update gyms set location_x = 22, location_y = 18  where id = 'gym-fairy';
update gyms set location_x = 78, location_y = 28  where id = 'gym-steel';
update gyms set location_x = 50, location_y = 56  where id = 'gym-ghost';
update gyms set location_x = 22, location_y = 90  where id = 'gym-dark';
update gyms set location_x = 78, location_y = 92  where id = 'gym-dragon';

notify pgrst, 'reload schema';
