import type { SetInfo } from "../types";

// Pokellector SV8 folder is "405". URLs verified 200 in April 2026.
// Pattern: https://den-cards.pokellector.com/405/<slug>.SV8.<num>.<id>.png
const pk = (slug: string, num: string, id: string) =>
  `https://den-cards.pokellector.com/405/${slug}.SV8.${num}.${id}.png`;

export const sv8: SetInfo = {
  code: "sv8",
  name: "초전브레이커",
  subtitle: "확장팩 · SUPER ELECTRIC BREAKER (SV8)",
  releaseDate: "2024-11-27",
  cardsPerPack: 5,
  packsPerBox: 30,
  totalCards: 138,
  primaryColor: "#eab308",
  accentColor: "#fde047",
  boxImage: "/images/sets/sv8/box.jpg",
  packImage: "/images/sets/sv8/pack.png",
  slots: [
    { label: "C 1", weights: { C: 100 } },
    { label: "C 2", weights: { C: 100 } },
    { label: "C/U", weights: { C: 55, U: 45 } },
    { label: "U/R", weights: { U: 70, R: 30 } },
    {
      label: "Hit",
      weights: { R: 30, RR: 30, AR: 20, SR: 12, SAR: 6, UR: 2 },
    },
  ],
  // Names use the Korean localized Pokémon names corresponding to SV8's
  // Japanese card roster (the old list had several mis-mapped names).
  cards: [
    { id: "sv8-010", setCode: "sv8", number: "010", name: "파오젠", rarity: "C", imageUrl: pk("Wo-Chien", "10", "54533") },
    { id: "sv8-022", setCode: "sv8", number: "022", name: "파라블레이즈", rarity: "C", imageUrl: pk("Ceruledge", "22", "54542") },
    { id: "sv8-028", setCode: "sv8", number: "028", name: "씨카브", rarity: "C", imageUrl: pk("Sealeo", "28", "54547") },
    { id: "sv8-044", setCode: "sv8", number: "044", name: "미라이돈", rarity: "C", imageUrl: pk("Miraidon", "44", "54496") },
    { id: "sv8-055", setCode: "sv8", number: "055", name: "저리더프", rarity: "C", imageUrl: pk("Dedenne", "55", "54559") },
    { id: "sv8-063", setCode: "sv8", number: "063", name: "팔데아 켄타로스", rarity: "U", imageUrl: pk("Paldean-Tauros", "63", "54564") },
    { id: "sv8-078", setCode: "sv8", number: "078", name: "동미러", rarity: "U", imageUrl: pk("Bronzor", "78", "54572") },
    { id: "sv8-092", setCode: "sv8", number: "092", name: "파밀리쥐 대가족", rarity: "R", imageUrl: pk("Maushold", "92", "54514") },
    { id: "sv8-003", setCode: "sv8", number: "003", name: "두랄루돈 ex", rarity: "RR", imageUrl: pk("Durant-ex", "3", "54529") },
    { id: "sv8-023", setCode: "sv8", number: "023", name: "스코빌런 ex", rarity: "RR", imageUrl: pk("Scovillain-ex", "23", "54543") },
    { id: "sv8-026", setCode: "sv8", number: "026", name: "밀로틱 ex", rarity: "RR", imageUrl: pk("Miolotic-ex", "26", "54472") },
    { id: "sv8-033", setCode: "sv8", number: "033", name: "피카츄 ex", rarity: "RR", imageUrl: pk("Pikachu-ex", "33", "54461") },
    { id: "sv8-057", setCode: "sv8", number: "057", name: "사다이사 ex", rarity: "RR", imageUrl: pk("Palossand-ex", "57", "54494") },
    { id: "sv8-072", setCode: "sv8", number: "072", name: "삼삼드래 ex", rarity: "RR", imageUrl: pk("Hydreigon-ex", "72", "54465") },
    { id: "sv8-081", setCode: "sv8", number: "081", name: "싸리용 ex", rarity: "RR", imageUrl: pk("Tatsugiri-ex", "81", "54466") },
    { id: "sv8-084", setCode: "sv8", number: "084", name: "게을킹", rarity: "RR", imageUrl: pk("Slaking", "84", "54467") },
    { id: "sv8-107", setCode: "sv8", number: "107", name: "비바라바", rarity: "AR", imageUrl: pk("Vivillon", "107", "54500") },
    { id: "sv8-110", setCode: "sv8", number: "110", name: "빈티나", rarity: "AR", imageUrl: pk("Feebas", "110", "54501") },
    { id: "sv8-113", setCode: "sv8", number: "113", name: "메더", rarity: "AR", imageUrl: pk("Stunfisk", "113", "54610") },
    { id: "sv8-116", setCode: "sv8", number: "116", name: "알로라 딱구리", rarity: "AR", imageUrl: pk("Alolan-Dugtrio", "116", "54611") },
    { id: "sv8-119", setCode: "sv8", number: "119", name: "두랄루돈 ex", rarity: "SR", imageUrl: pk("Durant-ex", "119", "54613") },
    { id: "sv8-120", setCode: "sv8", number: "120", name: "스코빌런 ex", rarity: "SR", imageUrl: pk("Scovillain-ex", "120", "54614") },
    { id: "sv8-121", setCode: "sv8", number: "121", name: "밀로틱 ex", rarity: "SR", imageUrl: pk("Milotic-ex", "121", "54615") },
    { id: "sv8-122", setCode: "sv8", number: "122", name: "피카츄 ex", rarity: "SR", imageUrl: pk("Pikachu-ex", "122", "54474") },
    { id: "sv8-123", setCode: "sv8", number: "123", name: "사다이사 ex", rarity: "SR", imageUrl: pk("Palossand-ex", "123", "54592") },
    { id: "sv8-124", setCode: "sv8", number: "124", name: "삼삼드래 ex", rarity: "SR", imageUrl: pk("Hydreigon-ex", "124", "54616") },
    { id: "sv8-125", setCode: "sv8", number: "125", name: "싸리용 ex", rarity: "SR", imageUrl: pk("Tatsugiri-ex", "125", "54617") },
    { id: "sv8-126", setCode: "sv8", number: "126", name: "게을킹 ex", rarity: "SR", imageUrl: pk("Slaking-ex", "126", "54618") },
    { id: "sv8-127", setCode: "sv8", number: "127", name: "시라노", rarity: "SR", imageUrl: pk("Cyrano", "127", "54526") },
    { id: "sv8-128", setCode: "sv8", number: "128", name: "시트론의 기전", rarity: "SR", imageUrl: pk("Clemonts-Quick-Wit", "128", "54619") },
    { id: "sv8-129", setCode: "sv8", number: "129", name: "도토리의 응시", rarity: "SR", imageUrl: pk("Jasmines-Gaze", "129", "54525") },
    { id: "sv8-130", setCode: "sv8", number: "130", name: "두랄루돈 ex", rarity: "SAR", imageUrl: pk("Durant-ex", "130", "54620") },
    { id: "sv8-131", setCode: "sv8", number: "131", name: "밀로틱 ex", rarity: "SAR", imageUrl: pk("Milotic-ex", "131", "54503") },
    { id: "sv8-132", setCode: "sv8", number: "132", name: "피카츄 ex", rarity: "SAR", imageUrl: pk("Pikachu-ex", "132", "54504") },
    { id: "sv8-133", setCode: "sv8", number: "133", name: "삼삼드래 ex", rarity: "SAR", imageUrl: pk("Hydreigon-ex", "133", "54511") },
    { id: "sv8-134", setCode: "sv8", number: "134", name: "시트론의 기전", rarity: "SAR", imageUrl: pk("Clemonts-Quick-Wit", "134", "54621") },
    { id: "sv8-136", setCode: "sv8", number: "136", name: "피카츄 ex (골드)", rarity: "UR", imageUrl: pk("Pikachu-ex", "136", "54622") },
    { id: "sv8-137", setCode: "sv8", number: "137", name: "밤의 구조", rarity: "UR", imageUrl: pk("Night-Stretcher", "137", "54623") },
    { id: "sv8-138", setCode: "sv8", number: "138", name: "중력의 산", rarity: "UR", imageUrl: pk("Gravity-Mountain", "138", "54624") },
  ],
};
