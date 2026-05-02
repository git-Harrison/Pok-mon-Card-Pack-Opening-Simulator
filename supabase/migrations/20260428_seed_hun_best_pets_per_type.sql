-- Seed hun account with best PCL10 pets per type (18 types × 3 cards)
-- 한글: hun 계정에 속성별 최고 등급 펫 자동 할당 (18개 속성 × 3장씩)
-- 멱등 보증: 같은 카드/등급 조합이 이미 있으면 skip

BEGIN;

-- 1. hun의 user_id 조회
WITH v_user AS (
  SELECT id FROM auth.users WHERE email ILIKE 'hun%' LIMIT 1
),

-- 2. 선정된 카드 목록 (속성 → 최고 3장 PCL10 슬랩)
v_cards_to_insert AS (
  -- 노말 (Normal)
  SELECT 'v_normal_1'::text as seq, '노말'::text as type, 'm1l-092'::text as card_id, 'MUR'::text as rarity
  UNION ALL SELECT 'v_normal_2', '노말', 'm1s-051', 'RR'
  UNION ALL SELECT 'v_normal_3', '노말', 'm2-072', 'RR'
  
  -- 불꽃 (Fire)
  UNION ALL SELECT 'v_fire_1', '불꽃', 'm2-116', 'MUR'
  UNION ALL SELECT 'v_fire_2', '불꽃', 'm2-013', 'RR'
  UNION ALL SELECT 'v_fire_3', '불꽃', 'm1l-077', 'SR'
  
  -- 물 (Water)
  UNION ALL SELECT 'v_water_1', '물', 'm2a-046', 'RR'
  UNION ALL SELECT 'v_water_2', '물', 'sv8a-046', 'RR'
  UNION ALL SELECT 'v_water_3', '물', 'm2-026', 'R'
  
  -- 풀 (Grass)
  UNION ALL SELECT 'v_grass_1', '풀', 'm1l-087', 'SAR'
  UNION ALL SELECT 'v_grass_2', '풀', 'm1l-003', 'RR'
  UNION ALL SELECT 'v_grass_3', '풀', 'm2a-010', 'RR'
  
  -- 전기 (Electric)
  UNION ALL SELECT 'v_elec_1', '전기', 'sv8-033', 'RR'
  UNION ALL SELECT 'v_elec_2', '전기', 'sv8a-052', 'RR'
  UNION ALL SELECT 'v_elec_3', '전기', 'm2a-044', 'RR'
  
  -- 얼음 (Ice)
  UNION ALL SELECT 'v_ice_1', '얼음', 'm2a-036', 'RR'
  UNION ALL SELECT 'v_ice_2', '얼음', 'm1s-018', 'RR'
  UNION ALL SELECT 'v_ice_3', '얼음', 'sv8a-041', 'RR'
  
  -- 격투 (Fighting)
  UNION ALL SELECT 'v_fight_1', '격투', 'm1l-088', 'SAR'
  UNION ALL SELECT 'v_fight_2', '격투', 'm2a-092', 'RR'
  UNION ALL SELECT 'v_fight_3', '격투', 'm1l-078', 'SR'
  
  -- 독 (Poison)
  UNION ALL SELECT 'v_poison_1', '독', 'm2a-114', 'RR'
  UNION ALL SELECT 'v_poison_2', '독', 'm2a-101', 'U'
  UNION ALL SELECT 'v_poison_3', '독', 'm2a-115', 'U'
  
  -- 땅 (Ground)
  UNION ALL SELECT 'v_ground_1', '땅', 'm2a-090', 'RR'
  UNION ALL SELECT 'v_ground_2', '땅', 'm1l-021', 'C'
  UNION ALL SELECT 'v_ground_3', '땅', 'm4-045', 'U'
  
  -- 비행 (Flying)
  UNION ALL SELECT 'v_fly_1', '비행', 'm3-014', 'U'
  UNION ALL SELECT 'v_fly_2', '비행', 'sv2a-018', 'U'
  UNION ALL SELECT 'v_fly_3', '비행', 'm1l-053', 'C'
  
  -- 에스퍼 (Psychic)
  UNION ALL SELECT 'v_psych_1', '에스퍼', 'm2a-226', 'MA'
  UNION ALL SELECT 'v_psych_2', '에스퍼', 'm2a-071', 'RR'
  UNION ALL SELECT 'v_psych_3', '에스퍼', 'sv8a-063', 'RR'
  
  -- 벌레 (Bug)
  UNION ALL SELECT 'v_bug_1', '벌레', 'm4-003', 'RR'
  UNION ALL SELECT 'v_bug_2', '벌레', 'm2-004', 'RR'
  UNION ALL SELECT 'v_bug_3', '벌레', 'm2a-003', 'RR'
  
  -- 바위 (Rock)
  UNION ALL SELECT 'v_rock_1', '바위', 'm3-030', 'RR'
  UNION ALL SELECT 'v_rock_2', '바위', 'm3-046', 'RR'
  UNION ALL SELECT 'v_rock_3', '바위', 'm3-054', 'RR'
  
  -- 고스트 (Ghost)
  UNION ALL SELECT 'v_ghost_1', '고스트', 'm2a-240', 'SAR'
  UNION ALL SELECT 'v_ghost_2', '고스트', 'm2-036', 'RR'
  UNION ALL SELECT 'v_ghost_3', '고스트', 'm2a-068', 'C'
  
  -- 드래곤 (Dragon)
  UNION ALL SELECT 'v_dragon_1', '드래곤', 'm2a-134', 'RR'
  UNION ALL SELECT 'v_dragon_2', '드래곤', 'm2a-126', 'RR'
  UNION ALL SELECT 'v_dragon_3', '드래곤', 'm1s-049', 'RR'
  
  -- 악 (Dark)
  UNION ALL SELECT 'v_dark_1', '악', 'm1l-089', 'SAR'
  UNION ALL SELECT 'v_dark_2', '악', 'm2a-242', 'SAR'
  UNION ALL SELECT 'v_dark_3', '악', 'm2-051', 'RR'
  
  -- 강철 (Steel)
  UNION ALL SELECT 'v_steel_1', '강철', 'm2a-245', 'SAR'
  UNION ALL SELECT 'v_steel_2', '강철', 'm2a-122', 'RR'
  UNION ALL SELECT 'v_steel_3', '강철', 'sv8a-078', 'RR'
  
  -- 페어리 (Fairy)
  UNION ALL SELECT 'v_fairy_1', '페어리', 'm2a-243', 'SAR'
  UNION ALL SELECT 'v_fairy_2', '페어리', 'm4-035', 'RR'
  UNION ALL SELECT 'v_fairy_3', '페어리', 'sv8a-069', 'RR'
)

