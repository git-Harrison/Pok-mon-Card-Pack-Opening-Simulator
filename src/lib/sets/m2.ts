import type { SetInfo } from "../types";

// Pokellector CDN — reliable for fan-sim dev usage.
// Pattern: https://den-cards.pokellector.com/425/<slug>.M2.<num>.<id>.png
// Korean card scans via pokemoncard.co.kr are not on stable URLs; using Pokellector as fallback.
const pokellector = (slug: string, num: string, id: string) =>
  `https://den-cards.pokellector.com/425/${slug}.M2.${num}.${id}.png`;

export const m2: SetInfo = {
  code: "m2",
  name: "인페르노X",
  subtitle: "MEGA 확장팩 · INFERNO X",
  releaseDate: "2025-11-28",
  cardsPerPack: 5,
  packsPerBox: 30,
  totalCards: 116,
  primaryColor: "#dc2626",
  accentColor: "#fca5a5",
  boxImage: "/images/sets/m2/box.png",
  packImage: "/images/sets/m2/pack.png",
  // Standard 5-card expansion: first 3 = C, 4th = U/R, 5th = hit slot
  slots: [
    { label: "C 1", weights: { C: 100 } },
    { label: "C 2", weights: { C: 100 } },
    { label: "C/U", weights: { C: 60, U: 40 } },
    { label: "U/R", weights: { U: 70, R: 30 } },
    {
      label: "Hit",
      weights: { R: 25, RR: 28, AR: 20, SR: 13, SAR: 10, MUR: 4 },
    },
  ],
  cards: [
    { id: "m2-001", setCode: "m2", number: "001", name: "메가헤라크로스 씨앗", rarity: "C", imageUrl: pokellector("Heracross", "1", "59486") },
    { id: "m2-010", setCode: "m2", number: "010", name: "리자몽 유생", rarity: "C", imageUrl: pokellector("Charmander", "10", "59495") },
    { id: "m2-025", setCode: "m2", number: "025", name: "로토무 유생", rarity: "C", imageUrl: pokellector("Rotom", "25", "59510") },
    { id: "m2-040", setCode: "m2", number: "040", name: "무우마직 유생", rarity: "C", imageUrl: pokellector("Misdreavus", "40", "59525") },
    { id: "m2-060", setCode: "m2", number: "060", name: "팽도리", rarity: "U", imageUrl: pokellector("Piplup", "60", "59545") },
    { id: "m2-070", setCode: "m2", number: "070", name: "이어롭 유생", rarity: "U", imageUrl: pokellector("Buneary", "70", "59555") },
    { id: "m2-075", setCode: "m2", number: "075", name: "훈련 필드", rarity: "R", imageUrl: pokellector("Training-Field", "75", "59560") },
    { id: "m2-004", setCode: "m2", number: "004", name: "메가헤라크로스 ex", rarity: "RR", imageUrl: pokellector("Mega-Heracross-ex", "4", "59489") },
    { id: "m2-013", setCode: "m2", number: "013", name: "메가 리자몽 X ex", rarity: "RR", imageUrl: pokellector("Mega-Charizard-X-ex", "13", "59498") },
    { id: "m2-018", setCode: "m2", number: "018", name: "오드리드리 ex", rarity: "RR", imageUrl: pokellector("Oricorio-ex", "18", "59503") },
    { id: "m2-029", setCode: "m2", number: "029", name: "로토무 ex", rarity: "RR", imageUrl: pokellector("Rotom-ex", "29", "59514") },
    { id: "m2-036", setCode: "m2", number: "036", name: "무우마직 ex", rarity: "RR", imageUrl: pokellector("Mismagius-ex", "36", "59521") },
    { id: "m2-051", setCode: "m2", number: "051", name: "메가 샤크니아 ex", rarity: "RR", imageUrl: pokellector("Mega-Sharpedo-ex", "51", "59536") },
    { id: "m2-058", setCode: "m2", number: "058", name: "엠페르트 ex", rarity: "RR", imageUrl: pokellector("Empoleon-ex", "58", "59543") },
    { id: "m2-072", setCode: "m2", number: "072", name: "메가 이어롭 ex", rarity: "RR", imageUrl: pokellector("Mega-Lopunny-ex", "72", "59557") },
    { id: "m2-081", setCode: "m2", number: "081", name: "라란티스", rarity: "AR", imageUrl: pokellector("Lurantis", "81", "59566") },
    { id: "m2-083", setCode: "m2", number: "083", name: "게을킹", rarity: "AR", imageUrl: pokellector("Slaking", "83", "59568") },
    { id: "m2-086", setCode: "m2", number: "086", name: "엘풍", rarity: "AR", imageUrl: pokellector("Whimsicott", "86", "59571") },
    { id: "m2-088", setCode: "m2", number: "088", name: "잠만보", rarity: "AR", imageUrl: pokellector("Snorlax", "88", "59573") },
    { id: "m2-091", setCode: "m2", number: "091", name: "시로나", rarity: "AR", imageUrl: pokellector("Cynthia", "91", "59576") },
    { id: "m2-094", setCode: "m2", number: "094", name: "메가 리자몽 X ex", rarity: "SR", imageUrl: pokellector("Mega-Charizard-X-ex", "94", "59579") },
    { id: "m2-095", setCode: "m2", number: "095", name: "오드리드리 ex", rarity: "SR", imageUrl: pokellector("Oricorio-ex", "95", "59580") },
    { id: "m2-100", setCode: "m2", number: "100", name: "메가 이어롭 ex", rarity: "SR", imageUrl: pokellector("Mega-Lopunny-ex", "100", "59585") },
    { id: "m2-103", setCode: "m2", number: "103", name: "메가 샤크니아 ex", rarity: "SR", imageUrl: pokellector("Mega-Sharpedo-ex", "103", "59588") },
    { id: "m2-107", setCode: "m2", number: "107", name: "아이리스", rarity: "SR", imageUrl: pokellector("Dawn", "107", "59592") },
    { id: "m2-110", setCode: "m2", number: "110", name: "메가 리자몽 X ex", rarity: "SAR", imageUrl: pokellector("Mega-Charizard-X-ex", "110", "59595") },
    { id: "m2-111", setCode: "m2", number: "111", name: "오드리드리 ex", rarity: "SAR", imageUrl: pokellector("Oricorio-ex", "111", "59596") },
    { id: "m2-113", setCode: "m2", number: "113", name: "메가 샤크니아 ex", rarity: "SAR", imageUrl: pokellector("Mega-Sharpedo-ex", "113", "59598") },
    { id: "m2-115", setCode: "m2", number: "115", name: "아이리스", rarity: "SAR", imageUrl: pokellector("Dawn", "115", "59600") },
    { id: "m2-116", setCode: "m2", number: "116", name: "메가 리자몽 X ex (골드)", rarity: "MUR", imageUrl: pokellector("Mega-Charizard-X-ex", "116", "59601") },
  ],
};
