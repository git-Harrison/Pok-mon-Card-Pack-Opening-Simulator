// One-off generator for SV10 cards.json. Not part of the runtime build.
// Run with: node scripts/data/sv10/_build.mjs
import fs from "node:fs";

// Pokellector mapping: jp_num -> [slug, assetId]
// Extracted from https://www.pokellector.com/Glory-of-Team-Rocket-Expansion/
const pkl = {
  1: ["Pineco", "57080"],
  2: ["Shroomish", "57081"],
  3: ["Breloom", "57082"],
  4: ["Mow-Rotom", "57083"],
  5: ["Fomantis", "57084"],
  6: ["Lurantis", "57085"],
  7: ["Team-Rockets-Blipbug", "57074"],
  8: ["Team-Rockets-Tarountula", "56885"],
  9: ["Team-Rockets-Spidops", "56886"],
  10: ["Smoliv", "57086"],
  11: ["Dolliv", "57087"],
  12: ["Arboliva-ex", "57088"],
  13: ["Growlithe", "57089"],
  14: ["Arcanine", "57090"],
  15: ["Team-Rockets-Moltres-ex", "57053"],
  16: ["Team-Rockets-Houndour", "57091"],
  17: ["Team-Rockets-Houndoom", "57092"],
  18: ["Torchic", "56873"],
  19: ["Combusken", "56874"],
  20: ["Blaziken", "56875"],
  21: ["Heat-Rotom", "57093"],
  22: ["Team-Rockets-Articuno", "57054"],
  23: ["Clampearl", "57055"],
  24: ["Huntail", "57056"],
  25: ["Gorebyss", "57057"],
  26: ["Snover", "57094"],
  27: ["Abomasnow", "57095"],
  28: ["Wash-Rotom", "57096"],
  29: ["Arrokuda", "57097"],
  30: ["Barraskewda", "57098"],
  31: ["Cetoddle", "56879"],
  32: ["Cetitan-ex", "56880"],
  33: ["Team-Rockets-Zapdos", "57058"],
  34: ["Team-Rockets-Mareep", "56882"],
  35: ["Team-Rockets-Flaafy", "56883"],
  36: ["Team-Rockets-Ampharos", "56884"],
  37: ["Team-Rockets-Drowzee", "57078"],
  38: ["Team-Rockets-Hypno", "57079"],
  39: ["Team-Rockets-Mewtwo-ex", "56866"],
  40: ["Team-Rockets-Wobbuffet", "56881"],
  41: ["Team-Rockets-Chingling", "57099"],
  42: ["Team-Rockets-Mimikyu", "57100"],
  43: ["Team-Rockets-Dottler", "57075"],
  44: ["Team-Rockets-Orbeetle", "57076"],
  45: ["Mankey", "56905"],
  46: ["Primeape", "56906"],
  47: ["Annihilape", "56907"],
  48: ["Team-Rockets-Larvitar", "57070"],
  49: ["Team-Rockets-Pupitar", "57071"],
  50: ["Team-Rockets-Tyranitar", "57072"],
  51: ["Nosepass", "57101"],
  52: ["Probopass", "57102"],
  53: ["Meditite", "57103"],
  54: ["Medicham", "57104"],
  55: ["Regirock-ex", "57052"],
  56: ["Team-Rockets-Ekans", "57105"],
  57: ["Team-Rockets-Arbok", "57106"],
  58: ["Team-Rockets-Nidoran", "57107"],
  59: ["Team-Rockets-Nidorina", "57108"],
  60: ["Team-Rockets-Nidoqueen", "57109"],
  61: ["Team-Rockets-Nidoran", "57110"],
  62: ["Team-Rockets-Nidorino", "57111"],
  63: ["Team-Rockets-Nidoking-ex", "57112"],
  64: ["Team-Rockets-Zubat", "57059"],
  65: ["Team-Rockets-Golbat", "57060"],
  66: ["Team-Rockets-Crobat-ex", "57061"],
  67: ["Team-Rockets-Grimer", "57113"],
  68: ["Team-Rockets-Muk", "57114"],
  69: ["Team-Rockets-Koffing", "57062"],
  70: ["Team-Rockets-Weezing", "57063"],
  71: ["Team-Rockets-Murkrow", "57115"],
  72: ["Team-Rockets-Sneasel", "57064"],
  73: ["Forretress", "57116"],
  74: ["Skarmory", "57117"],
  75: ["Zamazenta", "56876"],
  76: ["Team-Rockets-Rattata", "57118"],
  77: ["Team-Rockets-Raticate", "57119"],
  78: ["Team-Rockets-Meowth", "57120"],
  79: ["Team-Rockets-Persian-ex", "56868"],
  80: ["Kangaskhan", "57121"],
  81: ["Team-Rockets-Porygon", "56869"],
  82: ["Team-Rockets-Porygon-2", "56870"],
  83: ["Team-Rockets-Porygon-Z", "56871"],
  84: ["Taillow", "57122"],
  85: ["Swellow", "57123"],
  86: ["Squawkabilly", "57124"],
  87: ["Team-Rockets-Hindering-Robo", "57125"],
  88: ["Team-Rockets-Great-Ball", "57065"],
  89: ["Team-Rockets-Venture-Bomb", "57066"],
  90: ["Team-Rockets-Receiver", "56887"],
  91: ["Team-Rockets-Ariana", "56888"],
  92: ["Team-Rockets-Archer", "56889"],
  93: ["Team-Rockets-Giovanni", "56890"],
  94: ["Team-Rockets-Petrel", "57067"],
  95: ["Team-Rockets-Proton", "57068"],
  96: ["Team-Rockets-Watchtower", "57126"],
  97: ["Team-Rockets-Factory", "57127"],
  98: ["Team-Rocket-Energy", "56891"],
  99: ["Team-Rockets-Spidops-ex", "57139"],
  100: ["Team-Rockets-Houndoom", "57140"],
  101: ["Blaziken", "57141"],
  102: ["Clampearl", "57069"],
  103: ["Team-Rockets-Wobbuffet", "56878"],
  104: ["Team-Rockets-Orbeetle", "57077"],
  105: ["Team-Rockets-Weezing", "57142"],
  106: ["Team-Rockets-Murkrow", "57130"],
  107: ["Zamazenta", "56877"],
  108: ["Team-Rockets-Raticate", "57143"],
  109: ["Team-Rockets-Meowth", "56872"],
  110: ["Kangaskhan", "57129"],
  111: ["Arboliva-ex", "57144"],
  112: ["Team-Rockets-Moltres-ex", "57073"],
  113: ["Cetitan-ex", "57145"],
  114: ["Team-Rockets-Mewtwo-ex", "57146"],
  115: ["Regirock-ex", "57147"],
  116: ["Team-Rockets-Nidoking-ex", "57128"],
  117: ["Team-Rockets-Crobat-ex", "57148"],
  118: ["Team-Rockets-Persian-ex", "57149"],
  119: ["Team-Rockets-Ariana", "57150"],
  120: ["Team-Rockets-Archer", "57151"],
  121: ["Team-Rockets-Giovanni", "57152"],
  122: ["Team-Rockets-Petrel", "57153"],
  123: ["Team-Rockets-Proton", "57154"],
  124: ["Team-Rockets-Moltres-ex", "57155"],
  125: ["Team-Rockets-Mewtwo-ex", "57156"],
  126: ["Team-Rockets-Nidoking-ex", "57157"],
  127: ["Team-Rockets-Crobat-ex", "57158"],
  128: ["Team-Rockets-Ariana", "57159"],
  129: ["Team-Rockets-Giovanni", "57160"],
  130: ["Team-Rockets-Mewtwo-ex", "57161"],
  131: ["Team-Rockets-Crobat-ex", "57162"],
  132: ["Jamming-Tower", "57163"],
};

