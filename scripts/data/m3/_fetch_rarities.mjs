// Fetch Pokellector rarity for each card.

import fs from 'node:fs';
import path from 'node:path';

const slugs = JSON.parse(fs.readFileSync(path.resolve('scripts/data/m3/_pokellector_assets.json'), 'utf8'));

async function fetchRarity(num, slugPath) {
  const url = `https://www.pokellector.com/Munikis-Zero-Expansion/${slugPath}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0' },
    });
    if (!res.ok) return { number: num, error: `HTTP ${res.status}` };
    const html = await res.text();
    // try to find "Rarity:" pattern
    // Common HTML patterns: <strong>Rarity:</strong> Super Rare or Rarity: Super Rare
    const re = /Rarity:?\s*<\/(?:strong|b|span)>\s*([A-Za-z][A-Za-z\s]+?)(?:<|\n|\.)/i;
    const m = html.match(re);
    if (m) return { number: num, rarity: m[1].trim() };
    const re2 = /Rarity[^A-Za-z<]*([A-Za-z][A-Za-z\s]+?)(?:<|\n)/;
    const m2 = html.match(re2);
    if (m2) return { number: num, rarity: m2[1].trim() };
    return { number: num, rarity: null, html_sample: html.slice(html.indexOf('arity'), html.indexOf('arity')+200) };
  } catch (e) {
    return { number: num, error: String(e) };
  }
}

async function main() {
  const results = [];
  const concurrency = 8;
  let i = 0;
  async function worker() {
    while (i < slugs.length) {
      const idx = i++;
      const item = slugs[idx];
      const r = await fetchRarity(item.number, item.slugPath);
      results[idx] = r;
      console.log(`${item.number} -> ${r.rarity ?? r.error ?? 'NULL'}`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  fs.writeFileSync(path.resolve('scripts/data/m3/_pokellector_rarities.json'), JSON.stringify(results, null, 2));
  console.log(`Done. ${results.length} cards.`);
}
main();
