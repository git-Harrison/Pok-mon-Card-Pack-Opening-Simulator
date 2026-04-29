import fs from "node:fs";
import path from "node:path";

// Load existing mapping tables
const dexFile = fs.readFileSync("src/lib/wild/name-to-dex.ts", "utf8");
const dexNames = new Set();
for (const m of dexFile.matchAll(/^\s*"([^"]+)":\s*\d+/gm)) {
  dexNames.add(m[1]);
}

const spriteFile = fs.readFileSync("src/lib/wild/card-sprite.ts", "utf8");
const psSlugNames = new Set();
for (const m of spriteFile.matchAll(/^\s*"([^"]+)":\s*"[^"]+"/gm)) {
  psSlugNames.add(m[1]);
}

// Walk all set files
const setsDir = "src/lib/sets";
const setFiles = fs
  .readdirSync(setsDir)
  .filter((f) => f.endsWith(".ts") && f !== "index.ts");
const allCardNames = new Map();
let totalCardEntries = 0;
for (const f of setFiles) {
  const c = fs.readFileSync(path.join(setsDir, f), "utf8");
  for (const m of c.matchAll(/\{\s*id:\s*"([^"]+)",[^}]*name:\s*"([^"]+)",\s*rarity:\s*"([^"]+)"/g)) {
    const [, id, name, rarity] = m;
    totalCardEntries++;
    if (!allCardNames.has(name)) allCardNames.set(name, { ids: [], rarities: new Set() });
    allCardNames.get(name).ids.push(id);
    allCardNames.get(name).rarities.add(rarity);
  }
}

const SUFFIX_PAREN_RE = /\s*\([^)]*\)\s*$/;
const TRAILING_RE = /\s+(ex|V|VMAX|VSTAR|VUNION|GX|BREAK|EX|LV\.?X)\s*$/i;
function normalize(name) {
  let n = name;
  let prev;
  do {
    prev = n;
    n = n.replace(SUFFIX_PAREN_RE, "").replace(TRAILING_RE, "").trim();
  } while (n !== prev);
  return n;
}

// 트레이너/Item/Energy/Stadium 키워드 — 카드 이미지 fallback 의도
const NON_POKEMON_KEYWORDS = [
  "에너지", "스타디움", "옥색", "장갑", "글러브", "캡슐", "보드", "탈출",
  "들것", "망토", "단검", "방패", "검", "물약", "볼", "벨트", "사탕",
  "사과", "라이더", "박사", "TM", "도구", "롱브레이커", "교체", "조사", "도박",
  "강화", "리포트", "리프레쉬", "배터리", "발판", "체커", "체인", "회의",
  "선전", "선동", "지원", "응원", "기지", "다리", "건물", "센터", "마을",
  "바위 의", "모래파", "용암", "다크 시티", "스피드", "경기장", "연구소",
  "포켓몬센터", "트레이너", "초월", "기억", "강심", "위장", "공격", "통계",
  "친구들", "라이벌", "편지", "축전", "작전", "특훈", "지령", "의지",
  "혈통", "계획", "계약", "서약", "맹세", "잔인", "용기", "심판", "체험",
  "사용", "거점", "구급", "비밀", "각본", "혈투", "지원본", "꽉찬",
  "단델", "네즈", "글림우드", "투희", "한약초",
];
function looksLikeNonPokemon(name) {
  if (NON_POKEMON_KEYWORDS.some((k) => name.includes(k))) return true;
  // Stripping standard Pokemon suffixes leaves nothing/very short → trainer-y
  const norm = normalize(name);
  if (norm.length < 2) return true;
  return false;
}

// "X의 Y" trainer-pokemon pattern — strip prefix to get base pokemon
function tryStripTrainerPrefix(name) {
  const m = name.match(/^(.+?)의\s+(.+)$/);
  return m ? m[2].trim() : null;
}

// "가라르 X" / "알로라 X" / "히스이 X" / "팔데아 X" / "파라데아 X" regional form
const REGION_PREFIXES = ["가라르", "알로라", "히스이", "팔데아", "파라데아"];
function tryStripRegionalPrefix(name) {
  for (const p of REGION_PREFIXES) {
    if (name.startsWith(p + " ")) return name.slice(p.length + 1);
    if (name.startsWith(p)) return name.slice(p.length);
  }
  return null;
}

