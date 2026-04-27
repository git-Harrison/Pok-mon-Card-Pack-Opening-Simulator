// Build the final cards.json for M3 니힐제로.

import fs from 'node:fs';
import path from 'node:path';

const assets = JSON.parse(fs.readFileSync(path.resolve('scripts/data/m3/_pokellector_assets.json'), 'utf8'));
const rarities = JSON.parse(fs.readFileSync(path.resolve('scripts/data/m3/_pokellector_rarities.json'), 'utf8'));
const korean = JSON.parse(fs.readFileSync(path.resolve('scripts/data/m3/_korean_data.json'), 'utf8'));

// Pokellector rarity → our system
const RARITY_MAP = {
  'Common': 'C',
  'Uncommon': 'U',
  'Rare': 'R',
  'Double Rare': 'RR',
  'Art Rare': 'AR',
  'Super Rare': 'SR',
  'Special Art Rare': 'SAR',
  'Hyper Rare': 'UR',
  'Mega Ultra Rare': 'MUR',
  'Master Rare': 'MA',
};

// JP English name + slug per number, derived from assets file (Pokellector slugs)
const JP_BY_NUM = {};
for (const a of assets) JP_BY_NUM[a.number] = a;

// English names per JP number (from Bulbapedia + Pokellector slug-derived)
const JP_NAME_BY_NUM = {
  '001': 'Spinarak', '002': 'Ariados', '003': 'Shaymin', '004': 'Snivy',
  '005': 'Servine', '006': 'Serperior', '007': 'Scatterbug', '008': 'Spewpa',
  '009': 'Vivillon', '010': 'Rowlet', '011': 'Dartrix', '012': 'Decidueye ex',
  '013': 'Fletchinder', '014': 'Talonflame', '015': 'Salandit', '016': 'Salazzle ex',
  '017': 'Turtonator', '018': 'Seel', '019': 'Dewgong', '020': 'Staryu',
  '021': 'Mega Starmie ex', '022': 'Amaura', '023': 'Aurorus', '024': 'Volcanion',
  '025': 'Shinx', '026': 'Luxio', '027': 'Luxray', '028': 'Dedenne',
  '029': 'Clefairy', '030': 'Mega Clefable ex', '031': 'Mawile', '032': 'Espurr',
  '033': 'Meowstic', '034': 'Spritzee', '035': 'Aromatisse', '036': 'Nosepass',
  '037': 'Probopass', '038': 'Hippopotas', '039': 'Hippowdon', '040': 'Landorus',
  '041': 'Binacle', '042': 'Barbaracle', '043': 'Tyrunt', '044': 'Tyrantrum',
  '045': 'Hawlucha', '046': 'Mega Zygarde ex', '047': 'Gastly', '048': 'Haunter',
  '049': 'Gengar', '050': 'Skorupi', '051': 'Drapion', '052': 'Yveltal ex',
  '053': 'Chien-Pao', '054': 'Mega Skarmory ex', '055': 'Honedge', '056': 'Doublade',
  '057': 'Aegislash', '058': 'Klefki', '059': 'Rattata', '060': 'Raticate',
  '061': 'Meowth ex', '062': 'Snorlax', '063': 'Bunnelby', '064': 'Diggersby',
  '065': 'Fletchling', '066': 'Furfrou',
  // JP order 67-77: Energy Swatter, Jaw Fossil, Sail Fossil, Poké Pad, Lumiose Galette, Core Memory, Tarragon, Naveen, Rosa's Encouragement, Jacinthe, Lumiose City
  '067': 'Energy Swatter', '068': 'Antique Jaw Fossil', '069': 'Antique Sail Fossil',
  '070': 'Poké Pad', '071': 'Lumiose Galette', '072': 'Core Memory',
  '073': 'Tarragon', '074': 'Naveen', '075': "Rosa's Encouragement",
  '076': 'Jacinthe', '077': 'Lumiose City',
  '078': 'Growing Grass Energy', '079': 'Telepathic Psychic Energy', '080': 'Rocky Fighting Energy',
  // 081-092 Art Rare (Pokemon)
  '081': 'Spewpa', '082': 'Rowlet', '083': 'Talonflame', '084': 'Aurorus',
  '085': 'Dedenne', '086': 'Clefairy', '087': 'Espurr', '088': 'Probopass',
  '089': 'Tyrunt', '090': 'Drapion', '091': 'Doublade', '092': 'Raticate',
  // JP order 093-110 SR
  '093': 'Decidueye ex', '094': 'Salazzle ex', '095': 'Mega Starmie ex',
  '096': 'Mega Clefable ex', '097': 'Mega Zygarde ex', '098': 'Yveltal ex',
  '099': 'Mega Skarmory ex', '100': 'Meowth ex',
  '101': 'Energy Recycler', '102': 'Sacred Ash', '103': 'Poké Pad', '104': 'Wondrous Patch',
  '105': 'Tarragon', '106': 'Naveen', '107': "Rosa's Encouragement", '108': 'Jacinthe',
  '109': 'Forest of Vitality', '110': 'Lumiose City',
  // SAR
  '111': 'Mega Starmie ex', '112': 'Mega Clefable ex', '113': 'Mega Zygarde ex',
  '114': 'Meowth ex', '115': "Rosa's Encouragement", '116': 'Jacinthe',
  // MUR
  '117': 'Mega Zygarde ex',
};

