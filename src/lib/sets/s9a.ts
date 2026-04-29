import type { SetInfo } from "../types";

// S9a — 양천의 볼트 태클 (Battle Region 후 확장 / 雷天のボルテックル).
// 일본 발매 2022-04-01 (배틀 리전 s9a) / 한국 발매 2022-08 추정.
// 메인 ~68 + 시크릿 ~25 ~= 약 95장 추정.
// V/VMAX → RR, HR/UR → UR.
// TODO(recon): 정확한 일본 코드/한국명 매핑 — "양천의 볼트 태클" 의 일본 원명/세트 코드를 recon
//   에이전트가 1차로 검증해야 함 (s9a Battle Region 인지, 다른 변형인지 확정 필요).
// TODO(images): s4a 와 동일.

export const s9a: SetInfo = {
  code: "s9a",
  name: "양천의 볼트 태클",
  subtitle: "확장팩 · BATTLE REGION VARIANT",
  releaseDate: "2022-08-12",
  cardsPerPack: 5,
  packsPerBox: 30,
  totalCards: 0, // TODO(recon)
  primaryColor: "#eab308", // 전기/번개 → 옐로우
  accentColor: "#fde68a",
  boxImage: "/images/sets/s9a/box.webp",
  packImage: "/images/sets/s9a/box.webp", // TODO(images)
  slots: [
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