// JP-canonical English names per Pokellector + Bulbapedia.
// Indexed by Korean card number; for the trainer/item slots that were
// reordered between JP and KR releases, the EN name corresponds to the
// JP card whose image appears at that KR number (cross-verified by
// downloading and visually inspecting Korean scans from tcgbox.co.kr).
const en = {
  1: "Pineco", 2: "Shroomish", 3: "Breloom", 4: "Mow Rotom", 5: "Fomantis",
  6: "Lurantis", 7: "Team Rocket's Blipbug", 8: "Team Rocket's Tarountula",
  9: "Team Rocket's Spidops", 10: "Smoliv", 11: "Dolliv", 12: "Arboliva ex",
  13: "Growlithe", 14: "Arcanine", 15: "Team Rocket's Moltres ex",
  16: "Team Rocket's Houndour", 17: "Team Rocket's Houndoom",
  18: "Torchic", 19: "Combusken", 20: "Blaziken", 21: "Heat Rotom",
  22: "Team Rocket's Articuno", 23: "Clamperl", 24: "Huntail",
  25: "Gorebyss", 26: "Snover", 27: "Abomasnow", 28: "Wash Rotom",
  29: "Arrokuda", 30: "Barraskewda", 31: "Cetoddle", 32: "Cetitan ex",
  33: "Team Rocket's Zapdos", 34: "Team Rocket's Mareep",
  35: "Team Rocket's Flaaffy", 36: "Team Rocket's Ampharos",
  37: "Team Rocket's Drowzee", 38: "Team Rocket's Hypno",
  39: "Team Rocket's Mewtwo ex", 40: "Team Rocket's Wobbuffet",
  41: "Team Rocket's Chingling", 42: "Team Rocket's Mimikyu",
  43: "Team Rocket's Dottler", 44: "Team Rocket's Orbeetle",
  45: "Mankey", 46: "Primeape", 47: "Annihilape",
  48: "Team Rocket's Larvitar", 49: "Team Rocket's Pupitar",
  50: "Team Rocket's Tyranitar", 51: "Nosepass", 52: "Probopass",
  53: "Meditite", 54: "Medicham", 55: "Regirock ex",
  56: "Team Rocket's Ekans", 57: "Team Rocket's Arbok",
  58: "Team Rocket's Nidoran♀", 59: "Team Rocket's Nidorina",
  60: "Team Rocket's Nidoqueen", 61: "Team Rocket's Nidoran♂",
  62: "Team Rocket's Nidorino", 63: "Team Rocket's Nidoking ex",
  64: "Team Rocket's Zubat", 65: "Team Rocket's Golbat",
  66: "Team Rocket's Crobat ex", 67: "Team Rocket's Grimer",
  68: "Team Rocket's Muk", 69: "Team Rocket's Koffing",
  70: "Team Rocket's Weezing", 71: "Team Rocket's Murkrow",
  72: "Team Rocket's Sneasel", 73: "Forretress", 74: "Skarmory",
  75: "Zamazenta", 76: "Team Rocket's Rattata",
  77: "Team Rocket's Raticate", 78: "Team Rocket's Meowth",
  79: "Team Rocket's Persian ex", 80: "Kangaskhan",
  81: "Team Rocket's Porygon", 82: "Team Rocket's Porygon2",
  83: "Team Rocket's Porygon-Z", 84: "Taillow", 85: "Swellow",
  86: "Squawkabilly",
  // 087-090 items (KR ordering: Bomb / Receiver / Drone / Pokeball)
  87: "Team Rocket's Venture Bomb",
  88: "Team Rocket's Receiver",
  89: "Team Rocket's Pester-Bot",
  90: "Team Rocket's Great Ball",
  // 091-095 supporters (KR ordering: Petrel / Proton / Giovanni / Ariana / Archer)
  91: "Team Rocket's Petrel",
  92: "Team Rocket's Proton",
  93: "Team Rocket's Giovanni",
  94: "Team Rocket's Ariana",
  95: "Team Rocket's Archer",
  96: "Team Rocket's Watchtower",
  97: "Team Rocket's Factory",
  98: "Team Rocket Energy",
  // 099-110 AR (no swap)
  99: "Team Rocket's Spidops",
  100: "Team Rocket's Houndoom",
  101: "Blaziken",
  102: "Clamperl",
  103: "Team Rocket's Wobbuffet",
  104: "Team Rocket's Orbeetle",
  105: "Team Rocket's Weezing",
  106: "Team Rocket's Murkrow",
  107: "Zamazenta",
  108: "Team Rocket's Raticate",
  109: "Team Rocket's Meowth",
  110: "Kangaskhan",
  // 111-118 SR ex Pokemon (no swap)
  111: "Arboliva ex",
  112: "Team Rocket's Moltres ex",
  113: "Cetitan ex",
  114: "Team Rocket's Mewtwo ex",
  115: "Regirock ex",
  116: "Team Rocket's Nidoking ex",
  117: "Team Rocket's Crobat ex",
  118: "Team Rocket's Persian ex",
  // 119-123 SR Trainers (KR reordered, mirrors 091-095)
  119: "Team Rocket's Petrel",
  120: "Team Rocket's Proton",
  121: "Team Rocket's Giovanni",
  122: "Team Rocket's Ariana",
  123: "Team Rocket's Archer",
  // 124-127 SAR ex Pokemon (no swap)
  124: "Team Rocket's Moltres ex",
  125: "Team Rocket's Mewtwo ex",
  126: "Team Rocket's Nidoking ex",
  127: "Team Rocket's Crobat ex",
  // 128-129 SAR Trainers (KR reordered)
  128: "Team Rocket's Giovanni",
  129: "Team Rocket's Ariana",
  // 130-132 UR
  130: "Team Rocket's Mewtwo ex",
  131: "Team Rocket's Crobat ex",
  132: "Jamming Tower",
};

