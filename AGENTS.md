<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Supabase migrations

- Put every schema/RPC change in a new file at `supabase/migrations/YYYYMMDD_<slug>.sql`. Filenames are applied in alphabetical (= chronological) order by the CI job, so the date prefix matters.
- Write migrations so they're **idempotent**: `create or replace function …`, `create table if not exists …`, `alter table … add column if not exists …`. The CI re-runs a file whenever its checksum changes, so non-idempotent DDL will fail on the second run.
- Do NOT run migrations manually via `node scripts/apply-*.mjs` anymore. The `.github/workflows/supabase-migrations.yml` job runs on every push that touches `supabase/migrations/**.sql` (or the workflow file itself) and applies anything the `_migrations` checksum ledger hasn't seen yet. Secret: `SUPABASE_DB_URL` (session-pooler URI, port 5432).
- When you add a new migration: commit → push → CI applies → done. End the commit message with a line like `마이그레이션: <filename>` so the user can grep deploy history.
- Only fall back to manual `psql` / `node scripts/apply-…` if CI is genuinely broken. If you do, also push the migration file so CI catches up on the next run.
- `scripts/apply-*.mjs` files are historical; don't add new ones. Put the SQL in `supabase/migrations/` instead.

## 자주 만나는 함정 (실제로 CI 가 빨갛게 변한 사례들)

- **`CREATE OR REPLACE FUNCTION` 은 파라미터 이름 변경 거부**. 같은 시그니처 `(text)` 라도 `p_difficulty` → `p_gym_id` 처럼 이름만 바꾸면 PG 가 에러를 뱉음. 본문/의미만 바꿔야 하면 파라미터 이름은 그대로 두고 주석으로 의미 변경 표기. 진짜로 이름을 바꿔야 하면 `DROP FUNCTION ...` 후 `CREATE` (단, dependent function 영향 주의).
- **`TRUNCATE` 는 외래키 참조가 있으면 RESTRICT 위반**. 분리된 `TRUNCATE A; TRUNCATE B;` 가 아니라 `TRUNCATE A, B, C CASCADE;` 한 문장으로 처리. (예: `gym_battle_logs.challenge_id → gym_challenges`)
- **카드↔속성 매핑은 server-side `card_types` 테이블에 있음**. `psa_gradings.card_id` 만으로는 속성을 알 수 없으니 SQL 자동화 시 `join card_types ct on ct.card_id = g.card_id` 로 wild_type 조회. 카탈로그 변경 시 `npx tsx scripts/dump-card-types.mts > supabase/migrations/<날짜>_card_types_reseed.sql` 로 재시드.

# 카드 / PCL 컨벤션

- 카드는 `psa_gradings` 의 한 row = PCL 슬랩 1장. 동일 `card_id` 의 PCL10 슬랩 여러 장 가능 (수집 카운트). 펫/전시/방어덱 등록은 grading_id 단위.
- 펫 등록은 **PCL 10 만**. `set_pet_for_type` RPC 가 server-side 에서 강제 (트레이너/null type 도 거부 — 20260644).
- 펫 점수 = `compute_user_pet_score(user_id)` — `main_card_ids ∪ flatten_pet_ids_by_type(main_cards_by_type)` 의 PCL10 슬랩 등급별 정액 (MUR 40k / UR 20k / SAR 12k / SR 7k / MA 5k / AR 4k / RR 2k / R 1k / U·C 0.5k).
- 사용자 화면에는 내부 용어 노출 금지: `center_power` → 총 전투력, `pet_score` → 펫 등록 전투력, `gym_medal_buff` → 메달 전투력, `pokedex_completion_bonus` → 도감 세트효과, `grade` → PCL 등급, `rarity` → 카드 희귀도.

# 체육관 컨벤션 (현재 정책)

- PCL 10 슬랩만 모든 체육관 기능 사용 가능 (방어덱 등록/도전/전투 계산).
- 점령 보호 시간 = 1시간 (`gym_protection_interval()`). 추가 연장도 +1시간.
- 메달은 영구 업적 — `(user_id, gym_id) PK` 로 중복 지급 방지.
- 메달 전투력 = per-gym 차등 (`gym_medal_buff(gym_id)`). 풀 +10k ~ 드래곤 +300k.
- 전투 산식 = `gym_pet_battle_stats` (sqrt 정규화 + 일반 35% / MUR 45% 캡 + 방어자 HP × 1.10 + 속성 일치 ATK × 1.10 + MUR 공격자 ATK × 1.05). 자세한 건 `docs/gym-battle-spec.md`.

# 모바일 하단 네비게이션

- 우선 진입 6개 (좌→우): 홈 / 등급 / 도감 / 체육관 / 야생 / 프로필.
- 더보기 시트: 랭킹 / 센터 / 지갑 / 선물함.
- 순서 변경 시 `src/components/Navbar.tsx` 의 `NAV_ITEMS` 배열 + `MOBILE_PRIMARY` 둘 다 동기화.
