#!/usr/bin/env node
// 세트 데이터 정적 감사 — 모든 src/lib/sets/*.ts 를 텍스트 파싱해서
// 정합성 검사. 외부 의존성 없이 Node 만으로 실행.
//
//   node scripts/audit-sets.mjs
//
// 검사 항목:
//   * 카드 ID / 번호 중복 (set 내 + cross-set)
//   * id 가 ${setCode}-${number} 패턴인지
//   * setCode 필드가 set 의 code 와 일치하는지
//   * rarity 가 허용된 값인지 (C/U/R/RR/AR/SR/SAR/MA/MUR/UR)
//   * cardsPerPack === slots.length
//   * 슬롯 가중치의 모든 rarity 가 set 의 cards 안에 실제로 존재하는지
//   * totalCards === cards.length
//   * imageUrl 함수 호출이 비어 있지 않은지
//   * 박스/팩 이미지 파일이 public/ 안에 실제 존재하는지
//   * 카드명 공백·중복·이상한 문자

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SETS_DIR = join(ROOT, "src", "lib", "sets");
const PUBLIC_DIR = join(ROOT, "public");

const ALLOWED_RARITIES = new Set([
  "C", "U", "R", "RR", "AR", "SR", "SAR", "MA", "MUR", "UR",
]);

const SET_CODES = ["m2a", "m2", "sv8", "sv2a", "sv5a", "sv8a", "sv10", "m1l", "m1s", "m3"];

// --- 파서 -------------------------------------------------

const RX_CODE        = /code:\s*"([^"]+)"/;
const RX_NAME        = /name:\s*"([^"]+)"/;
const RX_PER_PACK    = /cardsPerPack:\s*(\d+)/;
const RX_PER_BOX     = /packsPerBox:\s*(\d+)/;
const RX_TOTAL       = /totalCards:\s*(\d+)/;
const RX_BOX_IMAGE   = /boxImage:\s*"([^"]+)"/;
const RX_PACK_IMAGE  = /packImage:\s*"([^"]+)"/;
// 카드 라인: { id: "...", setCode: "...", number: "...", name: "...", rarity: "...", imageUrl: ...
const RX_CARD = /\{\s*id:\s*"([^"]+)",\s*setCode:\s*"([^"]+)",\s*number:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*rarity:\s*"([^"]+)",\s*imageUrl:\s*([^,}]+(?:\([^)]*\))?)/g;
// 슬롯 가중치 — slots: [ { label: "...", weights: { A: n, B: n, ... } }, ... ]
// 다중 라인 슬롯은 inner `}` 뒤에 trailing comma 가 붙는 경우가 있어
// outer `}` 직전에 `[\s,]*` 로 받음.
const RX_SLOT = /\{\s*label:\s*"([^"]+)",\s*weights:\s*\{([^}]*)\}[\s,]*\}/g;
const RX_WEIGHT_ENTRY = /([A-Z]+):\s*[\d.]+/g;

function parseSet(filePath) {
  const raw = readFileSync(filePath, "utf8");
  // 슬롯 정의에 주석이 끼어있는 케이스가 있어서 // line comment 와
  // /* block comment */ 둘 다 제거 후 파싱한다.
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  const m = (rx) => src.match(rx)?.[1];
  const meta = {
    code: m(RX_CODE),
    name: m(RX_NAME),
    cardsPerPack: Number(m(RX_PER_PACK)),
    packsPerBox: Number(m(RX_PER_BOX)),
    totalCards: Number(m(RX_TOTAL)),
    boxImage: m(RX_BOX_IMAGE),
    packImage: m(RX_PACK_IMAGE),
  };

  const slots = [];
  for (const sm of src.matchAll(RX_SLOT)) {
    const rarities = [];
    for (const wm of sm[2].matchAll(RX_WEIGHT_ENTRY)) rarities.push(wm[1]);
    slots.push({ label: sm[1], rarities });
  }

  const cards = [];
  for (const cm of src.matchAll(RX_CARD)) {
    cards.push({
      id: cm[1],
      setCode: cm[2],
      number: cm[3],
      name: cm[4],
      rarity: cm[5],
      imageUrlExpr: cm[6].trim(),
    });
  }

  return { ...meta, slots, cards };
}

// --- 검사 ---------------------------------------------------

const issues = [];
const warnings = [];

function fail(msg) { issues.push(msg); }
function warn(msg) { warnings.push(msg); }

const allSets = SET_CODES.map((code) => {
  const path = join(SETS_DIR, `${code}.ts`);
  if (!existsSync(path)) {
    fail(`[set-file-missing] ${path}`);
    return null;
  }
  return { code, path, ...parseSet(path) };
}).filter(Boolean);

const globalIds = new Map(); // id -> setCode (cross-set duplicate check)

