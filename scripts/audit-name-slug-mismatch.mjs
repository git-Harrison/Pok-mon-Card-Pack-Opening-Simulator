#!/usr/bin/env node
// 카드의 한국어 이름 ↔ Pokellector slug (영문 포켓몬명) 정합성 검증.
//
// 보수적 접근:
//   * 내장 사전(KR→EN)에 등재된 포켓몬만 검증 — 사전에 없으면 skip.
//   * 트레이너 prefix (예: "에단의", "Team Rocket's"), 카드 suffix
//     (ex / V / VMAX / GX / VSTAR) 양쪽에서 제거 후 베이스 이름만 비교.
//   * 일치/불일치/스킵 통계와 함께 의심 카드 목록 출력.
//
//   node scripts/audit-name-slug-mismatch.mjs
//
// 사전은 1세대 위주 + 인기 포켓몬으로 한정. 신뢰도 낮은 매핑은
// 의도적으로 누락. 결과의 의심 케이스는 사람이 직접 확인 필요.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SETS_DIR = join(ROOT, "src", "lib", "sets");

const SET_CODES = ["m2a", "m2", "sv8", "sv2a", "sv5a", "sv8a"];

// --- KR ↔ EN 사전 (확신 가능한 포켓몬만) ----------------------
// 1세대 모두 + 일부 세대 2~9 인기 포켓몬.
// 특정 카드의 한국어가 사전 키와 정확히 일치할 때만 매칭됨.
const KR_TO_EN = {
  // Gen 1 (151)
  "이상해씨": "Bulbasaur", "이상해풀": "Ivysaur", "이상해꽃": "Venusaur",
  "파이리": "Charmander", "리자드": "Charmeleon", "리자몽": "Charizard",
  "꼬부기": "Squirtle", "어니부기": "Wartortle", "거북왕": "Blastoise",
  "캐터피": "Caterpie", "단데기": "Metapod", "버터플": "Butterfree",
  "뿔충이": "Weedle", "딱충이": "Kakuna", "독침붕": "Beedrill",
  "구구": "Pidgey", "피죤": "Pidgeotto", "피죤투": "Pidgeot",
  "꼬렛": "Rattata", "레트라": "Raticate",
  "깨비참": "Spearow", "깨비드릴조": "Fearow",
  "아보": "Ekans", "아보크": "Arbok",
  "피카츄": "Pikachu", "라이츄": "Raichu",
  "모래두지": "Sandshrew", "고지": "Sandslash",
  // 니드런 ♀/♂ 은 Pokellector slug 가 단순 "Nidoran-" 으로 잘려 있어
  // ♀/♂ 구분이 사라짐 — 사전 비교가 불가능해서 제외.
  "니드리나": "Nidorina", "니드퀸": "Nidoqueen",
  "니드리노": "Nidorino", "니드킹": "Nidoking",
  "삐": "Cleffa", "삐삐": "Clefairy", "픽시": "Clefable",
  "식스테일": "Vulpix", "나인테일": "Ninetales",
  "푸린": "Jigglypuff", "푸크린": "Wigglytuff",
  "주뱃": "Zubat", "골뱃": "Golbat", "크로뱃": "Crobat",
  "뚜벅쵸": "Oddish", "냄새꼬": "Gloom", "라플레시아": "Vileplume",
  "파라스": "Paras", "파라섹트": "Parasect",
  "콘팡": "Venonat", "도나리": "Venomoth",
  "디그다": "Diglett", "닥트리오": "Dugtrio",
  "나옹": "Meowth", "페르시온": "Persian",
  "고라파덕": "Psyduck", "골덕": "Golduck",
  "망키": "Mankey", "성원숭": "Primeape",
  "가디": "Growlithe", "윈디": "Arcanine",
  "발챙이": "Poliwag", "슈륙챙이": "Poliwhirl", "강챙이": "Poliwrath",
  "캐이시": "Abra", "윤겔라": "Kadabra", "후딘": "Alakazam",
  "알통몬": "Machop", "근육몬": "Machoke", "괴력몬": "Machamp",
  "모다피": "Bellsprout", "우츠동": "Weepinbell", "우츠보트": "Victreebel",
  "왕눈해": "Tentacool", "독파리": "Tentacruel",
  "꼬마돌": "Geodude", "데구리": "Graveler", "딱구리": "Golem",
  "포니타": "Ponyta", "날쌩마": "Rapidash",
  "야돈": "Slowpoke", "야도란": "Slowbro", "야도킹": "Slowking",
  "코일": "Magnemite", "레어코일": "Magneton",
  "파오리": "Farfetch'd",
  "두두": "Doduo", "두트리오": "Dodrio",
  "쥬쥬": "Seel", "쥬레곤": "Dewgong",
  "질퍽이": "Grimer", "질뻐기": "Muk",
  "셀러": "Shellder", "파르셀": "Cloyster",
  "고오스": "Gastly", "고우스트": "Haunter",
  // "팬텀" 제외 — 1세대 Gengar 와 3세대 Silcoon 동음이의어 충돌.
  "롱스톤": "Onix", "강철톤": "Steelix",
  "슬리프": "Drowzee", "슬리퍼": "Hypno",
  "크랩": "Krabby", "킹크랩": "Kingler",
  "찌리리공": "Voltorb", "붐볼": "Electrode",
  "아라리": "Exeggcute", "나시": "Exeggutor",
  "탕구리": "Cubone", "텅구리": "Marowak",
  "시라소몬": "Hitmonlee", "홍수몬": "Hitmonchan",
  "내루미": "Lickitung",
  "또가스": "Koffing", "또도가스": "Weezing",
  "뿔카노": "Rhyhorn", "코뿌리": "Rhydon",
  "럭키": "Chansey", "해피너스": "Blissey",
  "덩쿠리": "Tangela", "덩쿠림보": "Tangrowth",
  "캥카": "Kangaskhan",
  "별가사리": "Staryu", "아쿠스타": "Starmie",
  "마임맨": "Mr. Mime", "마임꽁꽁": "Mr. Rime",
  "스라크": "Scyther", "핫삼": "Scizor",
  "루주라": "Jynx",
  "에레브": "Electabuzz", "에레키블": "Electivire",
  "마그마": "Magmar", "마그마번": "Magmortar",
  "쁘사이저": "Pinsir",
  "켄타로스": "Tauros",
  "잉어킹": "Magikarp", "갸라도스": "Gyarados",
  "라프라스": "Lapras",
  "메타몽": "Ditto",
  "이브이": "Eevee",
  "샤미드": "Vaporeon", "쥬피썬더": "Jolteon", "부스터": "Flareon",
  "에브이": "Espeon", "블래키": "Umbreon",
  "리피아": "Leafeon", "글레이시아": "Glaceon", "님피아": "Sylveon",
  "폴리곤": "Porygon", "폴리곤2": "Porygon2", "폴리곤Z": "Porygon-Z",
  "암나이트": "Omanyte", "암스타": "Omastar",
  "투구": "Kabuto", "투구푸스": "Kabutops",
  "프테라": "Aerodactyl",
  "잠만보": "Snorlax",
  "프리져": "Articuno", "썬더": "Zapdos", "파이어": "Moltres",
  "미뇽": "Dratini", "신뇽": "Dragonair", "망나뇽": "Dragonite",
  "뮤츠": "Mewtwo", "뮤": "Mew",

  // Gen 2 popular
  "치코리타": "Chikorita", "베이리프": "Bayleef", "메가니움": "Meganium",
  "브케인": "Cyndaquil", "마그케인": "Quilava", "블레이범": "Typhlosion",
  "리아코": "Totodile", "엘리게이": "Croconaw", "장크로다일": "Feraligatr",
  "꼬몽울": "Budew", "로젤리아": "Roselia", "로즈레이드": "Roserade",
  "왕자리": "Yanma", "메가자리": "Yanmega",
  "키링키": "Girafarig",
  "마릴": "Marill", "마릴리": "Azumarill",
  "토게피": "Togepi", "토게틱": "Togetic", "토게키스": "Togekiss",
  "고래왕자": "Wailmer", "고래왕": "Wailord",
  // "악비아르" 제외 — 영문 매핑 확신 부족.

  // Gen 3 popular
  "개무소": "Wurmple", "뷰티플라이": "Beautifly",
  // "팬텀" 매핑 제외 — 1세대 Gengar 와 3세대 Silcoon 동음이의어 충돌.
  "카스쿤": "Cascoon", "독케일": "Dustox",
  "루카리오": "Lucario",   // Gen 4 actually but commonly known
  "이어롭": "Lopunny",
  "쉐이미": "Shaymin",
  "다크라이": "Darkrai",
  "디아루가": "Dialga", "펄기아": "Palkia", "기라티나": "Giratina",
  "히드런": "Heatran",
  "아르세우스": "Arceus",

  // Gen 5 popular
  "비크티니": "Victini",
  "주리비얀": "Snivy", "샤로다": "Servine", "샤로자드": "Serperior",
  "뚜꾸리": "Tepig", "차오꿀": "Pignite", "염무왕": "Emboar",
  "수댕이": "Oshawott", "쌍검자비": "Dewott", "대검귀": "Samurott",
  "모꼬": "Cottonee", "엘풍": "Whimsicott",

  // Gen 6 popular
  "팽도리": "Piplup", "팽태자": "Prinplup", "엠페르트": "Empoleon",

  // Gen 8/9 popular (sub-set of identifiable ones)
  "돌살이": "Dwebble", "암팰리스": "Crustle",
  // 9세대 한국명 일부 매핑은 확신 부족 — 보수적으로 제외.
  // ("리리코"/"사스라이저"/"코털베어"/"스코빌런" 등은 검증 후 추가)
  "총지엔": "Wo-Chien",
};

