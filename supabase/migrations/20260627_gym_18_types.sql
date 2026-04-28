-- ============================================================
-- 체육관 8종 → 18종 (전 속성 커버).
--
-- 사용자 요청: 펫이 18 속성으로 등록 가능한데 체육관은 8개뿐이라 아쉬움
-- → 모든 속성 18개에 체육관 매핑.
--
-- 추가되는 10 속성: 격투, 독, 비행, 벌레, 고스트, 드래곤, 악, 강철,
-- 페어리, 노말. 기존 8 (풀/물/바위/전기/불꽃/땅/얼음/에스퍼) 은 그대로.
--
-- 모두 idempotent — 재실행 OK. 기존 8 은 ON CONFLICT 로 보존, 신규
-- 10 은 새로 INSERT.
-- ============================================================

-- 1) 체육관 row — 신규 10 추가.
insert into gyms (id, name, type, difficulty, leader_name,
                  location_x, location_y, min_power, display_order)
values
  ('gym-fighting', '주먹 체육관',  '격투',   'EASY',   '하드웍',     90, 32,    800, 9),
  ('gym-poison',   '독무 체육관',  '독',     'EASY',   '톡신',        4, 30,   1200, 10),
  ('gym-flying',   '돌풍 체육관',  '비행',   'NORMAL', '에어로',     50, 12,   2500, 11),
  ('gym-bug',      '날개 체육관',  '벌레',   'EASY',   '버그마스터',  4, 70,   1000, 12),
  ('gym-ghost',    '환영 체육관',  '고스트', 'NORMAL', '팬텀',       38, 68,   3000, 13),
  ('gym-fairy',    '요정 체육관',  '페어리', 'NORMAL', '페어리',     78, 105,  4000, 14),
  ('gym-steel',    '금속 체육관',  '강철',   'HARD',   '아이언',     90, 68,   4500, 15),
  ('gym-dark',     '심연 체육관',  '악',     'HARD',   '다크',       28, 110,  5000, 16),
  ('gym-normal',   '평원 체육관',  '노말',   'EASY',   '노멀',       50, 105,   600, 17),
  ('gym-dragon',   '용혼 체육관',  '드래곤', 'BOSS',   '드라코',     88, 92,   8000, 18)
on conflict (id) do update
  set name = excluded.name,
      type = excluded.type,
      difficulty = excluded.difficulty,
      leader_name = excluded.leader_name,
      location_x = excluded.location_x,
      location_y = excluded.location_y,
      min_power = excluded.min_power,
      display_order = excluded.display_order;

-- 2) 관장 NPC 포켓몬 — 신규 10 체육관, 각 3 마리. dex 는 PokeAPI gen5
--    sprite 와 일치. idempotent — 신규 10 만 우선 삭제 후 재삽입.
delete from gym_pokemon where gym_id in (
  'gym-fighting','gym-poison','gym-flying','gym-bug','gym-ghost',
  'gym-fairy','gym-steel','gym-dark','gym-normal','gym-dragon'
);

