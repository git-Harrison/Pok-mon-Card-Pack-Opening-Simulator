#!/usr/bin/env node
// _image-fixes.json 의 to.jp_number 를 카드 TS 파일의 pk() 두 번째
// 인자로 박아 KR↔JP 트레이너 swap 으로 깨진 이미지 URL 을 정상화.
//
// 카드의 KR 번호(`number` 필드)는 정렬 / 표시용으로 유지하고, pk()
// 호출 시점에만 JP 번호 사용. 카드 ID (sv10-091) 는 KR 기준 그대로.
//
//   node scripts/apply-image-fixes.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const FIXES = JSON.parse(
  readFileSync(join(ROOT, "scripts", "data", "_image-fixes.json"), "utf8")
);

const bySet = {};
for (const f of FIXES.fixes) {
  const setCode = f.id.split("-").slice(0, -1).join("-");
  (bySet[setCode] ??= []).push(f);
}

let totalApplied = 0;
let totalMissed = 0;

for (const [setCode, fixes] of Object.entries(bySet)) {
  const path = join(ROOT, "src", "lib", "sets", `${setCode}.ts`);
  let src = readFileSync(path, "utf8");
  let applied = 0;
  for (const fix of fixes) {
    const jpNum = fix.to.jp_number;
    const slug = fix.to.slug;
    const assetId = fix.to.asset_id;

    // 매칭 라인: { id: "sv10-087", ..., imageUrl: pk("slug", "087", "id") }
    // pk 호출 시 두 번째 인자를 jpNum 으로 교체.
    const lineRx = new RegExp(
      `(\\{\\s*id:\\s*"${fix.id}",[^}]*imageUrl:\\s*\\w+\\(\\s*"${slug}"\\s*,\\s*")[^"]+("\\s*,\\s*"${assetId}"\\s*\\))`
    );
    const m = src.match(lineRx);
    if (!m) {
      console.log(`  ❌ ${fix.id}: 라인 매칭 실패`);
      totalMissed++;
      continue;
    }
    src = src.replace(lineRx, `$1${jpNum}$2`);
    applied++;
  }
  if (applied > 0) {
    writeFileSync(path, src);
  }
  console.log(`  ${setCode}: ${applied}/${fixes.length} 적용`);
  totalApplied += applied;
}

console.log(`\n총 ${totalApplied}건 적용, ${totalMissed}건 미적용`);