// Korean names: tcgbox.co.kr listings + namu.wiki + visual confirmation.
const ko = {
  1: "피콘", 2: "버섯꼬", 3: "버섯모", 4: "커트로토무", 5: "짜랑랑",
  6: "라란티스", 7: "로켓단의 두루지벌레", 8: "로켓단의 타랜툴라",
  9: "로켓단의 트래피더", 10: "미니브", 11: "올리뇨", 12: "올리르바ex",
  13: "가디", 14: "윈디", 15: "로켓단의 파이어ex",
  16: "로켓단의 델빌", 17: "로켓단의 헬가",
  18: "아차모", 19: "영치코", 20: "번치코", 21: "히트로토무",
  22: "로켓단의 프리져", 23: "진주몽", 24: "헌테일", 25: "분홍장이",
  26: "눈쓰개", 27: "눈설왕", 28: "워시로토무", 29: "찌로꼬치", 30: "꼬치조",
  31: "터벅고래", 32: "우락고래ex",
  33: "로켓단의 썬더", 34: "로켓단의 메리프", 35: "로켓단의 보송송",
  36: "로켓단의 전룡", 37: "로켓단의 슬리프", 38: "로켓단의 슬리퍼",
  39: "로켓단의 뮤츠ex", 40: "로켓단의 마자용",
  41: "로켓단의 랑딸랑", 42: "로켓단의 따라큐",
  43: "로켓단의 레돔벌레", 44: "로켓단의 이올브",
  45: "망키", 46: "성원숭", 47: "저승갓숭",
  48: "로켓단의 애버라스", 49: "로켓단의 데기라스", 50: "로켓단의 마기라스",
  51: "코코파스", 52: "대코파스", 53: "요가랑", 54: "요가램",
  55: "레지락ex", 56: "로켓단의 아보", 57: "로켓단의 아보크",
  58: "로켓단의 니드런♀", 59: "로켓단의 니드리나", 60: "로켓단의 니드퀸",
  61: "로켓단의 니드런♂", 62: "로켓단의 니드리노", 63: "로켓단의 니드킹ex",
  64: "로켓단의 주뱃", 65: "로켓단의 골뱃", 66: "로켓단의 크로뱃ex",
  67: "로켓단의 질퍽이", 68: "로켓단의 질뻐기",
  69: "로켓단의 또가스", 70: "로켓단의 또도가스",
  71: "로켓단의 니로우", 72: "로켓단의 포푸니",
  73: "쏘콘", 74: "무장조", 75: "자마젠타",
  76: "로켓단의 꼬렛", 77: "로켓단의 레트라", 78: "로켓단의 나옹",
  79: "로켓단의 페르시온ex", 80: "캥카",
  81: "로켓단의 폴리곤", 82: "로켓단의 폴리곤2", 83: "로켓단의 폴리곤Z",
  84: "테일로", 85: "스왈로", 86: "시비꼬",
  87: "로켓단의 깜짝봄", 88: "로켓단의 리시버",
  89: "로켓단의 방해로봇", 90: "로켓단의 슈퍼볼",
  91: "로켓단의 람다", 92: "로켓단의 랜스", 93: "로켓단의 비주기",
  94: "로켓단의 아테나", 95: "로켓단의 아폴로",
  96: "로켓단의 감시탑", 97: "로켓단의 팩토리", 98: "로켓단 에너지",
  99: "로켓단의 트래피더", 100: "로켓단의 헬가",
  101: "번치코", 102: "진주몽", 103: "로켓단의 마자용",
  104: "로켓단의 이올브", 105: "로켓단의 또도가스",
  106: "로켓단의 니로우", 107: "자마젠타",
  108: "로켓단의 레트라", 109: "로켓단의 나옹", 110: "캥카",
  111: "올리르바ex", 112: "로켓단의 파이어ex",
  113: "우락고래ex", 114: "로켓단의 뮤츠ex",
  115: "레지락ex", 116: "로켓단의 니드킹ex",
  117: "로켓단의 크로뱃ex", 118: "로켓단의 페르시온ex",
  119: "로켓단의 람다", 120: "로켓단의 랜스",
  121: "로켓단의 비주기", 122: "로켓단의 아테나",
  123: "로켓단의 아폴로",
  124: "로켓단의 파이어ex", 125: "로켓단의 뮤츠ex",
  126: "로켓단의 니드킹ex", 127: "로켓단의 크로뱃ex",
  128: "로켓단의 비주기", 129: "로켓단의 아테나",
  130: "로켓단의 뮤츠ex", 131: "로켓단의 크로뱃ex",
  132: "재밍타워",
};