for (const s of allSets) {
  // 메타 자기 일관성
  if (s.code !== s.code) fail(`[code-mismatch] ${s.path}`);
  if (!s.boxImage)  fail(`[meta-missing] ${s.code}: boxImage 누락`);
  if (!s.packImage) fail(`[meta-missing] ${s.code}: packImage 누락`);
  if (!Number.isFinite(s.cardsPerPack)) fail(`[meta-missing] ${s.code}: cardsPerPack`);
  if (!Number.isFinite(s.packsPerBox))  fail(`[meta-missing] ${s.code}: packsPerBox`);
  if (!Number.isFinite(s.totalCards))   fail(`[meta-missing] ${s.code}: totalCards`);

  if (s.slots.length !== s.cardsPerPack) {
    fail(`[slots-mismatch] ${s.code}: slots(${s.slots.length}) ≠ cardsPerPack(${s.cardsPerPack})`);
  }

  if (s.cards.length !== s.totalCards) {
    fail(`[card-count] ${s.code}: cards(${s.cards.length}) ≠ totalCards(${s.totalCards})`);
  }

  // 박스/팩 이미지 파일 존재 (public/)
  for (const [field, p] of [["boxImage", s.boxImage], ["packImage", s.packImage]]) {
    if (!p) continue;
    const local = p.startsWith("/") ? join(PUBLIC_DIR, p.slice(1)) : null;
    if (local && !existsSync(local)) {
      fail(`[image-missing] ${s.code}.${field}: ${p} (파일 없음)`);
    }
  }

  // 카드 검사
  const idsInSet = new Set();
  const numsInSet = new Set();
  const namesInSet = new Map(); // 카드명: 횟수
  const rarityCounts = {};
  for (const c of s.cards) {
    // setCode 일치
    if (c.setCode !== s.code) {
      fail(`[setCode-mismatch] ${c.id}: setCode "${c.setCode}" ≠ set.code "${s.code}"`);
    }
    // id 패턴
    if (c.id !== `${s.code}-${c.number}`) {
      fail(`[id-pattern] ${c.id}: 패턴 "${s.code}-${c.number}" 불일치`);
    }
    // 중복
    if (idsInSet.has(c.id)) fail(`[dup-id] ${s.code}: ${c.id} 중복`);
    idsInSet.add(c.id);
    if (numsInSet.has(c.number)) fail(`[dup-number] ${s.code}: number ${c.number} 중복`);
    numsInSet.add(c.number);

    // 이름 중복은 정상일 수 있음 (다른 일러스트). 정보로만.
    namesInSet.set(c.name, (namesInSet.get(c.name) ?? 0) + 1);

    // rarity
    if (!ALLOWED_RARITIES.has(c.rarity)) {
      fail(`[bad-rarity] ${c.id} (${c.name}): "${c.rarity}" 는 허용되지 않은 등급`);
    }
    rarityCounts[c.rarity] = (rarityCounts[c.rarity] ?? 0) + 1;

    // imageUrl 표현식
    if (!c.imageUrlExpr || c.imageUrlExpr === "undefined" || c.imageUrlExpr === "null") {
      fail(`[image-expr] ${c.id}: imageUrl 표현식 비어있음`);
    }

    // 이름 sanity (영문 그대로 들어가있는 카드 — 한글 로컬화 누락 가능)
    if (/^[A-Za-z][\w\s'.-]*$/.test(c.name)) {
      warn(`[name-en] ${c.id}: 영문 이름 그대로 — "${c.name}" (한글 미적용?)`);
    }

    // cross-set 중복
    if (globalIds.has(c.id)) {
      fail(`[xs-dup-id] ${c.id} 중복: ${globalIds.get(c.id)} ↔ ${s.code}`);
    } else {
      globalIds.set(c.id, s.code);
    }
  }
  s.rarityCounts = rarityCounts;

  // 슬롯의 rarity 가 실제 카드에 존재하는지
  const presentRarities = new Set(s.cards.map((c) => c.rarity));
  for (let i = 0; i < s.slots.length; i++) {
    const slot = s.slots[i];
    for (const r of slot.rarities) {
      if (!ALLOWED_RARITIES.has(r)) {
        fail(`[slot-bad-rarity] ${s.code} slot[${i}] "${slot.label}": ${r} 는 허용되지 않은 등급`);
      } else if (!presentRarities.has(r)) {
        fail(`[slot-orphan-rarity] ${s.code} slot[${i}] "${slot.label}": ${r} 등급 카드가 0장 — 뽑기 실패`);
      }
    }
  }

  // 동일 카드명 다중 등장 (alt-art / 일러스트 변형 정상이지만 표시)
  for (const [n, count] of namesInSet) {
    if (count > 3) warn(`[name-many] ${s.code}: "${n}" 가 ${count}회 등장 (확인 권장)`);
  }
}

// index.ts 가 모든 세트를 등록했는지
const indexPath = join(SETS_DIR, "index.ts");
const indexSrc = readFileSync(indexPath, "utf8");
for (const s of allSets) {
  if (!indexSrc.includes(`import { ${s.code} }`)) {
    fail(`[index-import] index.ts 에 ${s.code} import 누락`);
  }
  if (!new RegExp(`SET_ORDER[\\s\\S]*?"${s.code}"`).test(indexSrc)) {
    fail(`[index-order] SET_ORDER 에 ${s.code} 누락`);
  }
}

// --- 리포트 -------------------------------------------------

let totalCards = 0;
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("   세트 데이터 정적 감사 리포트");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

for (const s of allSets) {
  totalCards += s.cards.length;
  const rs = Object.entries(s.rarityCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([r, n]) => `${r}:${n}`)
    .join(" · ");
  console.log(`  ${s.code.padEnd(5)} ${s.name}`);
  console.log(`        ${s.cards.length}장 · ${s.cardsPerPack}장/팩 · ${s.packsPerBox}팩/박스`);
  console.log(`        ${rs}`);
  console.log();
}
console.log(`  TOTAL: ${allSets.length}개 세트 / ${totalCards}장\n`);

console.log("━━ 발견된 오류 ━━");
if (issues.length === 0) {
  console.log("  (없음) ✅\n");
} else {
  for (const m of issues) console.log("  ❌ " + m);
  console.log(`\n  → ${issues.length}건\n`);
}

console.log("━━ 경고 (확인 권장) ━━");
if (warnings.length === 0) {
  console.log("  (없음) ✅\n");
} else {
  for (const m of warnings) console.log("  ⚠️  " + m);
  console.log(`\n  → ${warnings.length}건\n`);
}

process.exit(issues.length > 0 ? 1 : 0);
