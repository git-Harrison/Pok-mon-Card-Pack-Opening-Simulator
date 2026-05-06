/**
 * 카탈로그의 모든 카드 이름을 lookupDex 에 통과시켜 매칭 실패하는 카드를
 * 찾는 스캐너. 트레이너/에너지/굿즈는 wild_type=null 로 인식되어 자동
 * 제외. 출력: 카드 ID, 이름, rarity, 추정 type.
 *
 * 실행: npx tsx scripts/find-unmatched-cards.mts
 */
const setsMod = await import("../src/lib/sets/index");
const wildMod = await import("../src/lib/wild/name-to-type");
const dexMod = await import("../src/lib/wild/name-to-dex");

interface SetInfoLite {
  cards: Array<{
    id: string;
    name: string;
    rarity: string;
    imageUrl?: string;
  }>;
}

// imageUrl 에서 Pokemon 영문 슬러그 추출 — Pokellector URL 패턴.
//   .../Galarian-Cursola.S4A.119.31984.png → "Galarian Cursola"
function extractEnglishName(url: string | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/([A-Za-z][A-Za-z0-9-]*)\.[A-Z0-9]+\.\d+/);
  if (!m) return null;
  return m[1].replace(/-/g, " ");
}
const SETS: Record<string, SetInfoLite> =
  (setsMod as { SETS?: Record<string, SetInfoLite> }).SETS ||
  (setsMod as Record<string, { SETS?: Record<string, SetInfoLite> }>)[
    "module.exports"
  ]?.SETS ||
  {};

const resolveCardType: (name: string) => string | null =
  (wildMod as { resolveCardType?: (name: string) => string | null })
    .resolveCardType ||
  (wildMod as Record<string, { resolveCardType?: (name: string) => string | null }>)[
    "module.exports"
  ]?.resolveCardType ||
  (() => null);

const lookupDex: (name: string) => number | null =
  (dexMod as { lookupDex?: (name: string) => number | null }).lookupDex ||
  (dexMod as Record<string, { lookupDex?: (name: string) => number | null }>)[
    "module.exports"
  ]?.lookupDex ||
  (() => null);

const TRAINER_KEYWORDS = [
  "에너지", "Energy", "박사", "교수", "닥터", "사장", "Switch",
  "스타디움", "타워", "캡슐", "렌즈", "산맥", "산", "구조", "구조대",
  "트레이너", "비밀", "공격", "도구", "스푼", "트랩", "레이",
  "시소", "빌딩", "그라운드", "필드", "보드", "셰이크", "잡이",
  "결의", "캐치", "글러브", "망토", "양동이", "들것", "묘지", "탑",
  "수정", "안경", "메모리", "회수", "파괴자", "발견", "심사", "위원",
  "지령", "명령", "지시", "지원", "응원", "기록", "수첩", "노트",
  "에어풍선", "도구회수", "단검칼날", "녹슨검", "녹슨방패",
  "리본", "배지", "연구", "가면", "두송이", "수첩", "조사",
  "만취", "꿈", "관리인", "가게", "조감도", "유적",
  "지하", "마을", "도시", "공장", "광산", "동굴", "수상",
  "비명", "불러", "고함", "봉인", "각인", "기운",
  "박살", "초롱", "홀로그램", "가루", "약", "포션",
  "솔서", "자전거", "들레", "엔진", "페달", "옷",
  "스피드", "스톤", "오로라", "잠복", "방향", "보물", "세정",
  "안개", "미스트", "프리즘", "혼돈", "용암",
  "대도리고", "트레저", "옥", "구슬", "시계",
];

const seen = new Set<string>();
interface Row { id: string; name: string; rarity: string; type: string; eng: string | null; }
const pokemonOnly: Row[] = [];
const probablyTrainer: Row[] = [];
const englishNames: Row[] = [];

function looksLikeTrainer(name: string): boolean {
  for (const k of TRAINER_KEYWORDS) {
    if (name.includes(k)) return true;
  }
  return false;
}
function isEnglishOnly(name: string): boolean {
  // 한글 글자 0개면 영어 이름.
  return !/[ㄱ-힝]/.test(name);
}

for (const setKey of Object.keys(SETS)) {
  const set = SETS[setKey];
  if (!set?.cards) continue;
  for (const card of set.cards) {
    if (seen.has(card.name)) continue;
    seen.add(card.name);

    if (lookupDex(card.name) != null) continue;

    const type = resolveCardType(card.name);
    if (!type) continue;

    const row: Row = {
      id: card.id,
      name: card.name,
      rarity: card.rarity,
      type,
      eng: extractEnglishName(card.imageUrl),
    };
    if (isEnglishOnly(card.name)) {
      englishNames.push(row);
    } else if (looksLikeTrainer(card.name)) {
      probablyTrainer.push(row);
    } else {
      pokemonOnly.push(row);
    }
  }
}

const sortName = (a: Row, b: Row) => a.name.localeCompare(b.name, "ko");
pokemonOnly.sort(sortName);
probablyTrainer.sort(sortName);
englishNames.sort(sortName);

console.log(`\n=== Pokemon 이름 추정 (${pokemonOnly.length}종) ===\n`);
for (const r of pokemonOnly) {
  console.log(
    `  ${r.id.padEnd(14)}  ${r.rarity.padEnd(4)}  ${r.type.padEnd(6)}  ${r.name.padEnd(28)}  → ${r.eng ?? "?"}`
  );
}
console.log(`\n=== 트레이너/아이템 추정 (${probablyTrainer.length}종) — 자동 제외 후보 ===\n`);
for (const r of probablyTrainer) {
  console.log(`  ${r.id.padEnd(14)}  ${r.rarity.padEnd(4)}  ${r.name}`);
}
console.log(`\n=== 영어 이름 (${englishNames.length}종) ===\n`);
for (const r of englishNames) {
  console.log(`  ${r.id.padEnd(14)}  ${r.rarity.padEnd(4)}  ${r.name}`);
}
console.log(`\n총 ${pokemonOnly.length + probablyTrainer.length + englishNames.length}종 미매칭\n`);
