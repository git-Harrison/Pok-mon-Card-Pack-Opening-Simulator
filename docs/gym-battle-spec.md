# 체육관 대결 시스템 — 전투 스펙 (v4)

> 최종 수정: 2026-05-03 (v4 — 공격자 친화 밸런스 + 유저 전투력 스탯 보정 제거)
> 대상 브랜치: `main`
> 핵심 마이그레이션: `20260687_gym_battle_attacker_friendly.sql` (v4),
>                  `20260637_gym_battle_redesign_v3.sql` (v3 baseline)

## 0. 한 줄 요약

체육관 시스템은 **PCL 10 슬랩 전용**. PCL 9 이하는 등록/도전/전투 어디에도 들어올 수 없다. 산식은 `희귀도 base + 공격자 ATK 1.10 + MUR 공격 1.05 + 체육관 속성 일치 1.10` 의 합성. v4 에서 **유저 전투력(center_power) 의 hp/atk 가산 제거** 및 **방어자 HP 1.10 보정 제거** — 진입장벽 완화 + 공격자 우위 확보. PCL 등급별 배율(grade_mult)은 폐기. `def`/`spd` 컬럼은 시뮬레이션 미사용 (Phase 5 예정).

---

## 1. default 포켓몬 (체육관 미점령 시 등장)

| 항목 | 내용 |
|------|------|
| 데이터 출처 | `gym_pokemon` 테이블 — 초기 시드 `20260585_gym_phase1.sql:180-217`, 난이도별 정규화 `20260637_…` |
| 정의 방식 | 체육관 × 3슬롯 시드. 난이도별 hp/atk 정규화 |
| 컬럼 | `slot, name, type, dex, hp, atk, def, spd` |
| **난이도별 정규화 (v3)** | EASY 100~140 / 20~35 · NORMAL 150~210 / 35~55 · HARD 220~320 / 55~80 · BOSS 260~380 / 65~95 |
| 능력치 계산 | 시드 고정값 그대로 로드 (`20260620_…:209-225`) |
| **반영 보너스** | 체육관 속성 == 포켓몬 속성일 때 `atk × 1.10` (속성 일치 보정만) |
| **반영 안 됨** | 희귀도 / PCL / 메달 / 도감 / 펫 점수 / 도전자 center_power |
| 실제 사용 여부 | ✅ 미점령 체육관일 때만. 점령된 체육관은 default 미사용 |

---

## 2. 유저 방어덱 (체육관 점령 후 등록한 3마리)

| 항목 | 내용 |
|------|------|
| 데이터 출처 | `gym_ownerships.defense_pet_ids` (uuid[3]), `defense_pet_types` (text[3]) |
| 등록 함수 | `set_gym_defense_deck()` — `supabase/migrations/20260620_gym_resolve_pet_by_type_no_npc_fallback.sql:379-514` |
| 등록 검증 | (1) 본인 소유 (2) PCL 10 슬랩 (3) 펫 등록 상태(main_card_ids 또는 main_cards_by_type) (4) 체육관 속성 일치 — 4가지 모두 |

### 능력치 산식 — `gym_pet_battle_stats(is_defender=true)` (v4)

`supabase/migrations/20260687_gym_battle_attacker_friendly.sql`

```
# (1) PCL 10 hard gate
if grade != 10: return  (호출 측에서 abort)

# (2) 희귀도 base — gym_rarity_base_stats(rarity)
hp  = rarity_base_hp[rarity]
atk = rarity_base_atk[rarity]

# (3) center_power 보정 — v4 에서 제거됨 (유저 전투력은 스탯에 영향 X)

# (4) 방어자 HP 보정 — v4 에서 1.00 (no-op, helper 호출만 유지)
hp = hp × gym_defender_hp_multiplier()    # 1.00

# (5) 속성 일치 가산
if pet_type == gym_type:
    atk = atk × gym_type_match_multiplier()    # 1.10

final_hp  = round(hp)
final_atk = round(atk)
```

