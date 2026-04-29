import type { SetInfo } from "../types";

// S6a — 이브이 히어로즈 (Eevee Heroes).
// 일본 발매 2021-05-28 / 한국 발매 2021-08~09 추정.
// 메인 ~69 + 시크릿 ~22 = 약 91장 추정 (이브이 진화체 8 VMAX).
// V/VMAX → RR, HR/UR → UR 매핑.
// TODO(recon), TODO(images): s4a 와 동일.

export const s6a: SetInfo = {
  code: "s6a",
  name: "이브이 히어로즈",
  subtitle: "확장팩 · EEVEE HEROES",
  releaseDate: "2021-08-05",
  cardsPerPack: 5,
  packsPerBox: 30,
  totalCards: 0, // TODO(recon)
  primaryColor: "#a78bfa", // 이브이 진화체 무지개 → 라벤더
  accentColor: "#ddd6fe",
  boxImage: "/images/sets/s6a/box.webp",
  packImage: "/images/sets/s6a/box.webp", // TODO(images)
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
