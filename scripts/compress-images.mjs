// Shrink oversized product images under public/images/sets to sensible sizes
// (max 1400px wide, quality 85) so mobile users don't wait for 8 MB hero art.
import sharp from "sharp";
import { readFileSync, writeFileSync, statSync, renameSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const targets = [
  { path: "public/images/sets/m2a/box.png", width: 1400 },
  { path: "public/images/sets/m2a/pack.png", width: 1000 },
  { path: "public/images/sets/m2/box.png", width: 1400 },
  { path: "public/images/sets/m2/pack.png", width: 1000 },
  { path: "public/images/sets/sv8/box.jpg", width: 1400 },
  { path: "public/images/sets/sv8/pack.png", width: 1000 },
  { path: "public/images/common/card-back.jpg", width: 700 },
  { path: "public/images/sets/sv2a/box.png", width: 1400 },
  { path: "public/images/sets/sv2a/pack.png", width: 900 },
  { path: "public/images/sets/sv5a/box.png", width: 900 },
  { path: "public/images/sets/sv5a/pack.png", width: 900 },
  { path: "public/images/sets/sv8a/box.png", width: 900 },
  { path: "public/images/sets/sv8a/pack.png", width: 900 },
];

for (const t of targets) {
  const abs = resolve(root, t.path);
  try {
    const before = statSync(abs).size;
    const input = readFileSync(abs);
    const meta = await sharp(input).metadata();
    if (!meta.width || meta.width <= t.width + 50 && before < 500 * 1024) {
      console.log(
        `skip  ${t.path.padEnd(42)} ${meta.width}x${meta.height} ${(before / 1024).toFixed(0)}KB`
      );
      continue;
    }
    const isJpg = t.path.endsWith(".jpg") || t.path.endsWith(".jpeg");
    const pipeline = sharp(input).resize({
      width: t.width,
      withoutEnlargement: true,
    });
    const out = isJpg
      ? await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer()
      : await pipeline.png({ quality: 85, compressionLevel: 9 }).toBuffer();
    writeFileSync(abs + ".tmp", out);
    renameSync(abs + ".tmp", abs);
    const after = statSync(abs).size;
    console.log(
      `ok    ${t.path.padEnd(42)} ${meta.width}x${meta.height} → ${t.width}px, ${(before / 1024).toFixed(0)}KB → ${(after / 1024).toFixed(0)}KB`
    );
  } catch (err) {
    console.error(`fail  ${t.path}:`, err.message);
  }
}
