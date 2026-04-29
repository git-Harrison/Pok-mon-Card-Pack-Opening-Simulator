import type { SetInfo } from "../types";

// S8a-P — 25주년 기념 컬렉션 박스 (Celebrations 한국 정발 박스 형태).
// 일본 25th Anniversary Collection 2021-10-22 발매. 한국 정발 2022-02 추정.
// 25주년 기념 카드 + 클래식 카드 리프린트 ~25장 + 스페셜 + 프로모.
// V/VMAX → RR, 골드/HR → UR 매핑.
// TODO(recon), TODO(images): s4a 와 동일.
// 주의: 컬렉션 박스 특성상 일반 부스터 팩과 슬롯 구조가 다를 수 있음 — recon 후 slots 재조정 필요할 수 있음.

export const s8ap: SetInfo = {
  code: "s8ap",
  name: "25주년 기념 컬렉션 박스",
  subtitle: "기념 박스 · 25TH ANNIVERSARY COLLECTION",
  releaseDate: "2022-02-25",
  cardsPerPack: 5,
  packsPerBox: 30,
  totalCards: 0, // TODO(recon)
  primaryColor: "#facc15", // 25주년 골드
  accentColor: "#fef08a",
  boxImage: "/images/sets/s8ap/box.webp",
  packImage: "/images/sets/s8ap/box.webp", // TODO(images)
  slots: [
    // TODO(recon): 25주년 박스는 고정 슬롯 구성일 수 있어 재조정 필요.
    { label: "C 1", weights: { C: 100 } },
    { label: "C 2", weights: { C: 100 } },
    { label: "C/U", weights: { C: 55, U: 45 } },
    { label: "U/R", weights: { U: 65, R: 35 } },
    { label: "Hit", weights: { R: 30, RR: 30, AR: 10, SR: 7, SAR: 5, UR: 0.5 } },
  ],
  cards: [
    // TODO(recon)
  ],
};