// Korean number -> JP number (for trainers/items the KR release reorders)
const krToJp = (n) => {
  // items
  if (n === 87) return 89; // 깜짝봄 -> Venture-Bomb
  if (n === 88) return 90; // 리시버 -> Receiver
  if (n === 89) return 87; // 방해로봇 -> Pester-Bot
  if (n === 90) return 88; // 슈퍼볼 -> Great-Ball
  // supporters main set
  if (n === 91) return 94; // 람다 -> Petrel
  if (n === 92) return 95; // 랜스 -> Proton
  if (n === 93) return 93; // 비주기 -> Giovanni (no swap)
  if (n === 94) return 91; // 아테나 -> Ariana
  if (n === 95) return 92; // 아폴로 -> Archer
  // SR trainers (mirrors 091-095)
  if (n === 119) return 122;
  if (n === 120) return 123;
  if (n === 121) return 121;
  if (n === 122) return 119;
  if (n === 123) return 120;
  // SAR trainers
  if (n === 128) return 129; // 비주기 SAR
  if (n === 129) return 128; // 아테나 SAR
  return n;
};

// Rarity mapping per Bulbapedia "Glory of the Rocket Gang" set list +
// Pokellector individual card pages.
const rarityByJp = {
  1:"C",2:"C",3:"C",4:"C",5:"C",6:"U",7:"C",8:"C",9:"R",10:"C",
  11:"C",12:"RR",13:"C",14:"U",15:"RR",16:"C",17:"U",18:"C",19:"C",20:"R",
  21:"C",22:"R",23:"C",24:"U",25:"R",26:"C",27:"U",28:"C",29:"C",30:"U",
  31:"C",32:"RR",33:"R",34:"C",35:"C",36:"U",37:"C",38:"U",39:"RR",40:"R",
  41:"C",42:"U",43:"C",44:"U",45:"C",46:"C",47:"R",48:"C",49:"U",50:"R",
  51:"C",52:"U",53:"C",54:"U",55:"RR",56:"C",57:"U",58:"C",59:"C",60:"U",
  61:"C",62:"C",63:"RR",64:"C",65:"U",66:"RR",67:"C",68:"U",69:"C",70:"U",
  71:"U",72:"R",73:"U",74:"C",75:"R",76:"C",77:"C",78:"C",79:"RR",80:"C",
  81:"C",82:"C",83:"U",84:"C",85:"C",86:"C",
  87:"U",88:"U",89:"U",90:"U",91:"U",92:"U",93:"U",94:"U",95:"U",96:"U",97:"U",98:"U",
};
for (let n = 99; n <= 110; n++) rarityByJp[n] = "AR";
for (let n = 111; n <= 123; n++) rarityByJp[n] = "SR";
for (let n = 124; n <= 129; n++) rarityByJp[n] = "SAR";
for (let n = 130; n <= 132; n++) rarityByJp[n] = "UR";

