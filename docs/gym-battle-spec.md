# 체육관 대결 시스템 — 전투 스펙 감사 보고서

> 조사 시점: 2026-04-28
> 대상 브랜치: `main`
> 조사 범위: `supabase/migrations/`, `src/components/Gym*.tsx`, `src/lib/wild/`

## 0. 한 줄 요약

현재 시스템은 **hp/atk 단일 축 턴제 시뮬레이션**이다. `def`/`spd` 컬럼은 DB에 존재하지만 실제 전투 계산에는 **사용되지 않는다**. 승패는 `희귀도 × PCL × 체육관 속성 일치 × 양 측 center_power 보정 × 난수(±10%·5% 크리)` 로 결정된다.

---

## 1. default 포켓몬 (체육관 미점령 시 등장)

| 항목 | 내용 |
|------|------|
| 데이터 출처 | `gym_pokemon` 테이블 — `supabase/migrations/20260585_gym_phase1.sql:180-217` |
| 정의 방식 | 8개 체육관 × 3마리 = 24행 하드코딩 시드 |
| 컬럼 | `slot, name, type, dex, hp, atk, def, spd` |
| 체육관별 차이 | 있음 (예: `gym-grass` slot1/2/3 = 이상해씨 hp 100/115/140, atk 30/34/42) |
| 능력치 계산 | 시드 고정값 그대로 로드 (`20260620_…:209-225`) |
| 변환/보정 | 없음 |
| **반영 보너스** | 체육관 속성 == 포켓몬 속성일 때 `atk × 1.10` (단 한 가지) |
| **반영 안 됨** | 희귀도 / PCL / 메달 / 도감 / 펫 점수 / 도전자 center_power |
| 실제 사용 여부 | ✅ 미점령 체육관일 때만. 점령된 체육관은 default 미사용 |

---

## 2. 유저 방어덱 (체육관 점령 후 등록한 3마리)

| 항목 | 내용 |
|------|------|
| 데이터 출처 | `gym_ownerships.defense_pet_ids` (uuid[3]), `defense_pet_types` (text[3]) |
| 등록 함수 | `set_gym_defense_deck()` — `supabase/migrations/20260620_gym_resolve_pet_by_type_no_npc_fallback.sql:379-514` |
| 등록 검증 | (1) 본인 소유 (2) PCL 10 슬랩 (3) 펫 등록 상태(main_card_ids 또는 main_cards_by_type) (4) 체육관 속성 일치 — 4가지 모두 |

### 능력치 산식 — `gym_pet_battle_stats(is_defender=true)`

`supabase/migrations/20260603_gym_defender_buff.sql:22-118`

```
base_hp  = rarity_base_hp  × grade_mult
base_atk = rarity_base_atk × grade_mult

grade_mult: grade 10 → 2.0, 9 → 1.6, 8 → 1.3, 7 → 1.1, else → 1.0

rarity_base (희귀도별 hp/atk):
  C  30/8   U  34/9   R  38/10   RR 42/12   AR 48/13
  SR 55/15  MA 60/16  SAR 70/18  UR 80/20   MUR 95/24

bonus_ratio_def = (slot 10/8/6%) × 1.5         (방어 가중)
                × 2.0 if rarity == MUR         (MUR 우대)
bonus           = round(defender.center_power × bonus_ratio_def)
cap             = base × 1.5 (일반) / × 10 (MUR)
final_hp        = base_hp  + min(hp_bonus,  hp_cap)
final_atk       = base_atk + min(atk_bonus, atk_cap)
if pet_type == gym_type: final_atk × 1.05
```

**슬롯별 보너스 비율**:
- slot 1: 일반 15% / MUR 30%
- slot 2: 일반 12% / MUR 24%
- slot 3: 일반 9%  / MUR 18%

| 항목 | 내용 |
|------|------|
| 반영 보너스 | 희귀도, PCL 등급, 체육관 속성 일치(+5%), MUR 2배 보너스, **방어자 center_power** |
| 반영 안 됨 | 도감 세트효과 / 메달 — center_power 안에 부분 합산 (별도 가산 X). 메달은 center_power 자체에도 미포함 |
| 슬롯 fallback | 없음. 3마리 미달이면 점령 자체가 막힘 |
| 카드 깨짐 처리 | `psa_gradings` 삭제 cascade로 자동 정리. 재감별/전시/펫 변경해도 등록 시점 grading_id 유효시 사용. 패배 시 default 로 복귀 |
| 실제 사용 | ✅ 점령 체육관일 때 항상 |

---

## 3. 도전자 펫/카드 3마리

| 항목 | 내용 |
|------|------|
| 데이터 출처 | 클라 입력 `p_pet_grading_ids[3]`, `p_pet_types[3]` |
| 검증 | `users.main_card_ids ∪ flatten_pet_ids_by_type(main_cards_by_type)` (`20260620_…:106-118`) |
| 속성 제약 | 체육관 속성과 동일한 `pet_type` 만 사용 가능. 다른 속성 1장이라도 섞이면 `wrong_type` 으로 도전 자체 abort |

### 능력치 산식 — `gym_pet_battle_stats(is_defender=false)`

```
base = rarity_base × grade_mult              (방어자와 동일)
bonus_ratio_atk = slot 10/8/6%               (×1.5 가중 없음)
bonus = round(challenger.center_power × bonus_ratio_atk)
cap   = base × 1.5
final_atk × 1.05 if pet_type == gym_type
```

| 항목 | 내용 |
|------|------|
| 반영 보너스 | 희귀도, PCL, 체육관 속성 일치, **도전자 center_power** |
| 반영 안 됨 | 도감/펫 점수/메달 (center_power 안에 부분 포함) |
| 프로필 vs 대결 | 프로필이 `gym_compute_user_center_power` 결과를 표시한다면 동일 (UI 별도 점검 권장) |
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
| default 포켓몬 시드 | `supabase/migrations/20260585_gym_phase1.sql:180-217` |
| 방어 보너스 산식 | `supabase/migrations/20260603_gym_defender_buff.sql:22-118` |
| 전투 메인 RPC | `supabase/migrations/20260620_gym_resolve_pet_by_type_no_npc_fallback.sql` |
| center_power 함수 | `supabase/migrations/20260630_medal_buff_by_difficulty.sql:36-61` |
| 메달 난이도 버프 | `supabase/migrations/20260630_medal_buff_by_difficulty.sql:18-31` |
| 보호 쿨타임 (1h) | `supabase/migrations/20260628_gym_protection_1h.sql:13-16` |
| UI | `src/components/GymView.tsx` |
| 속성 검증 진실의 원천 | `src/lib/wild/name-to-type.ts:22-63` (`resolveCardType`) |
