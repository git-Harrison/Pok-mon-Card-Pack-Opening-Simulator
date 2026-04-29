// 일회용 — 신규 6팩 박스 PNG → WebP 변환 + public/images/sets/<code>/box.webp 배치.
//   node scripts/convert-new6-boxes.mjs
//
// 입력: C:\Users\USER\Desktop\신규 요청 포켓몬 box 이미지\<원본>.png
// 출력: public/images/sets/<setcode>/box.webp (q=82, max width 1024)

import { readFile, writeFile, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = "C:\\Users\\USER\\Desktop\\신규 요청 포켓몬 box 이미지";

// 입력 파일명 → SetCode 매핑.
const MAP = [
  { src: "샤이니스타v.png",                         code: "s4a"  },
  { src: "이브이히어로즈.png",                      code: "s6a"  },
  { src: "창공스트림.png",                          code: "s7r"  },
  { src: "소드&실드 확장팩 25주년 기념 컬렉션박스.png", code: "s8ap" },
  { src: "vmax클라이맥스.png",                      code: "s8b"  },
  { src: "양천의볼트태클.png",                      code: "s9a"  },
];

const fmt = (n) => `${(n / 1024).toFixed(1)}KB`;

let totalBefore = 0;
let totalAfter = 0;

for (const { src, code } of MAP) {
  const inPath = join(SRC, src);
  const outDir = join(ROOT, "public", "images", "sets", code);
  const outPath = join(outDir, "box.webp");

  const before = (await stat(inPath)).size;
  const buf = await readFile(inPath);
  const out = await sharp(buf)
    .resize({ width: 1024, withoutEnlargement: true })
    .webp({ quality: 82, effort: 6 })
    .toBuffer();
  await writeFile(outPath, out);
  const after = (await stat(outPath)).size;
  totalBefore += before;
  totalAfter += after;
  console.log(
    `${code.padEnd(6)} ${src.padEnd(48)} ${fmt(before).padStart(9)} → ${fmt(after).padStart(9)}  -${(
      (1 - after / before) * 100
    ).toFixed(1)}%`
  );
}

console.log("─".repeat(96));
console.log(
  `합계 ${fmt(totalBefore)} → ${fmt(totalAfter)}  ` +
    `절감 ${fmt(totalBefore - totalAfter)} (${(
      (1 - totalAfter / totalBefore) *
      100
    ).toFixed(1)}%)`
);
