// Pixel-level white-background removal for retail box product photos.
// Reads RGBA, sets alpha to 0 for near-white pixels, writes a .png
// (replacing .webp/.jpg with transparent .png so the box floats cleanly
// on the dark app background).
import sharp from "sharp";
import { readFileSync, writeFileSync, unlinkSync, statSync } from "node:fs";
import { dirname, basename, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Files to process; output is always .png next to the input.
const targets = [
  "public/images/sets/sv8a/box.jpg",
];

// Near-white threshold — pixels with r,g,b all above this become transparent.
const WHITE_CUTOFF = 238;

for (const rel of targets) {
  const abs = resolve(root, rel);
  try {
    const before = statSync(abs).size;
    const { data, info } = await sharp(readFileSync(abs))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let wiped = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i],
        g = data[i + 1],
        b = data[i + 2];
      if (r >= WHITE_CUTOFF && g >= WHITE_CUTOFF && b >= WHITE_CUTOFF) {
        data[i + 3] = 0;
        wiped++;
      }
    }

    const outPath = abs.replace(/\.(webp|jpe?g)$/i, ".png");
    await sharp(data, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .png({ compressionLevel: 9, quality: 90 })
      .toFile(outPath);

    // If the output path differs from input, remove the original.
    if (outPath !== abs) {
      try {
        unlinkSync(abs);
      } catch {}
    }
    const after = statSync(outPath).size;
    const pct = ((wiped / (data.length / 4)) * 100).toFixed(1);
    console.log(
      `ok  ${rel.padEnd(35)} → ${basename(outPath)}  alpha-cleared ${pct}%  ${(before / 1024).toFixed(0)}KB → ${(after / 1024).toFixed(0)}KB`
    );
  } catch (err) {
    console.error(`fail ${rel}: ${err.message}`);
  }
}