-- 3. Insert PCL10 gradings (멱등: 같은 카드/등급이 이미 있으면 skip)
INSERT INTO psa_gradings (user_id, card_id, grade, grading_date, cost)
SELECT vu.id, vci.card_id, 10, CURRENT_DATE, 0
FROM v_user vu
CROSS JOIN v_cards_to_insert vci
WHERE NOT EXISTS (
  SELECT 1 FROM psa_gradings pg
  WHERE pg.user_id = vu.id
  AND pg.card_id = vci.card_id
  AND pg.grade = 10
)
ON CONFLICT (user_id, card_id, grade) DO NOTHING;

-- 4. Update main_cards_by_type (각 속성 슬롯 최대 3개, 기존 카드 보존)
-- 로직:
--   a) 속성별로 현재 등록된 grading_id 개수 (N) 조회
--   b) N < 3이면 추가로 (3-N)개의 새 카드 선택해서 append
--   c) N >= 3이면 skip (기존 유지)
WITH v_user_id AS (
  SELECT id FROM auth.users WHERE email ILIKE 'hun%' LIMIT 1
),
v_type_counts AS (
  SELECT
    type,
    COUNT(*) as existing_count
  FROM (
    SELECT
      CASE type
        WHEN '노말' THEN '노말'
        WHEN '불꽃' THEN '불꽃'
        WHEN '물' THEN '물'
        WHEN '풀' THEN '풀'
        WHEN '전기' THEN '전기'
        WHEN '얼음' THEN '얼음'
        WHEN '격투' THEN '격투'
        WHEN '독' THEN '독'
        WHEN '땅' THEN '땅'
        WHEN '비행' THEN '비행'
        WHEN '에스퍼' THEN '에스퍼'
        WHEN '벌레' THEN '벌레'
        WHEN '바위' THEN '바위'
        WHEN '고스트' THEN '고스트'
        WHEN '드래곤' THEN '드래곤'
        WHEN '악' THEN '악'
        WHEN '강철' THEN '강철'
        WHEN '페어리' THEN '페어리'
      END as type,
      grading_id
    FROM users u, jsonb_each_text(u.main_cards_by_type) AS t(type, ids)
    CROSS JOIN LATERAL jsonb_array_elements_text(t.ids::jsonb) AS ids(grading_id)
    WHERE u.id = (SELECT id FROM v_user_id)
  ) t
  GROUP BY type
)
UPDATE users u
SET main_cards_by_type = (
  SELECT jsonb_object_agg(type, grading_ids)
  FROM (
    SELECT
      '노말' as type,
      COALESCE((SELECT ids FROM existing WHERE type='노말'), '[]'::jsonb) ||
      COALESCE((SELECT jsonb_agg(id ORDER BY id) FROM new_gradings WHERE type='노말'), '[]'::jsonb) as grading_ids
    UNION ALL
    SELECT
      '불꽃',
      COALESCE((SELECT ids FROM existing WHERE type='불꽃'), '[]'::jsonb) ||
      COALESCE((SELECT jsonb_agg(id ORDER BY id) FROM new_gradings WHERE type='불꽃'), '[]'::jsonb)
    UNION ALL
    SELECT
      '물',
      COALESCE((SELECT ids FROM existing WHERE type='물'), '[]'