insert into gym_pokemon (gym_id, slot, name, type, dex, hp, atk, def, spd) values
  -- 격투 EASY (하드웍)
  ('gym-fighting', 1, '알통몬',     '격투',   66,  100,  32, 24, 26),
  ('gym-fighting', 2, '근육몬',     '격투',   67,  130,  40, 30, 30),
  ('gym-fighting', 3, '괴력몬',     '격투',   68,  170,  52, 40, 36),
  -- 독 EASY (톡신)
  ('gym-poison',   1, '아보',       '독',     23,  105,  30, 22, 30),
  ('gym-poison',   2, '또가스',     '독',    109,  140,  38, 36, 22),
  ('gym-poison',   3, '또도가스',   '독',    110,  180,  48, 50, 26),
  -- 비행 NORMAL (에어로)
  ('gym-flying',   1, '구구',       '비행',   16,  110,  32, 24, 36),
  ('gym-flying',   2, '피죤',       '비행',   17,  140,  38, 32, 44),
  ('gym-flying',   3, '피죤투',     '비행',   18,  180,  52, 42, 56),
  -- 벌레 EASY (버그마스터)
  ('gym-bug',      1, '캐터피',     '벌레',   10,   95,  28, 24, 30),
  ('gym-bug',      2, '단데기',     '벌레',   11,  120,  30, 50, 12),
  ('gym-bug',      3, '버터플',     '벌레',   12,  160,  44, 32, 50),
  -- 고스트 NORMAL (팬텀)
  ('gym-ghost',    1, '고오스',     '고스트', 92,  115,  38, 24, 42),
  ('gym-ghost',    2, '고우스트',   '고스트', 93,  150,  46, 32, 50),
  ('gym-ghost',    3, '팬텀',       '고스트', 94,  200,  62, 42, 60),
  -- 페어리 NORMAL (페어리)
  ('gym-fairy',    1, '삐',         '페어리',173,  110,  30, 28, 34),
  ('gym-fairy',    2, '삐삐',       '페어리', 35,  140,  36, 34, 38),
  ('gym-fairy',    3, '픽시',       '페어리', 36,  190,  50, 44, 44),
  -- 강철 HARD (아이언)
  ('gym-steel',    1, '코일',       '강철',   81,  130,  40, 56, 30),
  ('gym-steel',    2, '레어코일',   '강철',   82,  170,  52, 70, 38),
  ('gym-steel',    3, '자포코일',   '강철',  462,  220,  64, 84, 44),
  -- 악 HARD (다크)
  ('gym-dark',     1, '곤율거니',   '악',    261,  120,  38, 28, 38),
  ('gym-dark',     2, '그라에나',   '악',    262,  160,  50, 38, 48),
  ('gym-dark',     3, '헬가',       '악',    229,  210,  64, 46, 60),
  -- 노말 EASY (노멀)
  ('gym-normal',   1, '푸린',       '노말',   39,  120,  28, 22, 22),
  ('gym-normal',   2, '푸크린',     '노말',   40,  155,  34, 28, 26),
  ('gym-normal',   3, '이브이',     '노말',  133,  170,  44, 36, 50),
  -- 드래곤 BOSS (드라코)
  ('gym-dragon',   1, '미뇽',       '드래곤',147,  140,  44, 32, 36),
  ('gym-dragon',   2, '신뇽',       '드래곤',148,  180,  56, 42, 44),
  ('gym-dragon',   3, '망나뇽',     '드래곤',149,  260,  82, 56, 60);

-- 3) 메달 정의 — 신규 10.
insert into gym_medals (gym_id, name, type, description) values
  ('gym-fighting', '주먹 메달',   '격투',   '주먹 체육관 정복의 증표.'),
  ('gym-poison',   '독액 메달',   '독',     '독무 체육관 정복의 증표.'),
  ('gym-flying',   '바람 메달',   '비행',   '돌풍 체육관 정복의 증표.'),
  ('gym-bug',      '갑각 메달',   '벌레',   '날개 체육관 정복의 증표.'),
  ('gym-ghost',    '환영 메달',   '고스트', '환영 체육관 정복의 증표.'),
  ('gym-fairy',    '요정 메달',   '페어리', '요정 체육관 정복의 증표.'),
  ('gym-steel',    '금속 메달',   '강철',   '금속 체육관 정복의 증표.'),
  ('gym-dark',     '어둠 메달',   '악',     '심연 체육관 정복의 증표.'),
  ('gym-normal',   '기본 메달',   '노말',   '평원 체육관 정복의 증표.'),
  ('gym-dragon',   '용혼 메달',   '드래곤', '용혼 체육관 정복의 증표.')
on conflict (gym_id) do update
  set name = excluded.name,
      type = excluded.type,
      description = excluded.description;

notify pgrst, 'reload schema';