### 희귀도별 기본 스탯 (PCL 10 슬랩, v3)

| 희귀도 | base HP | base ATK |
|--------|--:|--:|
| **MUR** | **240** | **60** |
| **UR**  | 165 | 39 |
| **SAR** | 135 | 31 |
| **SR**  | 110 | 24 |
| **MA**  | 100 | 21 |
| **AR**  | 90  | 18 |
| **RR**  | 70  | 14 |
| **R**   | 60  | 12 |
| **U/C** | 50  | 10 |

### center_power 보정 (v4 폐기)

v4 부터 center_power 는 **전투 스탯에 영향 없음**. 표시 / 매칭(min_power 도전 게이트) / 랭킹용 으로만 사용. `gym_power_bonus_rate(cp, rarity)` 는 항상 0 반환 (kept-for-safety).

| 항목 | 내용 |
|------|------|
| 반영 보너스 | 희귀도 base, 속성 일치 ATK × 1.10 |
| 반영 안 됨 | center_power, PCL 등급 배율(폐기), 도감/메달 별도 가산, 방어자 HP 보너스(v4 에서 1.00 으로 제거) |
| 슬롯 fallback | 없음. 3마리 미달이면 점령 자체가 막힘 |
| 카드 깨짐 처리 | `psa_gradings` 삭제 cascade로 자동 정리 |
| 실제 사용 | ✅ 점령 체육관일 때 항상 |

---

## 3. 도전자 펫/카드 3마리

| 항목 | 내용 |
|------|------|
| 데이터 출처 | 클라 입력 `p_pet_grading_ids[3]`, `p_pet_types[3]` |
| 검증 | `users.main_card_ids ∪ flatten_pet_ids_by_type(main_cards_by_type)` (`20260620_…:106-118`) |
| 속성 제약 | 체육관 속성과 동일한 `pet_type` 만 사용 가능. 다른 속성 1장이라도 섞이면 `wrong_type` 으로 도전 자체 abort |

### 능력치 산식 — `gym_pet_battle_stats(is_defender=false)` (v4)

```
# (1) PCL 10 hard gate — 방어자와 동일
# (2) 희귀도 base
# (3) center_power 보정은 v4 에서 제거됨

# 방어자 HP 가산은 적용 안 함 (공격자 = 도전자)

# (4) 공격자 ATK 가산 — v4 신규 (모든 희귀도)
atk = atk × gym_attacker_atk_multiplier()    # 1.10

# (5) MUR 공격자 ATK 가산
if rarity == 'MUR':
    atk = atk × gym_mur_attack_multiplier()    # 1.05

# (6) 속성 일치 ATK 가산 — 방어자와 동일
```

| 항목 | 내용 |
|------|------|
| 반영 보너스 | 희귀도 base, 공격자 ATK × 1.10 (v4), MUR 공격 × 1.05, 속성 일치 × 1.10 |
| 반영 안 됨 | center_power(v4 제거), PCL 배율, 도감/펫/메달 별도 가산 |
| 프로필 vs 대결 | 프로필이 `gym_compute_user_center_power` 결과를 표시한다면 동일 |
| 실제 사용 | ✅ 항상 |

### "속성 카드 없음" 버그 의심 후보

1. 클라이언트가 신구조(`main_cards_by_type`) 또는 legacy(`main_card_ids`) 한 쪽만 읽고 있을 가능성. 서버 RPC는 union 처리하지만, 클라 화면이 다르면 화면-서버 괴리 발생.
2. 펫 등록 시 `pet_type` 을 클라가 잘못 저장. `CARD_NAME_TO_TYPE` 125건 일괄 보정(2026-04-29) 이전에 펫 등록한 카드는 `pet_type` 이 "노말" 또는 null 일 수 있음 → 백필 1회 권장.
3. `resolveCardType` 메가 prefix 분기가 펫 등록 시점에는 안 돌고, 도전 검증 시점에만 돌면 type 어긋날 수 있음.

