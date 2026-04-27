// Fetch Pokellector individual card pages for M3 set and extract asset_ids.
// Output: scripts/data/m3/_pokellector_assets.json

import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('scripts/data/m3/_pokellector_assets.json');

// All 117 slugs (number -> "Slug-Card-N") from the set page listing
const slugs = [
  ['001', 'Spinarak-Card-1'],
  ['002', 'Ariados-Card-2'],
  ['003', 'Shaymin-Card-3'],
  ['004', 'Snivy-Card-4'],
  ['005', 'Servine-Card-5'],
  ['006', 'Serperior-Card-6'],
  ['007', 'Scatterbug-Card-7'],
  ['008', 'Spewpa-Card-8'],
  ['009', 'Vivillon-Card-9'],
  ['010', 'Rowlet-Card-10'],
  ['011', 'Dartrix-Card-11'],
  ['012', 'Decidueye-ex-Card-12'],
  ['013', 'Fletchinder-Card-13'],
  ['014', 'Talonflame-Card-14'],
  ['015', 'Salandit-Card-15'],
  ['016', 'Salazzle-ex-Card-16'],
  ['017', 'Turtonator-Card-17'],
  ['018', 'Seel-Card-18'],
  ['019', 'Dewgong-Card-19'],
  ['020', 'Staryu-Card-20'],
  ['021', 'Mega-Starmie-ex-Card-21'],
  ['022', 'Amaura-Card-22'],
  ['023', 'Aurorus-Card-23'],
  ['024', 'Volcanion-Card-24'],
  ['025', 'Shinx-Card-25'],
  ['026', 'Luxio-Card-26'],
  ['027', 'Luxray-Card-27'],
  ['028', 'Dedenne-Card-28'],
  ['029', 'Clefairy-Card-29'],
  ['030', 'Mega-Clefable-ex-Card-30'],
  ['031', 'Mawile-Card-31'],
  ['032', 'Espurr-Card-32'],
  ['033', 'Meowstic-Card-33'],
  ['034', 'Spritzee-Card-34'],
  ['035', 'Aromatisse-Card-35'],
  ['036', 'Nosepass-Card-36'],
  ['037', 'Probopass-Card-37'],
  ['038', 'Hippopotas-Card-38'],
  ['039', 'Hippowdon-Card-39'],
  ['040', 'Landorus-Card-40'],
  ['041', 'Binacle-Card-41'],
  ['042', 'Barbaracle-Card-42'],
  ['043', 'Tyrunt-Card-43'],
  ['044', 'Tyrantrum-Card-44'],
  ['045', 'Hawlucha-Card-45'],
  ['046', 'Mega-Zygarde-ex-Card-46'],
  ['047', 'Gastly-Card-47'],
  ['048', 'Haunter-Card-48'],
  ['049', 'Gengar-Card-49'],
  ['050', 'Skorupi-Card-50'],
  ['051', 'Drapion-Card-51'],
  ['052', 'Yveltal-ex-Card-52'],
  ['053', 'Chien-Pao-Card-53'],
  ['054', 'Mega-Skarmory-ex-Card-54'],
  ['055', 'Honedge-Card-55'],
  ['056', 'Doublade-Card-56'],
  ['057', 'Aegislash-Card-57'],
  ['058', 'Klefki-Card-58'],
  ['059', 'Rattata-Card-59'],
  ['060', 'Raticate-Card-60'],
  ['061', 'Meowth-ex-Card-61'],
  ['062', 'Snorlax-Card-62'],
  ['063', 'Bunnelby-Card-63'],
  ['064', 'Diggersby-Card-64'],
  ['065', 'Fletchling-Card-65'],
  ['066', 'Furfrou-Card-66'],
  ['067', 'Energy-Swatter-Card-67'],
  ['068', 'Jaw-Fossil-Card-68'],
  ['069', 'Antique-Sail-Fossil-Card-69'],
  ['070', 'Pokepad-Card-70'],
  ['071', 'Lumiose-Galette-Card-71'],
  ['072', 'Core-Memory-Card-72'],
  ['073', 'Tarragon-Card-73'],
  ['074', 'Naveen-Card-74'],
  ['075', 'Rosas-Encouragement-Card-75'],
  ['076', 'Jacinthe-Card-76'],
  ['077', 'Lumiose-City-Card-77'],
  ['078', 'Grow-Energy-Card-78'],
  ['079', 'Telepath-Energy-Card-79'],
  ['080', 'Rock-Fighting-Energy-Card-80'],
  ['081', 'Spewpa-Card-81'],
  ['082', 'Rowlet-Card-82'],
  ['083', 'Talonflame-Card-83'],
  ['084', 'Aurorus-Card-84'],
  ['085', 'Dedenne-Card-85'],
  ['086', 'Clefairy-Card-86'],
  ['087', 'Espurr-Card-87'],
  ['088', 'Probopass-Card-88'],
  ['089', 'Tyrunt-Card-89'],
  ['090', 'Drapion-Card-90'],
  ['091', 'Doublade-Card-91'],
  ['092', 'Raticate-Card-92'],
  ['093', 'Decidueye-ex-Card-93'],
  ['094', 'Salazzle-ex-Card-94'],
  ['095', 'Mega-Starmie-ex-Card-95'],
  ['096', 'Mega-Clefable-ex-Card-96'],
  ['097', 'Mega-Zygarde-ex-Card-97'],
  ['098', 'Yveltal-ex-Card-98'],
  ['099', 'Mega-Skarmory-ex-Card-99'],
  ['100', 'Meowth-ex-Card-100'],
  ['101', 'Energy-Recycler-Card-101'],
  ['102', 'Sacred-Ash-Card-102'],
  ['103', 'Pok-Pad-Card-103'],
  ['104', 'Wondrous-Patch-Card-104'],
  ['105', 'Tarragon-Card-105'],
  ['106', 'Naveen-Card-106'],
  ['107', 'Rosas-Encouragement-Card-107'],
  ['108', 'Jacinthe-Card-108'],
  ['109', 'Forest-of-Vitality-Card-109'],
  ['110', 'Lumiose-City-Card-110'],
  ['111', 'Mega-Starmie-ex-Card-111'],
  ['112', 'Mega-Clefable-ex-Card-112'],
  ['113', 'Mega-Zygarde-ex-Card-113'],
  ['114', 'Meowth-ex-Card-114'],
  ['115', 'Rosas-Encouragement-Card-115'],
  ['116', 'Jacinthe-Card-116'],
  ['117', 'Mega-Zygarde-ex-Card-117'],
];

