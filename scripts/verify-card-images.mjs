#!/usr/bin/env node
// 카드 imageUrl 들이 실제로 살아있는지 HEAD 요청으로 검증.
//   node scripts/verify-card-images.mjs [setCode...]
// 인자 없으면 신규 4세트 (sv10/m1l/m1s/m3) 만 체크.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const SETS_TO_CHECK = process.argv.slice(2);
const DEFAULT_SETS = ["sv10", "m1l", "m1s", "m3"];
const targets = SETS_TO_CHECK.length ? SETS_TO_CHECK : DEFAULT_SETS;

const RX_CARD = /\{\s*id:\s*"([^"]+)",\s*setCode:\s*"([^"]+)",\s*number:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*rarity:\s*"([^"]+)",\s*imageUrl:\s*(\w+\(\s*"[^"]+"\s*,\s*"[^"]+"\s*,\s*"[^"]+"\s*\))/g;
const RX_PK = /\w+\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/;
const RX_FOLDER = /https:\/\/den-cards\.pokellector\.com\/(\d+)\//;

const CONCURRENCY = 12;

async function head(url) {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, status: 0, err: String(e?.message ?? e) };
  }
}

async function checkSet(setCode) {
  const path = join(ROOT, "src", "lib", "sets", `${setCode}.ts`);
  const src = readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // Only strip "//" line comments — NOT "://" inside URLs.
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const folderMatch = src.match(RX_FOLDER);
  const folder = folderMatch?.[1];
  const setCodeUpper = setCode.toUpperCase();

  const cards = [];
  for (const m of src.matchAll(RX_CARD)) {
    const expr = m[6].trim();
    const pkMatch = expr.match(RX_PK);
    if (!pkMatch) continue;
    const [, slug, num, id] = pkMatch;
    // Pokellector URL 은 unpadded number — pk() 와 동일하게 strip.
    const url = `https://den-cards.pokellector.com/${folder}/${slug}.${setCodeUpper}.${parseInt(num, 10)}.${id}.png`;
    cards.push({ id: m[1], number: m[3], name: m[4], rarity: m[5], slug, url });
  }

  // 동시 요청 제한
  const results = [];
  for (let i = 0; i < cards.length; i += CONCURRENCY) {
    const batch = cards.slice(i, i + CONCURRENCY);
    const got = await Promise.all(
      batch.map(async (c) => ({ ...c, ...(await head(c.url)) }))
    );
    results.push(...got);
    process.stdout.write(`\r  ${setCode}: ${results.length}/${cards.length}`);
  }
  process.stdout.write("\n");
  return results;
}

const broken = [];
for (const setCode of targets) {
  console.log(`\n━━ ${setCode} ━━`);
  const results = await checkSet(setCode);
  const bad = results.filter((r) => !r.ok);
  for (const b of bad) {
    broken.push(b);
    console.log(`  ❌ ${b.id} ${b.name} (${b.rarity}) — ${b.status} — ${b.url}`);
  }
  console.log(`  ${results.length - bad.length}/${results.length} OK`);
}

console.log(`\n\n총 깨진 이미지: ${broken.length}건`);
if (broken.length > 0) {
  console.log("(JSON 출력 → scripts/data/_broken-images.json)");
  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync(join(ROOT, "scripts", "data"), { recursive: true });
  writeFileSync(
    join(ROOT, "scripts", "data", "_broken-images.json"),
    JSON.stringify(broken, null, 2)
  );
}
