// 신규 6팩(s4a / s6a / s7r / s8ap / s8b / s9a) 카드 데이터 컨버터.
//
// 사용법:
//   node scripts/convert_new6.mjs                  # 모든 _recon.json 처리
//   node scripts/convert_new6.mjs s4a s6a          # 일부 팩만
//   node scripts/convert_new6.mjs --dry            # 결과 미리보기 (파일 미작성)
//
// 입력: scripts/data/<setcode>/_recon.json
// 출력: src/lib/sets/<setcode>.ts (cards 배열 + totalCards 만 갱신)
//   정상 처리되려면 setcode TS 파일이 이미 존재해야 함 (이번 턴에 골격 작성됨).
//
// _recon.json 형식 (recon 에이전트가 생성):
// {
//   "code": "s4a",                                                // SetCode
//   "name": "샤이니스타 V",                                        // 한국 정발명
//   "subtitle": "확장팩 · SHINY STAR V",                           // (선택) subtitle 갱신
//   "releaseDate": "2020-12-04",                                   // (선택) 정확한 KR 발매일
//   "totalCards": 190,                                             // 메인+시크릿 합계
//   "pokellectorFolder": "294",                                    // (선택) image URL 빌드용
//   "imagePattern": "https://den-cards.pokellector.com/294/<slug>.S4A.<num>.<id>.png",
//   "cards": [
//     {
//       "number": "001",                                           // 한국판 카드 번호 (canonical)
//       "name": "이상해씨",                                         // 한국 정발 카드명
//       "rarity": "C",                                             // C/U/R/RR/AR/SR/SAR/UR (S 시대는 MUR/MA 없음)
//       "imageUrl": "https://den-cards.pokellector.com/294/Bulbasaur.S4A.1.12345.png",
//       "type": "Grass"                                            // (선택) 속성 — recon 에이전트가 채움
//     },
//     ...
//   ]
// }
//
// rarity 매핑 (recon 에이전트가 사전 변환해서 enum 값으로 들어와야 함):
//   V  → RR        VMAX → RR        VSTAR → RR
//   HR → UR        UR (gold) → UR
//   AR (Character Rare) → AR
//   SR (V/VMAX SR) → SR
//   SAR / CSR (Character SR) → SAR
//   기존 그대로: C/U/R
//
// 주의:
// - recon 에이전트가 이미지 URL 을 검증해서 _recon.json 에 넣어야 함 (placeholder 금지).
// - 카드 누락 / 깨진 이미지 발견 시 recon 단계에서 보고 — 이 컨버터는 "주어진 데이터" 만 통과.
// - 속성(type) 은 향후 카드 ↔ 속성 매핑 테이블(card_types) 시드 갱신 시 사용.

import { readFile, writeFile, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const ALL_CODES = ["s4a", "s6a", "s7r", "s8ap", "s8b", "s9a"];

// CLI 인자.
const args = process.argv.slice(2);
const dry = args.includes("--dry");
const targets = args.filter((a) => !a.startsWith("--"));
const codes = targets.length ? targets : ALL_CODES;

// 사용 가능한 rarity (S 시대 매핑 후).
const VALID_RARITY = new Set(["C", "U", "R", "RR", "AR", "SR", "SAR", "UR"]);

let processed = 0;
let skipped = 0;
const issues = [];

for (const code of codes) {
  if (!ALL_CODES.includes(code)) {
    console.error(`✗ ${code}: 지원되지 않는 코드 (가능: ${ALL_CODES.join(", ")})`);
    skipped += 1;
    continue;
  }

  const reconPath = join(ROOT, "scripts", "data", code, "_recon.json");
  const setTsPath = join(ROOT, "src", "lib", "sets", `${code}.ts`);

  if (!existsSync(reconPath)) {
    console.log(`- ${code}: _recon.json 없음 — recon 에이전트 대기 중. skip`);
    skipped += 1;
    continue;
  }

  if (!existsSync(setTsPath)) {
    console.error(`✗ ${code}: ${setTsPath} 없음. 골격 파일이 먼저 있어야 함.`);
    skipped += 1;
    continue;
  }

  const recon = JSON.parse(await readFile(reconPath, "utf8"));
  if (recon.code !== code) {
    console.error(`✗ ${code}: _recon.json code 필드(${recon.code})가 폴더와 불일치`);
    skipped += 1;
    continue;
  }

  // 검증.
  const cards = recon.cards ?? [];
  if (!Array.isArray(cards) || cards.length === 0) {
    issues.push(`${code}: cards 비어 있음`);
  }
  for (const c of cards) {
    if (!c.number || !c.name || !c.rarity || !c.imageUrl) {
      issues.push(`${code} #${c.number ?? "?"}: 필수 필드 누락 (number/name/rarity/imageUrl)`);
    }
    if (c.rarity && !VALID_RARITY.has(c.rarity)) {
      issues.push(`${code} #${c.number}: 잘못된 rarity "${c.rarity}" (허용: ${[...VALID_RARITY].join("/")})`);
    }
  }
  if (recon.totalCards && recon.totalCards !== cards.length) {
    issues.push(`${code}: totalCards(${recon.totalCards}) ≠ cards.length(${cards.length})`);
  }

  // 카드 직렬화. type 필드는 의도적으로 생략 — 기존 시스템 (m4/sv5a/...) 이
  // resolveCardType (이름 → 한글 WildType) 로 동적 변환하고, card_types DB 시드도
  // 그 함수 결과를 dump 함. recon JSON 의 영문 type ("Grass"/"Fire"/...) 은
  // 시드 마이그레이션 단계에서 사용 (선택적 검증용) — Card interface 에는 미사용.
  const serializedCards = cards
    .map((c) => {
      return `    { id: "${code}-${c.number}", setCode: "${code}", number: "${c.number}", name: ${JSON.stringify(c.name)}, rarity: "${c.rarity}", imageUrl: ${JSON.stringify(c.imageUrl)} },`;
    })
    .join("\n");

  // 기존 TS 파일 읽고 cards 배열만 교체.
  const tsRaw = await readFile(setTsPath, "utf8");

  // cards: [ ... ] 블록 교체. 단순 정규식으로 대체 (set 파일 구조 단순).
  const cardsBlockRx = /cards:\s*\[[\s\S]*?\n\s*\],?/m;
  if (!cardsBlockRx.test(tsRaw)) {
    console.error(`✗ ${code}: cards: [...] 블록을 찾지 못함. 골격 파일 손상 가능성.`);
    skipped += 1;
    continue;
  }

  const newCardsBlock = `cards: [\n${serializedCards}\n  ],`;
  let updated = tsRaw.replace(cardsBlockRx, newCardsBlock);

  // totalCards 도 갱신.
  updated = updated.replace(
    /totalCards:\s*\d+,(\s*\/\/[^\n]*)?/,
    `totalCards: ${cards.length},`
  );

  if (dry) {
    console.log(`✓ ${code}: ${cards.length}장 — dry-run (파일 미작성)`);
  } else {
    await writeFile(setTsPath, updated, "utf8");
    console.log(`✓ ${code}: ${cards.length}장 → ${setTsPath.replace(ROOT, ".")}`);
  }
  processed += 1;
}

console.log("─".repeat(72));
console.log(`처리 ${processed} / 스킵 ${skipped} / 이슈 ${issues.length}`);
if (issues.length) {
  console.log("\n⚠ 이슈:");
  for (const i of issues) console.log("  -", i);
  process.exit(issues.length > 0 ? 1 : 0);
}
