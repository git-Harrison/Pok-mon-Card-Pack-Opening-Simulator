// runtime-aware audit — actually exercises lookupDex / cardSpriteUrl
// from compiled module to count exact coverage post-fallback rules.
import fs from "node:fs";
import path from "node:path";

// Load mapping tables
const dexFile = fs.readFileSync("src/lib/wild/name-to-dex.ts", "utf8");
const dexMap = {};
for (const m of dexFile.matchAll(/^\s*"([^"]+)":\s*(\d+)/gm)) {
  dexMap[m[1]] = parseInt(m[2], 10);
}

const spriteFile = fs.readFileSync("src/lib/wild/card-sprite.ts", "utf8");
const slugMap = {};
for (const m of spriteFile.matchAll(/^\s*"([^"]+)":\s*"([^"]+)"/gm)) {
  slugMap[m[1]] = m[2];
}

// Re-implement the new lookupDex strip logic
function lookupDex(name) {
  if (!name) return null;
  const tryName = (n) => dexMap[n];
  if (tryName(name) !== undefined) return tryName(name);

  let base = name
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s+(ex|V|VMAX|VSTAR|VUNION|GX|BREAK)\s*$/i, "")
    .trim();
  if (tryName(base) !== undefined) return tryName(base);

  for (const p of ["메가 ", "메가-", "메가"]) {
    if (base.startsWith(p)) {
      const stripped = base.slice(p.length).trim();
      if (tryName(stripped) !== undefined) return tryName(stripped);
      base = stripped;
      break;
    }
  }

  for (const p of [
    "가라르 ", "알로라 ", "히스이 ", "팔데아 ", "파라데아 ",
    "가라르", "알로라", "히스이", "팔데아", "파라데아",
  ]) {
    if (base.startsWith(p)) {
      const stripped = base.slice(p.length).trim();
      if (tryName(stripped) !== undefined) return tryName(stripped);
    }
  }

  const trainer = base.match(/^(.+?)의\s+(.+)$/);
  if (trainer) {
    const inner = trainer[2].trim();
    if (tryName(inner) !== undefined) return tryName(inner);
    const innerStripped = inner
      .replace(/\s*\([^)]*\)\s*$/, "")
      .replace(/\s+(ex|V|VMAX|VSTAR|VUNION|GX|BREAK)\s*$/i, "")
      .trim();
    if (tryName(innerStripped) !== undefined) return tryName(innerStripped);
    for (const p of ["메가 ", "가라르 ", "알로라 ", "히스이 ", "팔데아 "]) {
      if (innerStripped.startsWith(p)) {
        const reg = innerStripped.slice(p.length).trim();
        if (tryName(reg) !== undefined) return tryName(reg);
      }
    }
  }

  base = base.replace(/\s+(ex|V|VMAX|GX|BREAK)\s*$/i, "").trim();
  return tryName(base) ?? null;
}

function cardSpriteUrl(cardName) {
  if (!cardName) return null;
  const tryName = (n) => slugMap[n];
  const direct = tryName(cardName);
  if (direct) return `slug:${direct}`;

  const stripped = cardName
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s+(ex|V|VMAX|VSTAR|VUNION|GX|BREAK|EX)\s*$/i, "")
    .trim();
  const slug = tryName(stripped);
  if (slug) return `slug:${slug}`;

  const trainer = stripped.match(/^(.+?)의\s+(.+)$/);
  if (trainer) {
    const inner = trainer[2].trim();
    if (tryName(inner)) return `slug:${tryName(inner)}`;
    const innerStripped = inner
      .replace(/\s*\([^)]*\)\s*$/, "")
      .replace(/\s+(ex|V|VMAX|VSTAR|VUNION|GX|BREAK|EX)\s*$/i, "")
      .trim();
    if (tryName(innerStripped)) return `slug:${tryName(innerStripped)}`;
  }
  return null;
}

// Walk all cards
const setsDir = "src/lib/sets";
const setFiles = fs.readdirSync(setsDir).filter((f) => f.endsWith(".ts") && f !== "index.ts");
const allCardNames = new Map();
let totalEntries = 0;
for (const f of setFiles) {
  const c = fs.readFileSync(path.join(setsDir, f), "utf8");
  for (const m of c.matchAll(/\{\s*id:\s*"([^"]+)",[^}]*name:\s*"([^"]+)",\s*rarity:\s*"([^"]+)"/g)) {
    const [, id, name, rarity] = m;
    totalEntries++;
    if (!allCardNames.has(name)) allCardNames.set(name, { ids: [], rarities: new Set() });
    allCardNames.get(name).ids.push(id);
    allCardNames.get(name).rarities.add(rarity);
  }
}

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
const isNonPokemon = (n) => NON_POKEMON_KEYWORDS.some((k) => n.includes(k));

let okSlug = 0;
let okDex = 0;
let nonPok = 0;
const stillMissing = [];
for (const [name, info] of allCardNames) {
  if (cardSpriteUrl(name)) {
    okSlug++;
    continue;
  }
  if (lookupDex(name) !== null) {
    okDex++;
    continue;
  }
  if (isNonPokemon(name)) {
    nonPok++;
    continue;
  }
  stillMissing.push({ name, ids: info.ids, rarities: [...info.rarities] });
}

console.log("=== POST-FALLBACK 통계 ===");
console.log(`총 entries: ${totalEntries}`);
console.log(`unique names: ${allCardNames.size}`);
console.log(`PS slug 매칭 (prefix strip 포함): ${okSlug}`);
console.log(`dex 매칭 (prefix strip 포함): ${okDex}`);
console.log(`도트 캐릭터화 가능: ${okSlug + okDex} (${((okSlug + okDex) / allCardNames.size * 100).toFixed(1)}%)`);
console.log(`non-Pokemon 추정 (트레이너/도구): ${nonPok}`);
console.log(`여전히 MISSING: ${stillMissing.length}`);

if (process.argv.includes("--list")) {
  console.log("");
  console.log("=== 여전히 MISSING (전체) ===");
  for (const { name, ids, rarities } of stillMissing) {
    console.log(`  "${name}"  ids:${ids[0]}${ids.length > 1 ? "+" + (ids.length - 1) : ""}  [${rarities.join("/")}]`);
  }
}
if (process.argv.includes("--regional")) {
  const regions = ["가라르", "알로라", "히스이", "팔데아", "파라데아"];
  console.log("");
  console.log("=== 지역폼 missing ===");
  for (const { name, ids } of stillMissing) {
    if (regions.some((r) => name.startsWith(r))) {
      console.log(`  "${name}"  ids:${ids[0]}`);
    }
  }
}
if (process.argv.includes("--save")) {
  fs.writeFileSync("scripts/_missing-full.txt",
    stillMissing.map(({ name, ids, rarities }) =>
      `${name}\t${ids[0]}\t${rarities.join("/")}\t${ids.length}`
    ).join("\n")
  );
  console.log("Saved scripts/_missing-full.txt");
}