// KR slot → JP slot mapping (where KR-Number != JP-Number).
// For all unmapped slots, KR slot = JP slot (identity).
// Determined by comparing Korean name → English name to JP order:
//   KR 067 미르갈레트 = Lumiose Galette → JP 071
//   KR 068 에너지탁치기 = Energy Swatter → JP 067
//   KR 069 오래된 지느러미화석 = Sail Fossil → JP 069
//   KR 070 오래된 턱화석 = Jaw Fossil → JP 068
//   KR 071 포켓패드 = Poké Pad → JP 070
//   KR 072 코어 메모리 = Core Memory → JP 072
//   KR 073 명희의 격려 = Rosa's Encouragement → JP 075
//   KR 074 유카리 = Jacinthe → JP 076
//   KR 075 이노 = Naveen → JP 074
//   KR 076 타라곤 = Tarragon → JP 073
//   KR 077 미르시티 = Lumiose City → JP 077
//   SR section:
//   KR 101 성스러운분말 = Sacred Ash → JP 102
//   KR 102 에너지 리사이클 = Energy Recycler → JP 101
//   KR 103 원더패치 = Wondrous Patch → JP 104
//   KR 104 포켓패드 = Poké Pad → JP 103
//   KR 105 명희의 격려 = Rosa's Encouragement → JP 107
//   KR 106 유카리 = Jacinthe → JP 108
//   KR 107 이노 = Naveen → JP 106
//   KR 108 타라곤 = Tarragon → JP 105
//   KR 109 미르시티 = Lumiose City → JP 110
//   KR 110 활력의 숲 = Forest of Vitality → JP 109
const KR_TO_JP = {
  '067': '071',
  '068': '067',
  '069': '069',
  '070': '068',
  '071': '070',
  '073': '075',
  '074': '076',
  '075': '074',
  '076': '073',
  '101': '102',
  '102': '101',
  '103': '104',
  '104': '103',
  '105': '107',
  '106': '108',
  '107': '106',
  '108': '105',
  '109': '110',
  '110': '109',
};

const KR_BY_NUM = {};
for (const k of korean) KR_BY_NUM[k.number] = k;
const ASSET_BY_NUM = {};
for (const a of assets) ASSET_BY_NUM[a.number] = a;
const RARITY_BY_NUM = {};
for (const r of rarities) RARITY_BY_NUM[r.number] = r;

const cards = [];
const issues = [];

