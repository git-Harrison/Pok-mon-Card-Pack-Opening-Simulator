-- ============================================================
-- 무력화 (no-op).
--
-- 원래 hun 계정에 속성별 최고 PCL10 펫 3장씩 시드하려던 마이그레이션이
-- 었으나 다음 두 가지 이유로 적용 불가 → ledger 통과를 위해 본문 비움.
--
--   1) `psa_gradings` INSERT 가 존재하지 않는 컬럼 (`grading_date`, `cost`)
--      을 참조. 실제 컬럼은 `graded_at` (default now()) 이고 cost 는 없음.
--   2) `main_cards_by_type` UPDATE CTE 가 정의된 적 없는 `existing` /
--      `new_gradings` CTE 를 참조 (UNION ALL 본문도 미완성).
--
-- 의도된 시드 데이터는 이미 후속 시드들이 대체:
--   - 20260689_seed_hun_all_mur_pcl10.sql
--   - 20260682_seed_kim_grass_ur_pcl10.sql 등
--
-- 따라서 본 파일은 history 만 보존하고 본문은 no-op. 적용되어도 DB 상태
-- 는 변하지 않음.
-- ============================================================

select 1 where false;
