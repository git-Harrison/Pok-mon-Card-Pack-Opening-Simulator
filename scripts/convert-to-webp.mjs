// 일회용 — public/images/ 아래 모든 PNG/JPG → WebP 변환.
// q=82 / effort=6 — 품질/크기 트레이드오프 균형점. 카드/팩 아트는
// 시각적 손실 없이 30~60% 압축 가능. 변환 후 원본 삭제.
//
//   node scripts/convert-to-webp.mjs
//
// (실행되면 보고서 출력: 파일별 before/after 바이트, 합계 절감.)

import { readdir, stat, readFile, writeFile, unlink } from "node:fs/promises";
import { join, extname, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "public", "images");

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const RASTER = new Set([".png", ".jpg", ".jpeg"]);
const fmt = (n) => `${(n / 1024).toFixed(1)}KB`;

let totalBefore = 0;
let totalAfter = 0;
const rows = [];

for await (const file of walk(ROOT)) {
  const ext = extname(file).toLowerCase();
  if (!RASTER.has(ext)) continue;

  const before = (await stat(file)).size;
  const buf = await readFile(file);
  const out = await sharp(buf)
    .webp({ quality: 82, effort: 6 })
    .toBuffer();
  const target = join(dirname(file), basename(file, ext) + ".webp");
  await writeFile(target, out);
  await unlink(file);
  const after = (await stat(target)).size;
  totalBefore += before;
  totalAfter += after;
  rows.push({
    path: file.replace(ROOT, "").replace(/\\/g, "/"),
    before,
    after,
    pct: ((1 - after / before) * 100).toFixed(1),
  });
}

console.log("\nWebP 변환 결과");
console.log("─".repeat(72));
for (const r of rows) {
  console.log(
    `${r.path.padEnd(40)} ${fmt(r.before).padStart(8)} → ${fmt(r.after).padStart(8)}  -${r.pct}%`
  );
}
console.log("─".repeat(72));
console.log(
  `합계 ${fmt(totalBefore)} → ${fmt(totalAfter)}  ` +
    `절감 ${fmt(totalBefore - totalAfter)} (${(
      (1 - totalAfter / totalBefore) *
      100
    ).toFixed(1)}%)`
);
