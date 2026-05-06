import type { WildType } from "./types";

/**
 * MUR / UR 카드 dual-type 매핑 (클라 미러).
 *
 * 서버 단일 소스는 card_types.wild_type_2 컬럼 (마이그레이션 20260703 ~
 * 20260704). 본 클라 매핑은 카드 ID 만 알고 있는 UI 가 즉시 보조 속성을
 * 표시할 수 있게 두는 정적 룩업.
 *
 * 정책:
 *   - SAR 이하 단일 속성 — 매핑 X (단일 속성 유지).
 *   - UR/MUR 중 Pokémon 카드 — 1차 + 2차 속성.
 *   - UR 트레이너/에너지/아이템 — 매핑 X (기존 wild_type=null 유지,
 *     펫/먹이/체육관 어디에도 사용 불가 호환성 유지).
 *
 * 표 변경 시 서버 마이그레이션 (UPDATE card_types) 도 함께 업데이트.
 */
export const CARD_SECONDARY_TYPE: Record<string, WildType> = {
  // ── MUR 8장 ── (1차/2차 모두 사용자 직접 지정)
  "m1l-092":   "격투",   // 메가루카리오     (1차 강철)
  "m1s-092":   "페어리", // 메가가디안       (1차 노말)
  "m2-116":    "비행",   // 메가 리자몽 X    (1차 드래곤)
  "m2a-250":   "드래곤", // 메가 망나뇽      (1차 비행)
  "m3-117":    "벌레",   // 메가지가르데     (1차 땅)
  "m4-120":    "악",     // 메가 개굴닌자    (1차 독)
  "sv11b-174": "고스트", // 제크로무 ex      (1차 악)
  "sv11w-174": "페어리", // 레시라무         (1차 드래곤)

  // ── UR Pokémon 41장 ── (1차 유지, 2차 추가)
  // s4a
  "s4a-327": "드래곤",   // 무한다이노 V       (1차 독)
  "s4a-328": "드래곤",   // 무한다이노 VMAX    (1차 독)
  "s4a-329": "강철",     // 자시안 V           (1차 페어리)
  "s4a-330": "강철",     // 자마젠타 V         (1차 격투)
  // s6a
  "s6a-088": "페어리",   // 리피아 VMAX        (1차 풀)
  "s6a-089": "페어리",
  "s6a-090": "페어리",   // 글레이시아 VMAX    (1차 얼음)
  "s6a-091": "페어리",
  "s6a-092": "노말",     // 님피아 VMAX        (1차 페어리)
  "s6a-093": "노말",
  "s6a-094": "페어리",   // 블래키 VMAX        (1차 악)
  "s6a-095": "페어리",
  "s6a-098": "악",       // 인텔리레온         (1차 물)
  // s7r
  "s7r-080": "고스트",   // 데기라스 VMAX      (1차 바위)
  "s7r-081": "비행",     // 갸라도스 VMAX      (1차 물)
  "s7r-082": "비행",     // 레쿠쟈 VMAX        (1차 드래곤)
  "s7r-083": "비행",
  "s7r-087": "고스트",   // 눈여아             (1차 얼음)
  // s8ap
  "s8ap-030": "페어리",  // 뮤                 (1차 에스퍼)
  // s8b
  "s8b-278": "페어리",   // 백마 버드렉스 VMAX (1차 노말)
  "s8b-279": "노말",     // 피카츄 VMAX        (1차 전기)
  "s8b-280": "페어리",   // 뮤 VMAX            (1차 에스퍼)
  "s8b-281": "고스트",   // 흑마 버드렉스 VMAX (1차 노말)
  "s8b-282": "악",       // 일격의 우라오스 VMAX (1차 노말)
  "s8b-283": "격투",     // 연격의 우라오스 VMAX (1차 노말)
  "s8b-284": "비행",     // 레쿠쟈 VMAX        (1차 드래곤)
  "s8b-285": "드래곤",   // 두랄루돈 VMAX      (1차 강철)
  // s9a
  "s9a-112": "비행",     // 이올브 VMAX        (1차 벌레)
  "s9a-113": "격투",     // 가라르 불비달마 VMAX (1차 노말)
  "s9a-114": "노말",     // 피카츄 VMAX        (1차 전기)
  "s9a-115": "고스트",   // 킬가르도 VMAX      (1차 강철)
  // sv2a
  "sv2a-208": "페어리",  // 뮤 ex              (1차 에스퍼)
  // sv5a
  "sv5a-094": "악",      // 블러드문 우르스루가 ex (1차 땅)
  // sv8
  "sv8-136":  "노말",    // 피카츄 ex (골드)   (1차 전기)
  // sv8a
  "sv8a-233": "강철",    // 무쇠잎새 ex        (1차 풀)
  "sv8a-234": "페어리",  // 초록가면 오거폰 ex (1차 풀)
  "sv8a-235": "드래곤",  // 굽이치는물결 ex    (1차 물)
  "sv8a-236": "노말",    // 피카츄 ex (골드)   (1차 전기)
  "sv8a-237": "강철",    // 테라파고스 ex      (1차 노말)
  // sv10
  "sv10-130": "악",      // 로켓단의 뮤츠ex    (1차 에스퍼)
  "sv10-131": "비행",    // 로켓단의 크로뱃ex  (1차 독)
};

/** 카드 ID → 보조 속성. 매핑 없으면 null (단일 속성). */
export function getCardSecondaryType(
  cardId: string | null | undefined
): WildType | null {
  if (!cardId) return null;
  return CARD_SECONDARY_TYPE[cardId] ?? null;
}

/**
 * 메가 8장만 1차 속성도 재지정됨 — 클라 카탈로그 (resolveCardType / name-
 * to-type) 기반 1차와 서버 새 1차가 다를 수 있어 클라 측에서도 override.
 * UR 은 1차 유지이므로 매핑 없음.
 */
export const CARD_PRIMARY_TYPE_OVERRIDE: Record<string, WildType> = {
  "m1l-092":   "강철",
  "m1s-092":   "노말",
  "m2-116":    "드래곤",
  "m2a-250":   "비행",
  "m3-117":    "땅",
  "m4-120":    "독",
  "sv11b-174": "악",
  "sv11w-174": "드래곤",
};

/** 카드 ID → 1차 속성 override. 없으면 null (기존 resolveCardType 사용). */
export function getCardPrimaryOverride(
  cardId: string | null | undefined
): WildType | null {
  if (!cardId) return null;
  return CARD_PRIMARY_TYPE_OVERRIDE[cardId] ?? null;
}
