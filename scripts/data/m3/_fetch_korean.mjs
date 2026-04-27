// Fetch Korean card data from pokemoncard.co.kr for M3.
// URL pattern confirmed: https://pokemoncard.co.kr/cards/detail/BS2026002NNN where NNN = 001..117

import fs from 'node:fs';
import path from 'node:path';

const NUMS = Array.from({ length: 117 }, (_, i) => String(i + 1).padStart(3, '0'));

async function fetchOne(num) {
  const url = `https://pokemoncard.co.kr/cards/detail/BS2026002${num}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0' },
    });
    if (!res.ok) return { number: num, error: `HTTP ${res.status}` };
    const html = await res.text();
    // Korean name
    const nameMatch = html.match(/<span class="card-hp title">([^<]*)<\/span>/);
    const numMatch = html.match(/(\d{3})\/(\d{3})<span id="no_wrap_by_admin">\s*([A-Z\-x]+)\s*<\/span>/);
    const imgMatch = html.match(/M3_([0-9_a-z]+)\.png/);
    const setMatch = html.match(/MEGA 확장팩 「([^」]+)」/);
    return {
      number: num,
      name_ko: nameMatch ? nameMatch[1].trim() : null,
      kr_num: numMatch ? `${numMatch[1]}/${numMatch[2]}` : null,
      kr_rarity: numMatch ? numMatch[3].trim() : null,
      kr_image: imgMatch ? imgMatch[0] : null,
      kr_set: setMatch ? setMatch[1] : null,
    };
  } catch (e) {
    return { number: num, error: String(e) };
  }
}

async function main() {
  const results = [];
  const concurrency = 6;
  let i = 0;
  async function worker() {
    while (i < NUMS.length) {
      const idx = i++;
      const num = NUMS[idx];
      const r = await fetchOne(num);
      results[idx] = r;
      const status = r.error ? `ERR ${r.error}` : `${r.kr_num} ${r.kr_rarity} ${r.name_ko}`;
      console.log(`${num} -> ${status}`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  fs.writeFileSync(path.resolve('scripts/data/m3/_korean_data.json'), JSON.stringify(results, null, 2));
  const errors = results.filter(r => r.error || !r.name_ko);
  console.log(`\nDone. Total ${results.length}. Missing/errors: ${errors.length}`);
  if (errors.length) errors.forEach(e => console.log(`  ${e.number}: ${e.error || 'no name'}`));
}
main();
