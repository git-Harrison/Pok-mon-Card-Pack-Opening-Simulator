# 펫 등록 전투력(pet_score) 계산 스펙

> 조사 시점: 2026-04-28
> 대상 브랜치: `main`
> 핵심 함수: `compute_user_pet_score(user_id)`

## 0. 한 줄 요약

펫 등록 전투력은 **PCL 10 슬랩 한정**으로 `rarity_score(rarity) × 15` 점이 슬롯당 부여된다. 신구조(`main_cards_by_type`)와 구구조(`main_card_ids`)는 SQL `UNION` 으로 합산되어 **중복 가산 위험 없음**. 방어덱 등록 카드는 main_cards 에서 자동 제거되어 펫 점수에서 빠진다.

---

## 1. 현재 펫 등록 전투력 지급 수치 (등급별)

### 등급별 점수표 (PCL 10 슬랩당)

| 희귀도 | rarity_score | × 15 | 슬롯당 점수 |
|--------|------------:|----:|----------:|
| **MUR** | 28 | × 15 | **420** |
| **UR**  | 18 | × 15 | **270** |
| **SAR** | 12 | × 15 | **180** |
| **MA**  | 9  | × 15 | **135** |
| **SR**  | 7  | × 15 | **105** |
| **AR**  | 4  | × 15 | **60**  |
| **RR**  | 3  | × 15 | **45**  |
| **R**   | 2  | × 15 | **30**  |
| **U**   | 1  | × 15 | **15**  |
| **C**   | 1  | × 15 | **15**  |
| 그 외   | 0  | × 15 | 0       |

### 함수 정의

`supabase/migrations/20260615_medal_buff_set_effect_box_price.sql:64-85`

```sql
create or replace function rarity_score(p_rarity text)
returns int language sql immutable as $$
  select case p_rarity
    when 'MUR' then 28
    when 'UR'  then 18
    when 'SAR' then 12
    when 'MA'  then  9
    when 'SR'  then  7
    when 'AR'  then  4
    when 'RR'  then  3
    when 'R'   then  2
    when 'U'   then  1
    when 'C'   then  1
    else 0
  end::int;
$$;
```

### MUR 우대 진화

| 시점 | 마이그레이션 | MUR rarity_score | × multiplier | MUR PCL10 슬롯당 |
|-----|-------------|---:|---:|---:|
| 초기 | 20260519 | 10 | × 10 | **100** |
| 1차 상향 | 20260591 | 10 | × 15 | **150** (×1.5) |
| 2차 상향 (현재) | 20260615 | **28** | × 15 | **420** (초기 대비 ×4.2) |

근거 주석 (`20260615_…:14-17`):
> "펫 등록 전투력 상향. 특히 MUR 등급 더 크게."

---

## 2. 계산 위치

### 산식 — `compute_user_pet_score(user_id)`

`supabase/migrations/20260619_pet_by_type.sql:39-56`

```sql
create or replace function compute_user_pet_score(p_user_id uuid)
returns int language sql stable as $$
  with all_ids as (
    select unnest(coalesce(main_card_ids, '{}'::uuid[])) as id
      from users where id = p_user_id
    union
    select unnest(flatten_pet_ids_by_type(main_cards_by_type)) as id
      from users where id = p_user_id
  )
  select coalesce(sum(rarity_score(g.rarity) * 15), 0)::int
    from psa_gradings g
   where g.id in (select id from all_ids)
     and g.grade = 10;
$$;
```

### 계산 위치 정리

| 항목 | 답 |
|------|----|
| 클라(TS) 계산 여부 | ❌ 없음. 클라는 RPC 응답값만 표시 |
| 서버(SQL) 계산 | ✅ SQL 함수 |
| DB 저장 컬럼 | ✅ `users.pet_score` (denormalized cache, `20260519_…:25`) |
| 매 호출 재계산 | `get_profile()` 호출 시 매번 재계산하여 컬럼 덮어씀 (보수적) |
| 카드 희귀도 기준 | ✅ |
| PCL 등급 기준 | ✅ **PCL 10 슬랩만** 점수 부여 (`g.grade = 10`) |
| 카드 속성 기준 | ❌ 카드 속성은 점수 계산에 영향 없음 |
| 슬롯 수 기준 | ❌ 슬롯 가중치 없음 (모든 슬롯 동일 점수) |
| 속성별 등록 보너스 | ❌ 속성 매칭 보너스 없음 |

