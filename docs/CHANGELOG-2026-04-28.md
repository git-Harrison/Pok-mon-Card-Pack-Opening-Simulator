# 2026-04-28 ~ 04-29 작업 요약

다른 PC 에서 `git pull` 받아 이어 작업할 때 핵심만 빠르게 잡기 위한 요약.

## 1. 체육관 시스템 v3 (전면 재설계)

| 항목 | 내용 |
|------|------|
| **PCL 10 강제** | 등록·도전·전투 계산 모든 레이어. PCL 9 이하 슬랩은 체육관에 출입 불가. server-side 검증 (`gym_pet_battle_stats` row 미반환) + 클라 필터 (`fetchMyPets` `g.grade===10`) 이중 가드. |
| **전투 산식** | `gym_pet_battle_stats` — 희귀도 base × (1 + sqrt(center_power) 정규화 보너스). 일반 35% 캡 / MUR 45% 캡. 방어자 HP × 1.10, 속성 일치 ATK × 1.10, MUR 공격 ATK × 1.05. PCL grade_mult 폐기. |
| **희귀도 base 확대** | C 50/10 ~ MUR 240/60 (이전 C 30/8 ~ MUR 95/24). |
| **min_power 곡선 완화** | 풀 30k → 드래곤 1.9M (Ch1~Ch3 18 체육관 per-gym 세분화). Ch4 미변경. |
| **메달 per-gym 차등** | `gym_medal_buff(gym_id)`. 풀 +10k → 드래곤 +300k. 메달은 영구 업적, 중복 지급 X. |
| **default NPC 정규화** | 18 체육관 각각 챕터/티어별 hp/atk 재조정. AR/SR×3 ~ MUR×3 가 자연스럽게 매칭. |
| **보호 시간** | 점령/연장 모두 1시간 (`gym_protection_interval`). |
| **NPC 대화 모달** | `NpcDialogModal` 신설 — 인사/도발/도전수락/승리/패배 5 tone (typewriter + sprite mood + 데코 FX). |
| **공통 helpers (단일 진실의 원천)** | `gym_required_grade`, `gym_rarity_base_stats`, `gym_power_bonus_rate`, `gym_defender_hp_multiplier`, `gym_mur_attack_multiplier`, `gym_type_match_multiplier`, `gym_medal_buff`. 향후 패치는 함수 한 곳 수정. |

자세한 건 `docs/gym-battle-spec.md`.

## 2. 펫 점수 v3 (절대값 체계)

- 산식: `pet_rarity_score(rarity)` × PCL10 슬랩 수 합산.
- 등급별 정액 (PCL10 슬롯당): MUR 40,000 · UR 20,000 · SAR 12,000 · SR 7,000 · MA 5,000 · AR 4,000 · RR 2,000 · R 1,000 · U/C 500.
- PCL 9 이하 = 0 점.
- 신구조 `main_cards_by_type` ∪ legacy `main_card_ids` UNION (중복 가산 없음).
- 방어덱 카드 자동 제외, 트레이너/에너지/굿즈 카드는 `set_pet_for_type` 에서 거부.

자세한 건 `docs/pet-score-spec.md`.

## 3. 카드↔속성 매핑 DB 영구화

- 신규 테이블 `card_types(card_id PK, wild_type, rarity)` — 1,600장 일괄 seed (포켓몬 1,293 + 트레이너/아이템 등 null 307).
- 카탈로그 변경 시 재생성:
  ```bash
  npx tsx scripts/dump-card-types.mts > supabase/migrations/<날짜>_card_types_reseed.sql
  ```
- 모든 SQL 자동화에서 `join card_types ct on ct.card_id = g.card_id` 로 속성 조회 가능.

## 4. UI 정리

