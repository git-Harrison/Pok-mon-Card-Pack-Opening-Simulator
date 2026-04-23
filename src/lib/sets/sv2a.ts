import type { SetInfo } from "../types";

// Pokellector folder 371 — all URLs verified 200 (Apr 2026).
const pk = (slug: string, num: string, id: string) =>
  `https://den-cards.pokellector.com/371/${slug}.SV2A.${num}.${id}.png`;

export const sv2a: SetInfo = {
  code: "sv2a",
  name: "포켓몬 카드 151",
  subtitle: "확장팩 · POKEMON CARD 151",
  releaseDate: "2023-06-16",
  cardsPerPack: 7,
  packsPerBox: 20,
  totalCards: 210,
  primaryColor: "#3b82f6",
  accentColor: "#bfdbfe",
  boxImage: "/images/sets/sv2a/box.webp",
  packImage: "/images/sets/sv2a/pack.png",
  slots: [
    { label: "C 1", weights: { C: 100 } },
    { label: "C 2", weights: { C: 100 } },
    { label: "C 3", weights: { C: 70, U: 30 } },
    { label: "U", weights: { C: 30, U: 70 } },
    { label: "U/R", weights: { U: 50, R: 50 } },
    { label: "R/RR", weights: { R: 40, RR: 60 } },
    {
      label: "Hit",
      weights: { RR: 40, AR: 25, SR: 20, SAR: 10, UR: 5 },
    },
  ],
  cards: [
    { id: "sv2a-001", setCode: "sv2a", number: "001", name: "이상해씨", rarity: "C", imageUrl: pk("Bulbasaur", "1", "47517") },
    { id: "sv2a-025", setCode: "sv2a", number: "025", name: "피카츄", rarity: "C", imageUrl: pk("Pikachu", "25", "47520") },
    { id: "sv2a-094", setCode: "sv2a", number: "094", name: "팬텀", rarity: "R", imageUrl: pk("Gengar", "94", "48306") },
    { id: "sv2a-161", setCode: "sv2a", number: "161", name: "에리카의 초대", rarity: "U", imageUrl: pk("Erikas-Invitation", "161", "47706") },
    { id: "sv2a-003", setCode: "sv2a", number: "003", name: "이상해꽃 ex", rarity: "RR", imageUrl: pk("Venusaur-ex", "3", "47701") },
    { id: "sv2a-006", setCode: "sv2a", number: "006", name: "리자몽 ex", rarity: "RR", imageUrl: pk("Charizard-ex", "6", "47703") },
    { id: "sv2a-038", setCode: "sv2a", number: "038", name: "나인테일 ex", rarity: "RR", imageUrl: pk("Ninetales-ex", "38", "48259") },
    { id: "sv2a-065", setCode: "sv2a", number: "065", name: "후딘 ex", rarity: "RR", imageUrl: pk("Alakazam-ex", "65", "47511") },
    { id: "sv2a-186", setCode: "sv2a", number: "186", name: "거북왕 ex", rarity: "SR", imageUrl: pk("Blastoise-ex", "186", "48582") },
    { id: "sv2a-187", setCode: "sv2a", number: "187", name: "이상해꽃 ex", rarity: "SR", imageUrl: pk("Venusaur-ex", "187", "48580") },
    { id: "sv2a-188", setCode: "sv2a", number: "188", name: "리자몽 ex", rarity: "SR", imageUrl: pk("Charizard-ex", "188", "48581") },
    { id: "sv2a-190", setCode: "sv2a", number: "190", name: "후딘 ex", rarity: "SR", imageUrl: pk("Alakazam-ex", "190", "48586") },
    { id: "sv2a-195", setCode: "sv2a", number: "195", name: "뮤 ex", rarity: "SR", imageUrl: pk("Mew-ex", "195", "48591") },
    { id: "sv2a-200", setCode: "sv2a", number: "200", name: "이상해꽃 ex", rarity: "SAR", imageUrl: pk("Venusaur-ex", "200", "48350") },
    { id: "sv2a-201", setCode: "sv2a", number: "201", name: "리자몽 ex", rarity: "SAR", imageUrl: pk("Charizard-ex", "201", "48351") },
    { id: "sv2a-202", setCode: "sv2a", number: "202", name: "거북왕 ex", rarity: "SAR", imageUrl: pk("Blastoise-ex", "202", "48352") },
    { id: "sv2a-205", setCode: "sv2a", number: "205", name: "뮤 ex", rarity: "SAR", imageUrl: pk("Mew-ex", "205", "48354") },
    { id: "sv2a-206", setCode: "sv2a", number: "206", name: "에리카의 초대", rarity: "SAR", imageUrl: pk("Erikas-Invitation", "206", "48594") },
    { id: "sv2a-208", setCode: "sv2a", number: "208", name: "뮤 ex (골드)", rarity: "UR", imageUrl: pk("Mew-ex", "208", "48596") },
  ],
};