// 트레이너 possessive prefix 들 (slug 시작 부분에서 제거)
// 사례: "Ethans-Pinsir" → "Pinsir", "Cynthias-Roselia" → "Roselia"
// 일반 패턴: 대문자로 시작 + 소문자 + 's-' (Possessive). Team Rocket's
// / Team Plasma's 만 별도 처리 (두 단어 트레이너).
function stripTrainerPrefix(slug) {
  // Multi-word trainers with leading "Team-"
  slug = slug.replace(/^Team-[A-Z][a-z]+s-/, "");
  // Single-word possessive (e.g., "Ethans-", "Cynthias-", "Hops-")
  slug = slug.replace(/^[A-Z][a-z]+s-/, "");
  return slug;
}

const SLUG_SUFFIXES = ["-ex", "-EX", "-V", "-VMAX", "-VSTAR", "-GX", "-BREAK"];

function stripSlugSuffix(slug) {
  for (const sfx of SLUG_SUFFIXES) {
    if (slug.endsWith(sfx)) return slug.slice(0, -sfx.length);
  }
  return slug;
}

function normalizeSlug(slug) {
  if (!slug) return "";
  // 순서: suffix(-ex/-V/...) 먼저 → 그 후 trainer prefix.
  // 이렇게 안 하면 "Latias-ex" 의 trainer prefix regex 가
  // "Latias" 의 끝글자 's' 를 possessive 로 잘못 보고 잘라버림.
  let s = stripSlugSuffix(slug);
  s = stripTrainerPrefix(s);
  return canonical(s);
}

