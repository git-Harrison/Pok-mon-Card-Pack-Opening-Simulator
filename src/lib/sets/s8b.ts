import type { SetInfo } from "../types";

// S8b — VMAX 클라이맥스 (VMAX Climax).
// 일본 발매 2021-12-03 / 한국 발매 2022-05 추정.
// 하이클래스 팩으로 메인 ~184 + 시크릿 ~80 = 약 265+ 장 추정 (시크릿 비율 매우 높음).
// V/VMAX → RR, 캐릭터 V/VMAX → AR/SR, HR/UR → UR.
// TODO(recon), TODO(images): s4a 와 동일.
// 하이클래스 팩이라 슬롯 가중치가 일반 팩과 다를 수 있음 (RR/AR/SR 비율 ↑).

export const s8b: SetInfo = {
  code: "s8b",
  name: "VMAX 클라이맥스",
  subtitle: "하이클래스 팩 · VMAX CLIMAX",
  releaseDate: "2022-05-13",
  cardsPerPack: 10, // 하이클래스 팩 = 10 cards/pack
  packsPerBox: 10,  // 하이클래스 박스 = 10 packs
  totalCards: 0, // TODO(recon)
  primaryColor: "#ef4444", // VMAX 폭발/홀로 → 레드
  accentColor: "#fecaca",
  boxImage: "/images/sets/s8b/box.webp",
  packImage: "/images/sets/s8b/box.webp", // TODO(images)
  // TODO(recon): 하이클래스 팩 슬롯 구조로 재조정 (RR/AR/SR 비율 상향).
  slots: [
    { label: "C 1", weights: { C: 100 } },
    { label: "C 2", weights: { C: 100 } },
    { label: "C 3", weights: { C: 100 } },
    { label: "U 1", weights: { U: 100 } },
    { label: "U 2", weights: { U: 100 } },
    { label: "U/R", weights: { U: 60, R: 40 } },
    { label: "R", weights: { R: 100 } },
    { label: "RR/AR", weights: { RR: 60, AR: 40 } },
    { label: "Hit 1", weights: { RR: 40, AR: 30, SR: 15, SAR: 10, UR: 5 } },
    { label: "Hit 2", weights: { RR: 30, AR: 25, SR: 20, SAR: 15, UR: 10 } },
  ],
  cards: [
    // TODO(recon)
  ],
};
