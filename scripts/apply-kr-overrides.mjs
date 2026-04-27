#!/usr/bin/env node
// kr-name-overrides.json 의 verified 매핑을 카드 TS 파일에 적용.
//
// 안전 룰: 각 매핑은 (id 일치 AND 카드 파일의 name 이 entry.english 와
// 정확히 일치) 일 때만 적용. id 는 맞는데 name 이 이미 한글로 바뀌어
// 있거나 다른 영문이면 skip — 메타 노트의 "한국/영문 번호 불일치"
// 안전망.
//
//   node scripts/apply-kr-overrides.mjs           # dry-run (미리보기)
//   node scripts/apply-kr-overrides.mjs --apply   # 실제 파일 수정

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SETS_DIR = join(ROOT, "src", "lib", "sets");
const OVERRIDES = join(ROOT, "scripts", "data", "kr-name-overrides.json");

const APPLY = process.argv.includes("--apply");

const data = JSON.parse(readFileSync(OVERRIDES, "utf8"));
const verified = data.verified ?? {};

// 세트별로 grouping
const bySet = {};
for (const [id, entry] of Object.entries(verified)) {
  const setCode = id.split("-").slice(0, -1).join("-");
  (bySet[setCode] ??= []).push({ id, ...entry });
}

const RX_LINE = (id) =>
  new RegExp(
    `(\\{\\s*id:\\s*"${id}",[^}]*name:\\s*")([^"]+)("[^}]*\\})`,
    ""
  );

let appliedCount = 0;
let skippedCount = 0;
let mismatchCount = 0;
const skipped = [];
const mismatches = [];

for (const [setCode, entries] of Object.entries(bySet)) {
  const filePath = join(SETS_DIR, `${setCode}.ts`);
  let src = readFileSync(filePath, "utf8");
  let setApplied = 0;
  for (const e of entries) {
    const rx = RX_LINE(e.id);
    const m = src.match(rx);
    if (!m) {
      skipped.push(`${e.id}: 카드 라인 못 찾음`);
      skippedCount++;
      continue;
    }
    const currentName = m[2];
    if (currentName !== e.english) {
      // 이미 한글이거나 다른 영문 — 안전상 skip
      mismatches.push({
        id: e.id,
        expected_en: e.english,
        actual: currentName,
        proposed_kr: e.korean,
      });
      mismatchCount++;
      continue;
    }
    src = src.replace(rx, `$1${e.korean}$3`);
    setApplied++;
    appliedCount++;
  }
  if (APPLY && setApplied > 0) {
    writeFileSync(filePath, src);
  }
  console.log(
    `  ${setCode}: ${entries.length} 시도, ${setApplied} 적용 (${
      APPLY ? "WRITE" : "DRY"
    })`
  );
}

console.log();
console.log(`총 적용: ${appliedCount} / 시도 ${Object.keys(verified).length}`);
console.log(`스킵 (라인 없음): ${skippedCount}`);
console.log(`mismatch (영문명 불일치): ${mismatchCount}`);

if (mismatches.length > 0) {
  console.log("\n━━ 영문명 불일치 카드 (적용 안 됨) ━━");
  for (const m of mismatches.slice(0, 20)) {
    console.log(
      `  ${m.id}: expected "${m.expected_en}" vs actual "${m.actual}" (제안: ${m.proposed_kr})`
    );
  }
  if (mismatches.length > 20) console.log(`  ... 외 ${mismatches.length - 20}건`);
}

if (skipped.length > 0) {
  console.log("\n━━ 라인 못 찾은 카드 ━━");
  for (const s of skipped) console.log("  " + s);
}

if (!APPLY) {
  console.log("\n→ DRY RUN. --apply 로 실제 적용.");
}