### pet_score 갱신 시점

1. **펫 슬롯 등록/해제** — `set_pet_for_type()` (`20260619_…:162-163`)
2. **프로필 조회** — `get_profile()` 매 호출 시 (`20260619_…:260-261`)
3. **마이그레이션 시점** — 일괄 갱신 (`20260619_…:302`, `20260615_…:87-89`)
4. **방어덱 등록/패배** — `set_gym_defense_deck()`, `resolve_gym_battle()` 패배 처리

---

## 3. 반영 범위 — 어디에 어떻게 더해지는가

`pet_score` 는 모든 전투력 표시값에 **그대로 합산** (가중치 1배)된다.

### center_power 합산 구조 (모든 표시 통일)

```
center_power =
    Σ showcase_power(rarity, grade)        ── 전시 카드 전투력
  + pokedex_power_bonus(user_id)            ── 도감 등록 보너스
  + pokedex_completion_bonus(user_id)       ── 도감 세트효과
  + users.pet_score                         ── 펫 슬롯 전투력 ★
  + Σ gym_medal_buff(difficulty)            ── 메달 난이도 버프
```

| 표시 영역 | 함수 | pet_score 합산 방식 |
|----------|------|------|
| 프로필 전투력 | `get_profile` (`20260619_…:286-292`) | 그대로 +1배 |
| 랭킹 전투력 | `get_user_rankings` (`20260630_…:120-137`) | 그대로 +1배 |
| 체육관 도전 게이트 / 보너스 | `gym_compute_user_center_power` (`20260630_…:36-61`) | 그대로 +1배 |
| 유저 상세 화면 | `ProfileView.tsx` | RPC 응답 그대로 표시 |
| 전체 전투력 | 위 4개 모두 동일 산식 | 일관 |

**결론**: 5개 표시값이 **모두 같은 산식** 을 쓴다. UI 가 다른 값을 보여주면 캐시 stale 또는 RPC 호출 누락 의심.

---

## 4. 신구조(속성별 3개) vs 구구조(전체 10개) 합산

### 두 컬럼

| 컬럼 | 구조 | 최대 슬롯 |
|------|------|---:|
| `users.main_card_ids` (구) | uuid[] | 10 (legacy) |
| `users.main_cards_by_type` (신) | jsonb `{ "type": [uuid×3] }` | 18 type × 3 = 54 |

### 합산 — UNION (중복 자동 제거)

```sql
with all_ids as (
  select unnest(main_card_ids)                       -- 구구조
    union                                             -- ← UNION (UNION ALL 아님)
  select unnest(flatten_pet_ids_by_type(main_cards_by_type))  -- 신구조
)
```

| 케이스 | 결과 |
|-------|------|
| 같은 카드가 두 구조 모두에 있음 | UNION 으로 1번만 합산 (중복 가산 없음) ✅ |
| 한 쪽에만 있음 | 정상 합산 ✅ |
| 양쪽 모두 비어있음 | 0 점 ✅ |

### 두 구조 간 상호 배제 규칙

`set_pet_for_type()` 호출 시 신구조에 등록되면 → **구구조에서도 자동 제거** (`20260619_…:146-160`):

```sql
update users
   set main_cards_by_type = v_data,
       main_card_ids = array(
         select id from unnest(main_card_ids) as id
          where not (id = any(v_ids))
       )
 where id = p_user_id;
```

→ 단방향 전환(구→신) 만 지원. 혼재 상태 사실상 발생하지 않음.

### 자동 재계산 트리거

| 동작 | pet_score 즉시 갱신? |
|------|------:|
| 펫 등록 (set_pet_for_type) | ✅ |
| 펫 해제 / 변경 | ✅ |
| 방어덱 등록 (set_gym_defense_deck) | ✅ |
| 방어덱 패배 (resolve_gym_battle) | ✅ |
| 카드 삭제 / 감별 변경 | ❌ DB trigger 없음 — 명시 RPC 내부에서만 처리 |
| `get_profile` 조회 | ✅ (integrity check 재계산) |

---

## 5. 제외 대상 처리

### 펫 등록 전투력 제외 대상 (사용자 요구사항)