for (let n = 1; n <= 117; n++) {
  const krNum = String(n).padStart(3, '0');
  const jpNum = KR_TO_JP[krNum] || krNum;

  const krEntry = KR_BY_NUM[krNum];
  const jpAsset = ASSET_BY_NUM[jpNum];
  const jpRarity = RARITY_BY_NUM[jpNum];

  let nameEn = JP_NAME_BY_NUM[jpNum];
  let rarity = RARITY_MAP[jpRarity?.rarity];

  // Card 117 = MUR, but Pokellector incorrectly labels as Special Art Rare. Override.
  if (krNum === '117') rarity = 'MUR';

  // KR override: when card 117, also handle no Korean name
  let nameKo = krEntry?.name_ko || null;
  if (krNum === '117') {
    // not yet on official Korean site (가장 신작)
    nameKo = null;
  }

  if (!rarity) {
    issues.push(`No rarity for KR#${krNum} (JP#${jpNum}, raw=${jpRarity?.rarity})`);
  }
  if (!nameEn) issues.push(`No English name for KR#${krNum} (JP#${jpNum})`);
  if (!jpAsset?.asset_id) issues.push(`No asset_id for KR#${krNum} (JP#${jpNum})`);

  cards.push({
    number: krNum,
    name_en: nameEn,
    name_ko: nameKo,
    rarity,
    pokellector_slug: jpAsset.slug,
    pokellector_asset_id: jpAsset.asset_id,
  });
}

// KR/JP swap explainers
issues.unshift(
  "KR↔JP swap (M3 067-076 trainers): KR67=JP71(Lumiose Galette/미르갈레트), KR68=JP67(Energy Swatter/에너지탁치기), KR69=JP69(Sail Fossil/오래된 지느러미화석), KR70=JP68(Jaw Fossil/오래된 턱화석), KR71=JP70(Poké Pad/포켓패드), KR72=JP72(Core Memory/코어 메모리), KR73=JP75(Rosa's Encouragement/명희의 격려), KR74=JP76(Jacinthe/유카리), KR75=JP74(Naveen/이노), KR76=JP73(Tarragon/타라곤), KR77=JP77(Lumiose City/미르시티)",
  "KR↔JP swap (M3 101-110 SR trainers): KR101=JP102(Sacred Ash/성스러운분말), KR102=JP101(Energy Recycler/에너지 리사이클), KR103=JP104(Wondrous Patch/원더패치), KR104=JP103(Poké Pad/포켓패드), KR105=JP107(Rosa's Encouragement/명희의 격려), KR106=JP108(Jacinthe/유카리), KR107=JP106(Naveen/이노), KR108=JP105(Tarragon/타라곤), KR109=JP110(Lumiose City/미르시티), KR110=JP109(Forest of Vitality/활력의 숲)",
  "Card 117 (Mega Zygarde ex MUR): Korean name not yet published on official site (BS2026002117 returns 'no card'). Pokellector lists rarity as 'Special Art Rare' but Bulbapedia, PokeGuardian, and the m1l precedent confirm this slot is the Mega Ultra Rare (MUR) of the set — overridden to MUR.",
);

// Stats
const rarityDist = {};
let nameKoFilled = 0, nameKoNull = 0;
for (const c of cards) {
  rarityDist[c.rarity] = (rarityDist[c.rarity] || 0) + 1;
  if (c.name_ko) nameKoFilled++; else nameKoNull++;
}

const out = {
  code: 'm3',
  name: '니힐제로',
  subtitle: 'MEGA 확장팩 · NIHIL ZERO',
  releaseDate: '2026-03-13',
  cardsPerPack: 5,
  packsPerBox: 30,
  totalCards: 117,
  pokellector_folder: 428,
  pokellector_set_code: 'M3',
  primaryColor: '#0ea5e9',
  accentColor: '#7dd3fc',
  imageUrlPattern: 'https://den-cards.pokellector.com/428/<pokellector_slug>.M3.<jp_card_number>.<pokellector_asset_id>.png',
  imageUrlNote: '<jp_card_number> is the Japanese release number. KR↔JP swaps for trainers — see issues for the explicit swap table.',
  cards,
  issues,
  stats: {
    total: cards.length,
    name_ko_filled: nameKoFilled,
    name_ko_null: nameKoNull,
    rarity_distribution: rarityDist,
  },
};

fs.writeFileSync(path.resolve('scripts/data/m3/cards.json'), JSON.stringify(out, null, 2));
console.log(`Wrote scripts/data/m3/cards.json`);
console.log(`Total: ${cards.length}, name_ko filled: ${nameKoFilled}, null: ${nameKoNull}`);
console.log(`Rarity distribution:`, rarityDist);
console.log(`Issues count: ${issues.length}`);