async function fetchOne(num, slugPath) {
  const url = `https://www.pokellector.com/Munikis-Zero-Expansion/${slugPath}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      },
    });
    if (!res.ok) {
      return { number: num, slugPath, error: `HTTP ${res.status}` };
    }
    const html = await res.text();
    // image URL: https://den-cards.pokellector.com/428/<slug>.M3.<num>.<id>.png
    const re = /https:\/\/den-cards\.pokellector\.com\/428\/([^."]+)\.M3\.(\d+)\.(\d+)\.png/g;
    const matches = [...html.matchAll(re)];
    if (matches.length === 0) {
      return { number: num, slugPath, error: 'no image url' };
    }
    // pick the one that matches this card number
    const match = matches.find(m => m[2] === String(parseInt(num, 10))) || matches[0];
    return {
      number: num,
      slugPath,
      slug: match[1],
      cardNum: match[2],
      asset_id: match[3],
      url: match[0],
    };
  } catch (e) {
    return { number: num, slugPath, error: String(e) };
  }
}

async function main() {
  // run with concurrency 8
  const results = [];
  const concurrency = 8;
  let i = 0;
  async function worker() {
    while (i < slugs.length) {
      const idx = i++;
      const [num, slug] = slugs[idx];
      const r = await fetchOne(num, slug);
      results[idx] = r;
      const status = r.error ? `ERR ${r.error}` : `${r.slug}.${r.asset_id}`;
      console.log(`${num} ${slug} -> ${status}`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  const errors = results.filter(r => r.error);
  console.log(`\nDone. Total ${results.length}. Errors: ${errors.length}`);
  if (errors.length) console.log(JSON.stringify(errors, null, 2));
}
main();