---

## 4. center_power (도전자/방어자 공통)

### 함수 정의

`supabase/migrations/20260586_gym_phase234.sql:118-137` (이후 `20260630_medal_buff_by_difficulty.sql:36-61` 에서 메달 버프 추가)

```
center_power =
    Σ showcase_power(rarity, grade) for each showcase_card
  + pokedex_power_bonus(user_id)
  + pokedex_completion_bonus(user_id)
  + users.pet_score
  + Σ gym_medal_buff(difficulty) for each user_gym_medal
```

| 항목 | 내용 |
|------|------|
| 반영 항목 | 쇼케이스 카드 점수, 도감 도전 보너스, 도감 완성도 보너스, 펫 점수, 메달 버프 (난이도별 10K/20K/40K/80K) |
| 제외 항목 | **방어덱 등록 카드** (set_gym_defense_deck 가 main_cards 에서 제거 후 pet_score 재계산 — `20260620_…:485-505`) |
| 체육관 반영 | ✅ 단 **간접 반영만**. 슬롯 보너스 풀 결정 + min_power 도전 가능성 게이트 |
| 직접 비교 | ❌ "도전자 power > 방어자 power 이면 승" 같은 로직 **없음** |

### 도전 게이트

```sql
if v_center_power < coalesce(v_gym.min_power, 0) then
  -- 도전 거부
end if;
-- (20260620_…:343)
```

---

## 5. 전투 계산식 (실제 시뮬레이션)

`supabase/migrations/20260620_gym_resolve_pet_by_type_no_npc_fallback.sql:238-278`

200턴 cap 의 턴제 자동 시뮬레이션.

```
loop until pet_idx > 3 or enemy_idx > 3:
    # 펫 → 적 (펫 항상 선공, spd 미사용)
    type_eff = type_effectiveness(pet.type, enemy.type)
    crit    = 1.5 if random < 0.05 else 1.0
    jitter  = 0.9 + random()*0.2
    dmg     = max(1, round(pet.atk × type_eff × jitter × crit))
    enemy.hp -= dmg
    if enemy.hp <= 0: enemy_idx++

    # 적 → 펫 (펫 생존 시) — 동일 식
    if pet.hp <= 0: pet_idx++

winner = 'won' if pet_alive > 0 and enemy_alive == 0 else 'lost'
```

| 요소 | 사용 여부 |
|------|----------|
| 공격력(atk) | ✅ |
| HP | ✅ |
| 방어력(def) | ❌ DB 컬럼 존재, **계산 미사용** |
| 속도(spd) / 선공 | ❌ DB 컬럼 존재, **계산 미사용**. 펫 항상 선공 고정 (Phase 5 예정) |
| 속성 상성 | ✅ `type_effectiveness(attacker, defender)` |
| 치명타 | ✅ 5% 확률 ×1.5 |
| 회피 | ❌ |
| 랜덤 jitter | ✅ ±10% (0.9~1.1) |
| 슬롯 대결 방식 | 1:1 KO 시 다음 슬롯 진입 (KOF 식) — 3마리 총합 비교 X |
| 시뮬 방식 | 턴제 자동 |
| 승패 결정 | 도전자 1마리 이상 생존 + 적 3마리 모두 KO → won |

---

## 6. 이중 가산 / 무결성 점검

| 케이스 | 결과 |
|--------|------|
| 방어덱 카드 ↔ 방어자 center_power | ❌ 이중 가산 없음. set_gym_defense_deck 가 main_cards 제거 후 pet_score 재계산 |
| 도전자 펫 카드 ↔ 도전자 center_power | ❌ 이중 가산 없음. 펫 카드 base hp/atk 는 카드 자체 스펙(rarity×grade), center_power 는 슬롯 보너스 입력값으로만 사용 |
| 도감/쇼케이스 점수 | 양 측 모두 center_power 에 1회 반영. 펫 카드 base 에는 영향 없음 |
| 메달 | center_power 에는 포함, 카드 base 에는 미반영 |