const missing = [];
const okDirect = [];
const okNorm = [];
const okSlug = [];
const okIfStripPrefix = []; // would resolve if we strip "X의 " or regional prefix
const nonPokemon = [];

for (const [name, info] of allCardNames) {
  const ids = info.ids;
  const rarities = [...info.rarities];

  if (psSlugNames.has(name)) {
    okSlug.push({ name, ids });
    continue;
  }
  if (dexNames.has(name)) {
    okDirect.push({ name, ids });
    continue;
  }
  const norm = normalize(name);
  if (psSlugNames.has(norm) || dexNames.has(norm)) {
    okNorm.push({ name, norm, ids });
    continue;
  }
  // Try stripping "X의 "
  const trainerStripped = tryStripTrainerPrefix(norm);
  if (trainerStripped && (dexNames.has(trainerStripped) || psSlugNames.has(trainerStripped))) {
    okIfStripPrefix.push({ name, base: trainerStripped, kind: "trainer-prefix", ids });
    continue;
  }
  // Try stripping regional prefix
  const regionStripped = tryStripRegionalPrefix(norm);
  if (regionStripped && (dexNames.has(regionStripped) || psSlugNames.has(regionStripped))) {
    okIfStripPrefix.push({ name, base: regionStripped, kind: "regional", ids });
    continue;
  }
  // Try stripping both
  if (trainerStripped) {
    const regionFromTrainer = tryStripRegionalPrefix(trainerStripped);
    if (regionFromTrainer && (dexNames.has(regionFromTrainer) || psSlugNames.has(regionFromTrainer))) {
      okIfStripPrefix.push({ name, base: regionFromTrainer, kind: "trainer+regional", ids });
      continue;
    }
  }

  if (looksLikeNonPokemon(name)) {
    nonPokemon.push({ name, ids, rarities });
    continue;
  }
  missing.push({ name, norm, ids, rarities });
}

const totalUnique = allCardNames.size;
const totalUniqueCovered = okSlug.length + okDirect.length + okNorm.length;
const totalUniqueRecoverable = totalUniqueCovered + okIfStripPrefix.length;

console.log("=== 요약 ===");
console.log(`총 카드 entries: ${totalCardEntries}`);
console.log(`unique card names: ${totalUnique}`);
console.log(`PS slug 직접: ${okSlug.length}`);
console.log(`dex 직접: ${okDirect.length}`);
console.log(`dex via 일반 normalize: ${okNorm.length}`);
console.log(`현재 커버: ${totalUniqueCovered} (${(totalUniqueCovered / totalUnique * 100).toFixed(1)}%)`);
console.log(`prefix strip 으로 회수 가능: ${okIfStripPrefix.length}`);
console.log(`회수 후 가능: ${totalUniqueRecoverable} (${(totalUniqueRecoverable / totalUnique * 100).toFixed(1)}%)`);
console.log(`non-Pokemon 추정 (트레이너/도구): ${nonPokemon.length}`);
console.log(`진짜 MISSING (dex 추가 필요): ${missing.length}`);
console.log("");

console.log("=== prefix strip 으로 회수 가능한 항목 ===");
const recoverableByKind = {};
for (const r of okIfStripPrefix) {
  recoverableByKind[r.kind] = (recoverableByKind[r.kind] || 0) + 1;
}
console.log(JSON.stringify(recoverableByKind, null, 2));
console.log("");

console.log("=== 진짜 MISSING (전체) ===");
const missingByName = missing.sort((a, b) => a.name.localeCompare(b.name, "ko"));
for (const { name, norm, ids, rarities } of missingByName) {
  const sample = ids.slice(0, 1).join(",");
  const more = ids.length > 1 ? "+" + (ids.length - 1) : "";
  const rar = rarities.join("/");
  console.log(`  "${name}"  norm:"${norm}"  rarity:[${rar}]  ${sample}${more}`);
}

console.log("");
console.log("=== non-Pokemon 추정 일부 (10개) ===");
for (const { name } of nonPokemon.slice(0, 10)) {
  console.log(`  ${name}`);
}
