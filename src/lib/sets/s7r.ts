import type { SetInfo } from "../types";

// S7R — 창공 스트림 (Skyride / 蒼空ストリーム).
// 일본 발매 2021-07-09 / 한국 발매 2021-12 추정.
// 메인 ~75 + 시크릿 ~25 ~= 약 100장 추정.
// 레쿠쟈 VMAX 가 메인. V/VMAX → RR, HR/UR → UR.
// TODO(recon), TODO(images): s4a 와 동일.

export const s7r: SetInfo = {
  code: "s7r",
  name: "창공의 스트림",
  subtitle: "확장팩 · SKYRIDE",
  releaseDate: "2021-12-17",
  cardsPerPack: 5,
  packsPerBox: 30,
  totalCards: 0, // TODO(recon)
  primaryColor: "#0ea5e9", // 창공 → 하늘색
  accentColor: "#bae6fd",
  boxImage: "/images/sets/s7r/box.webp",
  packImage: "/images/sets/s7r/box.webp", // TODO(images)
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