// 영숫자만 남기고 lowercase. apostrophe / dot / hyphen / space 모두 무시.
function canonical(s) {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const KR_SUFFIX_RX = /\s+(ex|EX|V|VMAX|VSTAR|GX|BREAK)\s*$/;

function stripKrAttributes(name) {
  let s = name;
  // Remove suffix attributes
  s = s.replace(KR_SUFFIX_RX, "");
  // Remove parenthesized variants like (골드), (SV), (미러) ...
  s = s.replace(/\s*\([^)]*\)\s*$/, "");
  // Trainer possessive in KR: "에단의 쁘사이저", "난천의 로젤리아"
  // → take after last "의 ".
  const idx = s.lastIndexOf("의 ");
  if (idx >= 0) s = s.slice(idx + 2);
  return s.trim();
}

// --- 파서 (audit-sets.mjs 와 동일 룰) -----------------------

const RX_CARD = /\{\s*id:\s*"([^"]+)",\s*setCode:\s*"([^"]+)",\s*number:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*rarity:\s*"([^"]+)",\s*imageUrl:\s*([^,}]+(?:\([^)]*\))?)/g;
const RX_SLUG_FROM_PK = /^[a-zA-Z]+\(\s*"([^"]+)"/;

function parseSet(filePath) {
  const raw = readFileSync(filePath, "utf8");
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  const cards = [];
  for (const m of src.matchAll(RX_CARD)) {
    const slugMatch = m[6].trim().match(RX_SLUG_FROM_PK);
    cards.push({
      id: m[1],
      number: m[3],
      name: m[4],
      rarity: m[5],
      slug: slugMatch?.[1] ?? null,
    });
  }
  return cards;
}

// --- 검사 -------------------------------------------------

const mismatches = [];
let mappedCount = 0;
let unmappedCount = 0;
let englishCount = 0;
let totalCount = 0;

for (const code of SET_CODES) {
  const cards = parseSet(join(SETS_DIR, `${code}.ts`));
  for (const c of cards) {
    totalCount++;
    const name = c.name;
    // 영문 이름 카드 (이미 audit-sets.mjs 가 별도 경고하므로 여기선 skip)
    if (/^[A-Za-z][\w\s'.-]*$/.test(name)) {
      englishCount++;
      continue;
    }
    const krBase = stripKrAttributes(name);
    const expected = KR_TO_EN[krBase];
    if (!expected) {
      unmappedCount++;
      continue;
    }
    if (!c.slug) {
      unmappedCount++;
      continue;
    }
    const expectedNorm = canonical(expected);
    const slugNorm = normalizeSlug(c.slug);
    mappedCount++;
    if (expectedNorm !== slugNorm) {
      mismatches.push({
        id: c.id,
        name,
        krBase,
        expectedEN: expected,
        slug: c.slug,
        slugBase: normalizeSlug(c.slug),
      });
    }
  }
}

// --- 리포트 -----------------------------------------------

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("   카드명 ↔ Pokellector slug 정합 감사");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

console.log(`  검사 대상: ${totalCount}장`);
console.log(`    ├ 한국어 이름 + 사전 매칭: ${mappedCount}장 (검증)`);
console.log(`    ├ 영문 이름 (별도 경고):    ${englishCount}장 (skip)`);
console.log(`    └ 사전 미등재:              ${unmappedCount}장 (skip)`);
console.log();

console.log("━━ 의심되는 mismatch ━━");
if (mismatches.length === 0) {
  console.log("  (없음) ✅\n");
} else {
  for (const m of mismatches) {
    console.log(`  ❌ ${m.id}  "${m.name}"  (${m.krBase} = ${m.expectedEN})`);
    console.log(`        slug: "${m.slug}"  (베이스: ${m.slugBase})`);
  }
  console.log(`\n  → ${mismatches.length}건\n`);
}

process.exit(mismatches.length > 0 ? 1 : 0);
