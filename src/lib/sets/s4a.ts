import type { SetInfo } from "../types";

// S4a — 샤이니스타 V (Shiny Star V).
// 일본 발매 2020-11-20 / 한국 발매 2020-12 추정 (recon 으로 확정 필요).
// 메인 ~190 + 시크릿 (HR/UR) 포함 ~200+ 장 추정.
// V/VMAX → RR, HR/UR → UR 매핑 (rarity enum 재사용).
// TODO(recon): 카드 리스트는 다음 턴 Explore 에이전트가 채움.
//   소스 후보: pokemoncard.co.kr, Pokellector, PokeGuardian.
// TODO(images): pack.webp 가 없어 임시로 box.webp 재사용 — 추후 교체.

export const s4a: SetInfo = {
  code: "s4a",
  name: "샤이니스타 V",
  subtitle: "확장팩 · SHINY STAR V",
  releaseDate: "2020-12-04",
  cardsPerPack: 5,
  packsPerBox: 30,
  totalCards: 0, // TODO(recon): 실제 카드 수로 갱신
  primaryColor: "#fbbf24", // 골드/실버 색조
  accentColor: "#fde68a",
  boxImage: "/images/sets/s4a/box.webp",
  packImage: "/images/sets/s4a/box.webp", // TODO(images): pack.webp 별도 마련 시 교체
  slots: [
    { label: "C 1", weights: { C: 100 } },
    { label: "C 2", weights: { C: 100 } },
    { label: "C/U", weights: { C: 55, U: 45 } },
    { label: "U/R", weights: { U: 65, R: 35 } },
    // S 시대는 MUR 없음. UR(=HR) 까지가 최상단.
    { label: "Hit", weights: { R: 30, RR: 30, AR: 10, SR: 7, SAR: 5, UR: 0.5 } },
  ],
  cards: [
    // TODO(recon): 다음 턴 Explore 에이전트가 채움.
  ],
};
