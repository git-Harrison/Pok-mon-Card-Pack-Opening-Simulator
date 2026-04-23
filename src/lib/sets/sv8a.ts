import type { SetInfo } from "../types";

// Pokellector folder 406 — all URLs verified 200 (Apr 2026).
const pk = (slug: string, num: string, id: string) =>
  `https://den-cards.pokellector.com/406/${slug}.SV8A.${num}.${id}.png`;

export const sv8a: SetInfo = {
  code: "sv8a",
  name: "테라스탈 페스티벌 ex",
  subtitle: "하이클래스팩 · TERASTAL FESTIVAL ex",
  releaseDate: "2024-12-06",
  cardsPerPack: 10,
  packsPerBox: 10,
  totalCards: 237,
  primaryColor: "#a855f7",
  accentColor: "#e9d5ff",
  boxImage: "/images/sets/sv8a/box.png",
  packImage: "/images/sets/sv8a/pack.png",
  slots: [
    { label: "C/U 1", weights: { C: 70, U: 30 } },
    { label: "C/U 2", weights: { C: 70, U: 30 } },
    { label: "C/U 3", weights: { C: 60, U: 40 } },
    { label: "C/U 4", weights: { C: 60, U: 40 } },
    { label: "U/R", weights: { U: 55, R: 45 } },
    { label: "R/RR", weights: { R: 50, RR: 50 } },
    { label: "RR/AR", weights: { RR: 55, AR: 45 } },
    { label: "AR/SR", weights: { AR: 55, SR: 45 } },
    { label: "SR/SAR", weights: { SR: 70, SAR: 28, UR: 2 } },
    {
      label: "Hit",
      weights: { RR: 30, AR: 25, SR: 22, SAR: 18, UR: 5 },
    },
  ],
  cards: [
    { id: "sv8a-001", setCode: "sv8a", number: "001", name: "꼬몽울", rarity: "C", imageUrl: pk("Budew", "1", "54936") },
    { id: "sv8a-122", setCode: "sv8a", number: "122", name: "코라이돈", rarity: "C", imageUrl: pk("Koraidon", "122", "54951") },
    { id: "sv8a-123", setCode: "sv8a", number: "123", name: "미라이돈", rarity: "C", imageUrl: pk("Miraidon", "123", "54952") },
    { id: "sv8a-125", setCode: "sv8a", number: "125", name: "이브이", rarity: "C", imageUrl: pk("Eevee", "125", "54663") },
    { id: "sv8a-145", setCode: "sv8a", number: "145", name: "테라 오브", rarity: "C", imageUrl: pk("Tera-Orb", "145", "54650") },
    { id: "sv8a-180", setCode: "sv8a", number: "180", name: "축제의 광장", rarity: "C", imageUrl: pk("Festival-Grounds", "180", "54947") },
    { id: "sv8a-026", setCode: "sv8a", number: "026", name: "화염구슬 가면 오거폰 ex", rarity: "RR", imageUrl: pk("Hearthflame-Mask-Ogerpon-ex", "26", "55167") },
    { id: "sv8a-120", setCode: "sv8a", number: "120", name: "드래펄트 ex", rarity: "RR", imageUrl: pk("Dragapult-ex", "120", "55223") },
    { id: "sv8a-124", setCode: "sv8a", number: "124", name: "라부르나이트 ex", rarity: "RR", imageUrl: pk("Raging-Bolt-ex", "124", "55224") },
    { id: "sv8a-136", setCode: "sv8a", number: "136", name: "테라파고스 ex", rarity: "RR", imageUrl: pk("Terapagos-ex", "136", "54644") },
    { id: "sv8a-217", setCode: "sv8a", number: "217", name: "블래키 ex", rarity: "SAR", imageUrl: pk("Umbreon-ex", "217", "55287") },
    { id: "sv8a-223", setCode: "sv8a", number: "223", name: "이브이 ex", rarity: "SAR", imageUrl: pk("Eevee-ex", "223", "55291") },
    { id: "sv8a-231", setCode: "sv8a", number: "231", name: "레이시", rarity: "SAR", imageUrl: pk("Lacey", "231", "55297") },
    { id: "sv8a-236", setCode: "sv8a", number: "236", name: "피카츄 ex (골드)", rarity: "UR", imageUrl: pk("Pikachu-ex", "236", "55302") },
    { id: "sv8a-237", setCode: "sv8a", number: "237", name: "테라파고스 ex (골드)", rarity: "UR", imageUrl: pk("Terapagos-ex", "237", "55303") },
  ],
};
