#!/usr/bin/env node
// scripts/data/<code>/cards.json 을 읽어서 src/lib/sets/<code>.ts 를
// 생성. 기존 m2/sv8 패턴 그대로.
//
//   node scripts/build-set-from-json.mjs sv10
//
// JSON 형식:
//   {
//     code, name, subtitle, releaseDate,
//     cardsPerPack, packsPerBox, totalCards,
//     pokellector_folder, pokellector_set_code,
//     primaryColor (옵션), accentColor (옵션),
//     slots (옵션 — 미지정 시 5슬롯 디폴트),
//     cards: [{ number, name_ko, rarity, pokellector_slug,
//                pokellector_asset_id }, ...]
//   }

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const SET_CODE = process.argv[2];
if (!SET_CODE) {
  console.error("usage: node scripts/build-set-from-json.mjs <code>");
  process.exit(1);
}

const SRC_JSON = join(ROOT, "scripts", "data", SET_CODE, "cards.json");
const DST_TS = join(ROOT, "src", "lib", "sets", `${SET_CODE}.ts`);

const data = JSON.parse(readFileSync(SRC_JSON, "utf8"));

// 5장/팩 디폴트 슬롯. 30팩/박스 SV-시리즈 표준 분포.
const DEFAULT_5SLOT = [
  { label: "C 1", weights: { C: 100 } },
  { label: "C 2", weights: { C: 100 } },
  { label: "C/U", weights: { C: 55, U: 45 } },
  { label: "U/R", weights: { U: 70, R: 30 } },
  {
    label: "Hit",
    weights: { R: 30, RR: 30, AR: 10, SR: 7, SAR: 5, UR: 1 },
  },
];

const slots = data.slots ?? DEFAULT_5SLOT;

const folder = data.pokellector_folder;
const setCodeUpper = data.pokellector_set_code ?? SET_CODE.toUpperCase();

const cardLines = data.cards
  .map((c) => {
    const slug = c.pokellector_slug;
    const num = c.number; // 한국판 번호 (canonical)
    const id = c.pokellector_asset_id;
    const name = (c.name_ko ?? c.name_en ?? "").replace(/"/g, '\\"');
    return `    { id: "${SET_CODE}-${num}", setCode: "${SET_CODE}", number: "${num}", name: "${name}", rarity: "${c.rarity}", imageUrl: pk("${slug}", "${num}", "${id}") },`;
  })
  .join("\n");

const slotLines = slots
  .map((s) => {
    const weightStr = Object.entries(s.weights)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
    return `    { label: "${s.label}", weights: { ${weightStr} } },`;
  })
  .join("\n");

const ts = `import type { SetInfo } from "../types";

// Pokellector folder ${folder} — ${data.name} (${data.totalCards} cards).
// Pattern: https://den-cards.pokellector.com/${folder}/<slug>.${setCodeUpper}.<num>.<id>.png
// 한국판 카드 번호를 canonical 로 사용 — 일본판과 일부 swap (KR ↔ JP
// number 가 다른 트레이너 카드들 등). slug + asset_id 가 한국판 번호에
// 정확히 매칭되는 이미지를 가리키도록 에이전트가 검증.
// Pokellector URL 은 unpadded number ("1" not "001") 만 받음.
const pk = (slug: string, num: string, id: string) =>
  \`https://den-cards.pokellector.com/${folder}/\${slug}.${setCodeUpper}.\${parseInt(num, 10)}.\${id}.png\`;

export const ${SET_CODE}: SetInfo = {
  code: "${SET_CODE}",
  name: "${data.name}",
  subtitle: "${data.subtitle}",
  releaseDate: "${data.releaseDate}",
  cardsPerPack: ${data.cardsPerPack},
  packsPerBox: ${data.packsPerBox},
  totalCards: ${data.totalCards},
  primaryColor: "${data.primaryColor ?? "#b91c1c"}",
  accentColor: "${data.accentColor ?? "#fca5a5"}",
  boxImage: "/images/sets/${SET_CODE}/box.webp",
  packImage: "/images/sets/${SET_CODE}/pack.webp",
  slots: [
${slotLines}
  ],
  cards: [
${cardLines}
  ],
};
`;

writeFileSync(DST_TS, ts);
console.log(`✓ ${DST_TS}`);
console.log(`  ${data.cards.length} cards · ${slots.length} slots`);