---

## 7. 5요소 비교 정리 (사용자 요청 형식)

### 1. default 포켓몬
- 데이터 출처: `gym_pokemon` 테이블 (24행 하드코딩 시드)
- 능력치 계산 방식: 고정값 그대로 (hp/atk만 사용, def/spd 미사용)
- 반영되는 보너스: 체육관 속성 일치 시 atk × 1.10
- 반영되지 않는 보너스: 희귀도 / PCL / 메달 / 도감 / 펫 점수 / center_power
- 실제 전투 사용 여부: ✅ 미점령 체육관

### 2. 유저 방어덱
- 데이터 출처: `gym_ownerships.defense_pet_ids` + `defense_pet_types`
- 능력치 계산 방식: `base × grade_mult + min(center_power × ratio_def, base × cap)` — 속성 일치 시 ×1.05
- 반영되는 보너스: 희귀도, PCL, 체육관 속성 일치, MUR 2배, 방어자 center_power
- 반영되지 않는 보너스: 도감/메달 별도 가산 (center_power 안에 부분 포함)
- 유저 전체 전투력 반영 여부: ✅ 슬롯 보너스 입력값
- 실제 전투 사용 여부: ✅ 점령 체육관

### 3. 도전자 펫/카드
- 데이터 출처: 클라 입력 grading_ids[3] + types[3], 검증은 main_card_ids ∪ main_cards_by_type
- 능력치 계산 방식: `base × grade_mult + min(center_power × ratio_atk, base × 1.5)` — 속성 일치 시 ×1.05
- 반영되는 보너스: 희귀도, PCL, 체육관 속성 일치, 도전자 center_power
- 반영되지 않는 보너스: 도감/메달 별도 가산 X
- 도전자 전체 전투력 반영 여부: ✅ 슬롯 보너스 입력값
- 실제 전투 사용 여부: ✅ 항상

### 4. 도전자 전체 전투력 (center_power)
- 데이터 출처: `gym_compute_user_center_power(user_id)`
- 계산 방식: 쇼케이스 + 도감 보너스 + 도감 완성도 + pet_score + 메달 버프
- 반영되는 항목: 위 5개 합산
- 제외되는 항목: 방어덱 카드 (자동 제외)
- 체육관 전투 반영 여부: ✅ 간접 (슬롯 보너스 + 도전 게이트)
- 반영 방식: 펫 슬롯 hp/atk 가산 보너스, min_power 검증

### 5. 상대 유저 전체 전투력
- 데이터 출처: 동일하게 `gym_compute_user_center_power(owner_user_id)`
- 계산 방식: 4번과 완전히 동일
- 반영되는 항목: 동일
- 제외되는 항목: 방어덱 카드 (자동 제외)
- 체육관 전투 반영 여부: ✅ 간접
- 반영 방식: 방어 펫 hp/atk 가산 보너스 (×1.5 + MUR ×2 가중)

---

## 8. 핵심 파일 인덱스

| 역할 | 경로 |
|------|------|
| **전투 산식 (v3)** | `supabase/migrations/20260637_gym_battle_redesign_v3.sql` |
| default 포켓몬 시드 (난이도별 정규화) | `20260637_…` 의 update + `20260585_gym_phase1.sql:180-217` (초기 시드) |
| 전투 메인 RPC | `20260620_gym_resolve_pet_by_type_no_npc_fallback.sql` (시그니처 변경 X) |
| 방어덱 등록 RPC | `20260620_…:379-514` (PCL10 + 펫 등록 + 속성 일치 검증) |
| center_power 함수 | `20260630_medal_buff_by_difficulty.sql:36-61` |
| 메달 난이도 버프 | `20260630_medal_buff_by_difficulty.sql:18-31` |
| 보호 쿨타임 (1h) | `20260628_gym_protection_1h.sql:13-16` |
| 펫 점수 산식 (v3) | `20260636_pet_score_bump_v3.sql` |
| UI | `src/components/GymView.tsx`, `GymChallengeOverlay.tsx`, `GymDefenseDeckModal.tsx` |
| 클라 PCL10 필터 | `src/lib/gym/db.ts:175` (`fetchMyPets` `g.grade === 10`) |
| 속성 검증 진실의 원천 | `src/lib/wild/name-to-type.ts:22-63` (`resolveCardType`) |

