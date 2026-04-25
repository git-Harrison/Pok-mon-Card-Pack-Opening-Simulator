-- ============================================================
-- DB 쿼리 성능 — 핫 경로 인덱스 추가
--
-- 감사 결과 (2026-04-26): 다음 RPC 들이 사용자 트래픽이 몰릴
-- 때 풀 스캔 / 정렬 비용을 발생시키는 것으로 확인됨.
--   · get_user_rankings()        — /users · /home (가장 자주)
--   · get_user_activity()        — /users 펼침 (탭별 최근 10건)
--   · get_taunt_history()        — /profile 모달
--   · claim_showcase_income()    — 페이지 로드마다
--   · bulk_create_showcases()    — 다중 슬랩 검증 루프
--   · create_gift / send_taunt   — 24h 슬라이딩 한도 윈도우
--
-- 기존 마이그레이션 (20260525_slow_query_audit.sql, 20260524_pokedex.sql,
-- 20260517_gifts_pcl_only.sql, 20260501_taunts_and_gift_viewed.sql) 에서
-- 이미 추가된 인덱스는 건드리지 않고, 다음 핫 경로에서 실측 누락된
-- 인덱스만 보충한다. 각 인덱스에는 무엇을 가속하는지 코멘트로 남김.
--
-- 보수적 원칙: 쓰기 부하가 큰 컬럼/조건은 partial index 로 좁히고,
-- 단일 컬럼 단순 인덱스는 plan 재사용성이 검증된 경우에만 추가.
-- 모든 statement 는 `if not exists` 로 idempotent — CI 재실행 안전.
-- ============================================================

-- 1) showcase_cards.showcase_id ----------------------------------
-- 누락된 가장 큰 핫 인덱스. claim_showcase_income / get_user_rankings /
-- bulk_create_showcases / sabotage_owner_showcase / 20260520 의 visit
-- center stats 모두 `join user_showcases on us.id = sc.showcase_id` +
-- `where sc.showcase_id = ...` 패턴을 사용하지만 인덱스가 없어
-- showcase_cards 풀 스캔 후 hash join 으로 빠지는 경우가 있음.
create index if not exists showcase_cards_showcase_idx
  on showcase_cards(showcase_id);

-- 2) psa_gradings (user_id, graded_at desc) ----------------------
-- get_user_activity('rank') / ('pet') / 20260549 의 row_number()
-- over(order by registered_at) 등 "내 슬랩을 최신순" 쿼리 전용.
-- 기존 (user_id, grade) 인덱스로는 graded_at desc 정렬이 안 됨.
create index if not exists psa_gradings_user_graded_at_idx
  on psa_gradings(user_id, graded_at desc);

-- 3) sabotage_logs (attacker_id, created_at desc) — 성공만 ---------
-- get_user_activity('rank') 의 wins CTE 가
--   where attacker_id = ? and success order by created_at desc limit 10
-- 으로 떨어지는데 기존 (attacker_id, success) 인덱스는 created_at
-- 정렬을 커버하지 못함. 성공 행만 인덱싱 (전체 중 ~30% 추정).
create index if not exists sabotage_logs_attacker_success_recent_idx
  on sabotage_logs(attacker_id, created_at desc)
  where success;

-- 4) sabotage_logs (victim_id, created_at desc) — 방어 성공만 ------
-- get_user_activity('rank') 의 defs CTE — victim_id = me, success=false
-- (방어 성공) 최근 10건. partial 로 범위 좁힘.
create index if not exists sabotage_logs_victim_defended_recent_idx
  on sabotage_logs(victim_id, created_at desc)
  where not success;

-- 5) taunts (from_user_id, created_at desc) ----------------------
-- 두 곳에서 핫:
--   · get_taunt_history()  — 보낸 조롱 최근 50건 정렬
--   · taunt_quota / send_taunt — `created_at > now() - 24h` 슬라이딩
--     윈도우 카운트. 보낸 사람당 적은 행이지만 정렬·범위 둘 다 도움.
create index if not exists taunts_from_created_idx
  on taunts(from_user_id, created_at desc);

-- 6) taunts (to_user_id, created_at desc) ------------------------
-- get_taunt_history() — 받은 조롱 최근 50건 정렬. 기존 unseen partial
-- 인덱스는 seen=true 인 과거 행을 커버하지 못함.
create index if not exists taunts_to_created_idx
  on taunts(to_user_id, created_at desc);

-- 7) pokedex_entries (user_id, registered_at desc) ---------------
-- get_user_activity('power') 의 pokedex CTE: row_number() over
-- (order by registered_at asc) + order by registered_at desc limit 10.
-- 기존 (user_id) idx 로는 정렬이 안 돼 sort 가 발생.
create index if not exists pokedex_entries_user_registered_idx
  on pokedex_entries(user_id, registered_at desc);

-- 8) gifts (from_user_id, created_at desc) -----------------------
-- create_gift 의 24h 한도 검사:
--   select count(*) where from_user_id = ? and created_at > now() - 24h
-- 기존 (from_user_id, status) 인덱스는 created_at 범위에서 비효율.
create index if not exists gifts_from_created_idx
  on gifts(from_user_id, created_at desc);

-- 9) gifts (to_user_id, status, expires_at) ----------------------
-- fetch_unseen_gift_count: to_user_id + status='pending' + viewed_at null
-- + expires_at > now(). 기존 (to_user_id, status) 위에 expires_at 까지
-- 묶으면 범위 스캔이 인덱스 안에서 끝남 (rows 적은 시스템에선 큰
-- 차이 없지만 status='accepted' 누적 행이 늘어날수록 효과 커짐).
create index if not exists gifts_to_status_expires_idx
  on gifts(to_user_id, status, expires_at)
  where status = 'pending';

-- 10) users (lower(display_name)) --------------------------------
-- send_taunt / create_gift 가 `where lower(display_name) = lower(?)` 로
-- 검색하는데 기존 functional index 는 lower(user_id) 만 커버함.
-- display_name 검색이 풀 스캔으로 떨어지던 케이스 차단.
create index if not exists users_display_name_lower_idx
  on users(lower(display_name));

-- ANALYZE 후 plan 캐시 무효화
analyze showcase_cards;
analyze psa_gradings;
analyze sabotage_logs;
analyze taunts;
analyze pokedex_entries;
analyze gifts;
analyze users;

notify pgrst, 'reload schema';