// Build cards array (KR-numbered)
const cards = [];
for (let n = 1; n <= 132; n++) {
  const num = String(n).padStart(3, "0");
  // For most cards we look up Pokellector by the Korean number directly.
  // For reordered slots, look up by the JP equivalent so the slug+asset
  // line up with the actual character/item printed on the Korean card.
  const jp = krToJp(n);
  const [slug, assetId] = pkl[jp];
  cards.push({
    number: num,
    name_en: en[n],
    name_ko: ko[n],
    rarity: rarityByJp[jp],
    pokellector_slug: slug,
    pokellector_asset_id: assetId,
  });
}

// Validation
if (cards.length !== 132) throw new Error(`Expected 132 cards, got ${cards.length}`);
const validRarities = new Set(["C","U","R","RR","AR","SR","SAR","UR","MUR","MA"]);
for (const c of cards) {
  if (!c.pokellector_slug) throw new Error(`Missing slug for ${c.number}`);
  if (!c.pokellector_asset_id) throw new Error(`Missing asset id for ${c.number}`);
  if (!c.name_en) throw new Error(`Missing EN for ${c.number}`);
  if (!validRarities.has(c.rarity)) throw new Error(`Bad rarity ${c.rarity} for ${c.number}`);
}

// Stats
const koFilled = cards.filter(c => c.name_ko).length;
const koNull = cards.length - koFilled;
const rarityDist = {};
for (const c of cards) rarityDist[c.rarity] = (rarityDist[c.rarity] || 0) + 1;