| 대상 | 현재 처리 상태 | 위치 |
|------|--------------|------|
| 전시(showcase) 카드 | ✅ 펫 등록 시점에 거부 (`20260619_…:110-115`) — 전시와 펫 동시 등록 불가 |
| 체육관 방어덱 카드 | ✅ `set_gym_defense_deck` 가 main_cards 에서 제거 후 pet_score 재계산 (`20260620_…:485-505`) |
| 펫 미등록 카드 | ✅ main_card_ids/by_type 에 없으면 합산 안 됨 |
| 삭제된 카드 | ✅ `psa_gradings` row 부재 → 합산 불가 (단 main_cards 배열에는 stale uuid 남을 수 있음 — `where g.id in (...)` join 으로 자동 필터) |
| 감별 처리된 카드 | ✅ grading 상태 변경 시 RPC 가 명시적으로 main_cards 정리 + pet_score 재계산 |

### PCL 등급 필터

`compute_user_pet_score` 는 **`g.grade = 10` 슬랩만** 합산. PCL 9 이하 슬랩은 펫에 등록되어 있어도 **0 점**.

### 방어덱 카드의 펫 목록 노출

방어덱 카드는 `set_gym_defense_deck()` 시점에 `main_card_ids` / `main_cards_by_type` 양쪽에서 **모두 제거** 된다. 따라서:
- 펫 등록 목록 UI 에서 자동으로 사라져야 함
- 펫 점수에도 미반영
- UI 가 stale 데이터를 보여주면 클라 캐시 무효화 누락 의심

### 이중 가산 위험 (전체 검토)

| 케이스 | 결과 |
|-------|------|
| 신구조 + 구구조 같은 카드 | ❌ UNION 으로 안전 |
| 펫 + 전시 동시 등록 | ❌ 등록 시 거부 → 발생 불가 |
| 펫 + 방어덱 동시 등록 | ❌ 방어덱 등록 시 main_cards 제거 → 펫 점수에서 빠짐 |
| 전시 + 방어덱 동시 등록 | ❌ `display_grading()` 검증 (`20260598_…:852-860`) |
| 펫 등록 카드 ↔ pet_score ↔ center_power | ❌ pet_score 1회 합산만 |

→ **현재 시스템에 알려진 이중 가산 경로 없음**

---

## 6. 핵심 파일 인덱스

| 역할 | 경로 |
|------|------|
| rarity_score 함수 | `supabase/migrations/20260615_medal_buff_set_effect_box_price.sql:64-85` |
| compute_user_pet_score | `supabase/migrations/20260619_pet_by_type.sql:39-56` |
| pet_score_for(uuid[]) (legacy) | `supabase/migrations/20260616_pet_score_main_only_resolve_validation.sql:49-59` |
| set_pet_for_type | `supabase/migrations/20260619_pet_by_type.sql:125-180` |
| flatten_pet_ids_by_type | `supabase/migrations/20260619_pet_by_type.sql` (helper) |
| main_cards_by_type 컬럼 | `supabase/migrations/20260619_pet_by_type.sql:20-24` |
| pet_score 컬럼 | `supabase/migrations/20260519_profile_pet_system.sql:25` |
| get_profile | `supabase/migrations/20260619_pet_by_type.sql:286-292` |
| get_user_rankings | `supabase/migrations/20260630_medal_buff_by_difficulty.sql:120-137` |
| gym_compute_user_center_power | `supabase/migrations/20260630_medal_buff_by_difficulty.sql:36-61` |
| 방어덱 등록 시 main_cards 정리 | `supabase/migrations/20260620_gym_resolve_pet_by_type_no_npc_fallback.sql:485-505` |
| 전시-펫 상호 배제 검증 | `supabase/migrations/20260619_pet_by_type.sql:110-115` |
| 전시-방어덱 상호 배제 검증 | `supabase/migrations/20260598_gym_economy_overhaul.sql:852-860` |
| 클라 표시 | `src/components/ProfileView.tsx`, `src/components/RankingView.tsx` |

---

## 7. 권장 액션

1. **정기 audit** — 모든 유저 `pet_score = compute_user_pet_score(id)` 재검증 SQL 1회 실행 (cache drift 검출).
2. **방어덱 ↔ 펫 목록 UI 동기화 점검** — 클라가 `users.main_cards_by_type` 만 읽고 있는지, RPC 응답을 통해 받는지 확인.
3. **신구조 전환 완료 확인** — 모든 활성 유저가 신구조 전환을 마쳤다면 `main_card_ids` 컬럼 deprecate / drop 검토.
4. **PCL < 10 슬랩 표시 정책** — 펫에 등록되어 있어도 점수 0 인 슬랩은 UI 에서 별도 표기 권장 (사용자 혼동 방지).
