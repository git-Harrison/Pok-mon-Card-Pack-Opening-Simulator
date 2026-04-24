import type { SetInfo } from "../types";

// Verified Pokellector folder 427 for M2a.
// Korean CDN (`cards.image.pokemonkorea.co.kr`) has broken slugs for this
// set as of Apr 2026, so primary URLs are Pokellector with the Korean CDN
// left commented out as a future swap point.
const img = (n: string) =>
  `https://cards.image.pokemonkorea.co.kr/data/wmimages/MEGA/M2a/M2a_${n}.png`;
const pk = (slug: string, num: string, id: string) =>
  `https://den-cards.pokellector.com/427/${slug}.M2A.${num}.${id}.png`;

export const m2a: SetInfo = {
  code: "m2a",
  name: "MEGA 드림 ex",
  subtitle: "하이클래스팩 · MEGA DREAM ex",
  releaseDate: "2026-01-23",
  cardsPerPack: 10,
  packsPerBox: 10,
  totalCards: 250,
  primaryColor: "#f43f5e",
  accentColor: "#fde68a",
  boxImage: "/images/sets/m2a/box.png",
  packImage: "/images/sets/m2a/pack.png",
  // High-class pack: 10 cards, richer hit distribution
  slots: [
    { label: "C/U 1", weights: { C: 70, U: 30 } },
    { label: "C/U 2", weights: { C: 70, U: 30 } },
    { label: "C/U 3", weights: { C: 60, U: 40 } },
    { label: "C/U 4", weights: { C: 60, U: 40 } },
    { label: "U/R", weights: { U: 55, R: 45 } },
    { label: "R/RR", weights: { R: 55, RR: 45 } },
    { label: "RR/AR", weights: { RR: 55, AR: 45 } },
    { label: "AR/SR", weights: { AR: 55, SR: 35, MA: 10 } },
    {
      label: "SR+/MA",
      weights: { SR: 50, MA: 32, SAR: 13, MUR: 5 },
    },
    {
      label: "Hit",
      weights: { RR: 25, AR: 22, SR: 20, MA: 13, SAR: 15, MUR: 5 },
    },
  ],
  cards: [
    { id: "m2a-001", setCode: "m2a", number: "001", name: "리자몽", rarity: "C", imageUrl: img("001") },
    { id: "m2a-005", setCode: "m2a", number: "005", name: "팬텀", rarity: "C", imageUrl: img("005") },
    { id: "m2a-012", setCode: "m2a", number: "012", name: "루카리오", rarity: "U", imageUrl: img("012") },
    { id: "m2a-018", setCode: "m2a", number: "018", name: "가디안", rarity: "U", imageUrl: img("018") },
    { id: "m2a-024", setCode: "m2a", number: "024", name: "디안시", rarity: "R", imageUrl: img("024") },
    { id: "m2a-038", setCode: "m2a", number: "038", name: "메타그로스", rarity: "R", imageUrl: img("038") },
    { id: "m2a-050", setCode: "m2a", number: "050", name: "망나뇽", rarity: "R", imageUrl: img("050") },
    { id: "m2a-075", setCode: "m2a", number: "075", name: "피카츄 ex", rarity: "RR", imageUrl: img("075") },
    { id: "m2a-090", setCode: "m2a", number: "090", name: "달지의 한카리아스 ex", rarity: "RR", imageUrl: pk("Cynthias-Garchomp-ex", "90", "59985") },
    { id: "m2a-095", setCode: "m2a", number: "095", name: "메가 가디안 ex", rarity: "RR", imageUrl: img("095") },
    { id: "m2a-110", setCode: "m2a", number: "110", name: "메가 루카리오 ex", rarity: "RR", imageUrl: img("110") },
    { id: "m2a-125", setCode: "m2a", number: "125", name: "메가 팬텀 ex", rarity: "RR", imageUrl: img("125") },
    { id: "m2a-140", setCode: "m2a", number: "140", name: "메가 망나뇽 ex", rarity: "RR", imageUrl: img("140") },
    { id: "m2a-160", setCode: "m2a", number: "160", name: "로켓단의 뮤츠 ex", rarity: "RR", imageUrl: img("160") },
    { id: "m2a-175", setCode: "m2a", number: "175", name: "N의 조로아크 ex", rarity: "RR", imageUrl: img("175") },
    { id: "m2a-190", setCode: "m2a", number: "190", name: "달지의 메타그로스 ex", rarity: "RR", imageUrl: img("190") },
    { id: "m2a-203", setCode: "m2a", number: "203", name: "토게키스", rarity: "AR", imageUrl: img("203") },
    { id: "m2a-205", setCode: "m2a", number: "205", name: "로켓단의 뮤링", rarity: "AR", imageUrl: img("205") },
    { id: "m2a-208", setCode: "m2a", number: "208", name: "파이리", rarity: "AR", imageUrl: img("208") },
    { id: "m2a-210", setCode: "m2a", number: "210", name: "N의 제크로무", rarity: "AR", imageUrl: img("210") },
    { id: "m2a-214", setCode: "m2a", number: "214", name: "달지의 메타그로스", rarity: "AR", imageUrl: img("214") },
    { id: "m2a-216", setCode: "m2a", number: "216", name: "하이퍼볼", rarity: "SR", imageUrl: img("216") },
    { id: "m2a-218", setCode: "m2a", number: "218", name: "서포터 N", rarity: "SR", imageUrl: img("218") },
    { id: "m2a-221", setCode: "m2a", number: "221", name: "바베나토 & 헤레나", rarity: "SR", imageUrl: img("221") },
    { id: "m2a-223", setCode: "m2a", number: "223", name: "메가 리자몽 X ex", rarity: "MA", imageUrl: pk("Mega-Charizard-X-ex", "223", "59815") },
    { id: "m2a-226", setCode: "m2a", number: "226", name: "메가 가디안 ex", rarity: "MA", imageUrl: img("226") },
    { id: "m2a-227", setCode: "m2a", number: "227", name: "메가 디안시 ex", rarity: "MA", imageUrl: img("227") },
    { id: "m2a-228", setCode: "m2a", number: "228", name: "메가 루카리오 ex", rarity: "MA", imageUrl: img("228") },
    { id: "m2a-230", setCode: "m2a", number: "230", name: "메가 팬텀 ex", rarity: "MA", imageUrl: img("230") },
    { id: "m2a-234", setCode: "m2a", number: "234", name: "피카츄 ex", rarity: "SAR", imageUrl: pk("Pikachu-ex", "234", "60102") },
    { id: "m2a-237", setCode: "m2a", number: "237", name: "로켓단의 뮤츠 ex", rarity: "SAR", imageUrl: img("237") },
    { id: "m2a-240", setCode: "m2a", number: "240", name: "메가 팬텀 ex", rarity: "SAR", imageUrl: pk("Mega-Gengar-ex", "240", "59818") },
    { id: "m2a-242", setCode: "m2a", number: "242", name: "N의 조로아크 ex", rarity: "SAR", imageUrl: img("242") },
    { id: "m2a-245", setCode: "m2a", number: "245", name: "달지의 메타그로스 ex", rarity: "SAR", imageUrl: img("245") },
    { id: "m2a-246", setCode: "m2a", number: "246", name: "메가 망나뇽 ex", rarity: "SAR", imageUrl: pk("Mega-Dragonite-ex", "246", "60112") },
    { id: "m2a-250", setCode: "m2a", number: "250", name: "메가 망나뇽 ex (골드)", rarity: "MUR", imageUrl: pk("Mega-Dragonite-ex", "250", "60116") },
  ],
};
