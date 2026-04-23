import type { SetInfo } from "../types";

// Pokellector folder 391 — all URLs verified 200 (Apr 2026).
const pk = (slug: string, num: string, id: string) =>
  `https://den-cards.pokellector.com/391/${slug}.SV5A.${num}.${id}.png`;

export const sv5a: SetInfo = {
  code: "sv5a",
  name: "크림슨 헤이즈",
  subtitle: "확장팩 · CRIMSON HAZE",
  releaseDate: "2024-03-22",
  cardsPerPack: 5,
  packsPerBox: 30,
  totalCards: 96,
  primaryColor: "#dc2626",
  accentColor: "#fecaca",
  boxImage: "/images/sets/sv5a/box.png",
  packImage: "/images/sets/sv5a/pack.png",
  slots: [
    { label: "C 1", weights: { C: 100 } },
    { label: "C 2", weights: { C: 100 } },
    { label: "C/U", weights: { C: 55, U: 45 } },
    { label: "U/R", weights: { U: 65, R: 35 } },
    {
      label: "Hit",
      weights: { R: 30, RR: 30, AR: 20, SR: 12, SAR: 6, UR: 2 },
    },
  ],
  cards: [
    { id: "sv5a-013", setCode: "sv5a", number: "013", name: "마그카르고 ex", rarity: "RR", imageUrl: pk("Magcargo-ex", "13", "52377") },
    { id: "sv5a-033", setCode: "sv5a", number: "033", name: "철가시 ex", rarity: "RR", imageUrl: pk("Iron-Thorns-ex", "33", "52389") },
    { id: "sv5a-040", setCode: "sv5a", number: "040", name: "스크림테일 ex", rarity: "RR", imageUrl: pk("Scream-Tail-ex", "40", "52388") },
    { id: "sv5a-042", setCode: "sv5a", number: "042", name: "히스이 윈디", rarity: "R", imageUrl: pk("Hisuian-Arcanine", "42", "52791") },
    { id: "sv5a-045", setCode: "sv5a", number: "045", name: "개굴닌자 ex", rarity: "RR", imageUrl: pk("Greninja-ex", "45", "52765") },
    { id: "sv5a-052", setCode: "sv5a", number: "052", name: "블러드문 우르스루가 ex", rarity: "RR", imageUrl: pk("Bloodmoon-Ursaluna-ex", "52", "52387") },
    { id: "sv5a-063", setCode: "sv5a", number: "063", name: "페린", rarity: "U", imageUrl: pk("Perrin", "63", "52391") },
    { id: "sv5a-078", setCode: "sv5a", number: "078", name: "이브이", rarity: "AR", imageUrl: pk("Eevee", "78", "52763") },
    { id: "sv5a-091", setCode: "sv5a", number: "091", name: "블러드문 우르스루가 ex", rarity: "SAR", imageUrl: pk("Bloodmoon-Ursaluna-ex", "91", "52400") },
    { id: "sv5a-094", setCode: "sv5a", number: "094", name: "블러드문 우르스루가 ex (골드)", rarity: "UR", imageUrl: pk("Bloodmoon-Ursaluna-ex", "94", "52837") },
    { id: "sv5a-096", setCode: "sv5a", number: "096", name: "빛의 에너지 (골드)", rarity: "UR", imageUrl: pk("Luminous-Energy", "96", "52839") },
  ],
};
