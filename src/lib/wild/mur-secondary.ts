import type { WildType } from "./types";

/**
 * MUR 카드 보조 속성 매핑.
 *
 * 카드 1장 = 1속성 구조를 유지하되 MUR 카드만 예외적으로 두 번째 속성을
 * 보유. 서버 단일 소스는 card_types.wild_type_2 컬럼 (마이그레이션
 * 20260703_mur_dual_type.sql). 본 클라 매핑은 카탈로그/리스트/덱 등 카드
 * 이름·코드만 알고 있는 UI 가 즉시 보조 속성을 표시할 수 있게 두는 미러.
 *
 * 매핑 출처: Pokémon canon (메가 진화 / 레전더리 dual-typing).
 *
 * 표 변경 시 서버 마이그레이션 (UPDATE card_types) 도 함께 업데이트.
 */
export const MUR_SECONDARY_TYPE: Record<string, WildType> = {
  "m1l-092":   "강철",   // 메가루카리오
  "m1s-092":   "페어리", // 메가가디안
  "m2-116":    "드래곤", // 메가 리자몽 X (골드)
  "m2a-250":   "드래곤", // 메가 망나뇽 (골드)
  "m3-117":    "드래곤", // 메가지가르데
  "m4-120":    "악",     // 메가 개굴닌자
  "sv11b-174": "전기",   // 제크로무
  "sv11w-174": "불꽃",   // 레시라무
};

/** 카드 ID → 보조 속성. 매핑 없으면 null (단일 속성). */
export function getCardSecondaryType(cardId: string | null | undefined): WildType | null {
  if (!cardId) return null;
  return MUR_SECONDARY_TYPE[cardId] ?? null;
}