const issues = [
  "Cards 087-090 (items) and 091-095 (Team Rocket Boss/Admin trainers) are reordered between Japanese and Korean releases. The Korean numbering is canonical for this JSON. Pokellector image assets follow the JP numbering, so the slug+asset pair recorded for each KR number points to the correct character/item printed on the Korean card (verified by direct visual comparison of Korean card scans from tcgbox.co.kr against the Pokellector den-cards CDN images).",
  "KR-to-JP item swap: KR 087 깜짝봄 = JP 089 Venture-Bomb; KR 088 리시버 = JP 090 Receiver; KR 089 방해로봇 = JP 087 Pester-Bot/Hindering-Robo; KR 090 슈퍼볼 = JP 088 Great-Ball.",
  "KR-to-JP supporter swap: KR 091 람다 = JP 094 Petrel; KR 092 랜스 = JP 095 Proton; KR 093 비주기 = JP 093 Giovanni (no swap); KR 094 아테나 = JP 091 Ariana; KR 095 아폴로 = JP 092 Archer. Same pattern applies to 119-123 SR trainers (KR 119/120/121/122/123 = JP 122/123/121/119/120) and 128-129 SAR trainers (KR 128 비주기 SAR = JP 129 Giovanni SAR; KR 129 아테나 SAR = JP 128 Ariana SAR).",
  "The image URL for each card is constructed as https://den-cards.pokellector.com/413/<pokellector_slug>.SV10.<JP_NUMBER>.<pokellector_asset_id>.png . Because the JSON uses Korean numbering, do NOT splice the 'number' field directly into the URL for the reordered slots; consumers should derive the JP number from the slug or use a lookup table. For all non-reordered cards the JP number equals the KR number.",
  "Card 099 Pokellector slug is 'Team-Rockets-Spidops-ex' — this is a Pokellector slug typo; the actual card is the non-ex Illustration Rare of #009 Team Rocket's Spidops. Slug retained as-is so the image URL resolves.",
  "Card 035 Pokellector slug is 'Team-Rockets-Flaafy' (Pokellector typo for Flaaffy). Slug retained as-is so the image URL resolves.",
  "Cards 023 and 102 Pokellector slug is 'Clampearl' (Pokellector typo for Clamperl). Slug retained as-is so the image URL resolves.",
  "Card 132 Jamming Tower carries the ACE SPEC mechanic (visible badge on the Korean scan), but its print rarity per Pokellector and Bulbapedia is UR (Hyper Rare), not ACE SPEC Rare. Recorded as 'UR'. The set has no separate ACE SPEC Rare entries.",
  "Korean names for trainer SR (119-123) and SAR (128-129) cards verified by downloading and visually inspecting Korean card scans from tcgbox.co.kr (cards 119/120/121/122/123/128/129).",
  "Korean names for items 087-090 verified by downloading and visually inspecting Korean card scans from tcgbox.co.kr (cards 087/088/089/090).",
];