---

## 9. v3 변경 이력

### v2 → v3 (2026-04-28)

| 항목 | v2 | v3 |
|------|------|------|
| PCL 등급 게이트 | grade ≥ 1 (grade_mult 가산) | **grade == 10 만 허용** (gate) |
| grade_mult | 10→2.0, 9→1.6, 8→1.3, 7→1.1 | **폐기** (1.0 고정) |
| 희귀도 base hp | C 30 ~ MUR 95 | **C 50 ~ MUR 240** (확대) |
| 희귀도 base atk | C 8 ~ MUR 24 | **C 10 ~ MUR 60** (확대) |
| center_power 보정 | 슬롯별 6/8/10% × 1.5 (def) × 2 (MUR) | **sqrt(cp) 정규화 + 상한 35%/45%** |
| 방어자 보너스 | hp + atk 양쪽 × 1.5 캡 (MUR ×10) | **HP 만 × 1.10** |
| MUR 우대 | 방어 시 비율 × 2, 캡 × 10 | **공격 ATK × 1.05 + center_power 상한 45%** |
| 속성 일치 | atk × 1.05 | **atk × 1.10** |
| 밸런스 수치 관리 | gym_pet_battle_stats 본문 하드코딩 | **공통 helper 함수 7개로 분리** |

### 공통 설정 함수 (v4)

| 함수 | 반환 | 비고 |
|------|------|------|
| `gym_required_grade()` | `10` | |
| `gym_rarity_base_stats(rarity)` | `(hp, atk)` | |
| `gym_power_bonus_rate(cp, rarity)` | `0` | v4 에서 무력화 (kept-for-safety) |
| `gym_defender_hp_multiplier()` | `1.00` | v4 에서 1.10 → 1.00 |
| `gym_attacker_atk_multiplier()` | `1.10` | v4 신규 — 공격자 ATK 일괄 |
| `gym_mur_attack_multiplier()` | `1.05` | |
| `gym_type_match_multiplier()` | `1.10` | |

향후 밸런스 패치는 위 함수 한 곳만 수정하면 모든 산식에 자동 반영.

### v3 → v4 (2026-05-03)

| 항목 | v3 | v4 |
|------|------|------|
| 유저 전투력 → 스탯 보정 | sqrt(cp) 정규화, 일반 35% / MUR 45% 까지 가산 | **제거** (`gym_power_bonus_rate` → 항상 0) |
| 방어자 HP 보너스 | × 1.10 | **× 1.00** (제거) |
| 공격자 ATK 보너스 | 없음 (MUR 만 ×1.05) | **× 1.10** (모든 희귀도) — v4 신규 |
| MUR 공격자 ATK | ×1.05 | ×1.05 (유지) |
| 속성 일치 ATK | ×1.10 | ×1.10 (유지) |
| 도전자 선공 | ✅ | ✅ (유지) |
| center_power 사용처 | 스탯 가산 + min_power 게이트 + 표시 | **min_power 게이트 + 표시 / 랭킹** 만 |

목적: 신규/일반 유저 진입장벽 완화 + 동일 카드 기준 공격자 ~10% 우위. 방어덱이 더 강한 카드면 base 차이로 여전히 방어자 우세 가능 → 방어덱 의미 보존.