| 변경 | 위치 |
|------|------|
| **PclSlab 헤더 미니멀화** | `PclSlab.tsx` — 별점/GEM MINT 라벨/원형 grade seal 제거. PCL + 등급 숫자만. |
| **PclSlab 수량 뱃지** | `quantity` prop — 우상단 ×N 뱃지 (count > 1 일 때만). |
| **중복 카드 그룹화** | `groupGradings()` helper (`src/lib/cards/group-gradings.ts`). WalletView, CenterView, ProfileView SlabPicker 적용. 같은 카드+같은 PCL 등급은 한 칸 + ×N. |
| **랭킹 펫 탭 폰트 통일** | text-xl/2xl + zinc-500 라벨로 다른 탭과 동일. |
| **랭킹 활동 로그 삭제** | 펫 탭 클릭 시 등록 카드 썸네일 + ActivityFeed 영역 제거. 등급 분해 칩만 + MUR→C 정렬. |
| **체육관 도움말 단순화** | 우하단 → 좌상단 inline pill. Collapsible 접기/펼치기. 내부 용어 사용자 친화 표현으로 재작성. |
| **GymView 챕터 헤더** | "기본 8 속성 체육관" 라인 삭제, 속성 리스트만 굵게. |
| **펫 등록 속성 중복 제거** | ProfileView SlabPicker 카드 이름 아래 속성 텍스트 라인 삭제 (PclSlab 안에 이미 뱃지 있음). |
| **모바일 하단 네비** | 홈 / 등급 / 도감 / 체육관 / 야생 / 프로필. 더보기: 랭킹 / 센터 / 지갑 / 선물함. |

## 5. 레거시 정리

- `MAX_PET_SCORE`, `MAX_MAIN_CARDS` (deprecated) 삭제.
- AdminView Rules of Hooks 위반 (early return between hooks) 픽스.
- `set_pet_for_type` 에 카드 type 검증 추가 — 트레이너 카드 (예: Switch) 펫 슬롯 등록 차단 + 슬롯 type 과 카드 wild_type 일치 강제.
- 모든 유저 `main_card_ids` 에서 트레이너/null-type 카드 일괄 청소.
- `gym_daily_rank_pts` 모든 유저 0 리셋 (체육관 wipe 후속).

## 6. hun 어드민 시드

- 메달 4종: 잎새 / 물결 / 바위 / 얼음 (영구 업적).
- 펫 슬롯 18 속성 자동 채움 — MUR > UR > SAR > SR 우선순위, 인벤 부족 시 카탈로그(`card_types`)에서 새 PCL10 슬랩 직접 시드.

## 7. CI / 빌드 함정

- `CREATE OR REPLACE FUNCTION` 파라미터 이름 변경 → 거부. 이름은 보존하고 본문만 교체.
- `TRUNCATE` 외래키 참조 시 RESTRICT 위반. 단일 `TRUNCATE A, B, C CASCADE` 사용.
- ESLint 의 `react-hooks/set-state-in-effect`, `react-hooks/purity` 위반은 다수 잔존 (61건). 빌드는 `continue-on-error` 라 통과하지만 별도 phase 로 정리 권장.

## 8. 핵심 마이그레이션 인덱스 (`supabase/migrations/`)

| 파일 | 내용 |
|------|------|
| 20260636 | 펫 점수 v3 (MUR 40k 절대값) |
| 20260637 | 체육관 전투 스펙 v3 (PCL10 + sqrt 정규화) |
| 20260638 | min_power 완화 + 메달 per-gym |
| 20260640 | default NPC 챕터/티어별 정밀 조정 |
| 20260641 | 체육관 사용자 상태 wipe (cascade) |
| 20260642 | card_types 1,600장 seed |
| 20260643 | hun 펫 자동 채우기 (any rarity) |
| 20260644 | 펫 type 검증 + main_card_ids legacy 청소 |
| 20260645 | hun 펫 MUR/UR/SAR 재할당 + gym_daily_rank_pts 리셋 |
| 20260647 | hun 빈 슬롯에 UR/SAR 카탈로그 직접 시드 |
| 20260648 | hun 메달 4종 + SR 폴백 펫 채움 |

## 9. 다음 작업 후보

- React hooks 룰 정리 (61건 errors — set-state-in-effect 패턴 재설계).
- 중복 카드 그룹화 확장 (GymDefenseDeckModal / GymChallengeOverlay).
- 도감 페이지 도움말 최신화.