const result = {
  code: "sv10",
  name: "로켓단의 영광",
  subtitle: "확장팩 · GLORY OF TEAM ROCKET",
  releaseDate: "2025-06-20",
  cardsPerPack: 5,
  packsPerBox: 30,
  totalCards: 132,
  pokellector_folder: 413,
  pokellector_set_code: "SV10",
  imageUrlPattern: "https://den-cards.pokellector.com/413/<pokellector_slug>.SV10.<jp_card_number>.<pokellector_asset_id>.png",
  imageUrlNote: "<jp_card_number> is the Japanese release number (1-132 without leading zeros). For all but the reordered trainer/item slots (KR 087-090, 091/092/094/095, 119/120/122/123, 128/129) it equals the 'number' field. See 'issues' for the explicit KR->JP swap table.",
  cards,
  issues,
  stats: {
    total: cards.length,
    name_ko_filled: koFilled,
    name_ko_null: koNull,
    rarity_distribution: rarityDist,
  },
};

const outPath = "C:/Users/USER/Desktop/test/pokemon-tcg-sim/scripts/data/sv10/cards.json";
fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n", "utf8");
console.log(`Wrote ${outPath}`);
console.log(`Cards: ${cards.length}  KO filled: ${koFilled}  KO null: ${koNull}`);
console.log(`Rarity distribution:`, rarityDist);
console.log(`Issues entries: ${issues.length}`);
