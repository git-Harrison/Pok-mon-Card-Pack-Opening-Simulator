// 카드별 픽셀 스프라이트 — 메가 진화 / 지역폼 등 dex 만으론 구분 안 되는
// 카드를 위한 매핑. 기본 dex sprite (gen5 BW) 는 메가 폼이 없어서 메가
// 카드도 base 종 sprite 가 표시되던 한계 해결.
//
// 출처: Pokemon Showdown ani sprites (gen 1~9 + mega/region 변형 모두 보유).
//   URL: https://play.pokemonshowdown.com/sprites/ani/<slug>.gif

import { CARD_NAME_TO_DEX } from "./name-to-dex";

const PS_BASE = "https://play.pokemonshowdown.com/sprites/ani";

/** 카드 이름 → PS sprite slug. 등록된 메가/특수 폼만 — 그 외는 dex
 *  기반 fallback 으로 빠짐. 한국어 카드 이름의 정규화된 base 형태 (ex /
 *  V / VMAX / 골드 / SV suffix 제거 후) 를 키로 사용. */
const CARD_NAME_TO_PS_SLUG: Record<string, string> = {
  // ── 메가 (Gen 6 mega evolutions) ──
  "메가 리자몽 X": "charizard-megax",
  "메가 리자몽 Y": "charizard-megay",
  "메가 거북왕": "blastoise-mega",
  "메가 이상해꽃": "venusaur-mega",
  "메가루카리오": "lucario-mega",
  "메가 루카리오": "lucario-mega",
  "메가가디안": "gardevoir-mega",
  "메가 가디안": "gardevoir-mega",
  "메가지가르데": "zygarde", // Mega Zygarde 미공식 — base 사용
  "메가 망나뇽": "dragonite",
  "메가개굴닌자": "greninja-ash",
  "메가 개굴닌자": "greninja-ash",
  "메가 플라엣테": "floette-eternal",
  "메가플라엣테": "floette-eternal",
  "메가앱솔": "absol-mega",
  "메가 앱솔": "absol-mega",
  "메가 갸라도스": "gyarados-mega",
  "메가갸라도스": "gyarados-mega",
  "메가 캥카": "kangaskhan-mega",
  "메가 후딘": "alakazam-mega",
  "메가 핫삼": "scizor-mega",
  "메가 보만다": "salamence-mega",
  "메가 메타그로스": "metagross-mega",
  "메가 디안시": "diancie-mega",
  "메가 레쿠쟈": "rayquaza-mega",
  "메가 뮤츠 X": "mewtwo-megax",
  "메가 뮤츠 Y": "mewtwo-megay",
  "메가 핑크": "audino-mega",
  "메가 헤라크로스": "heracross-mega",
  "메가 마기라스": "tyranitar-mega",
  "메가 푸크린": "lopunny-mega",
  "메가 강챙이": "swampert-mega",
  "메가 번치코": "blaziken-mega",
  "메가 대짱이": "swampert-mega",
  "메가 비크티니": "victini",
};

/** 카드 이름 → 픽셀 스프라이트 URL. 메가/지역폼 PS slug 매칭 우선.
 *  카드 suffix (ex/V/VMAX/...) / 트레이너 "X의 Y" prefix 도 같이 strip.
 *  매칭 없으면 null 반환 (caller 가 dex sprite 로 fallback). */
export function cardSpriteUrl(cardName: string): string | null {
  if (!cardName) return null;

  const tryName = (n: string) => CARD_NAME_TO_PS_SLUG[n];

  // 직접 매칭.
  const direct = tryName(cardName);
  if (direct) return `${PS_BASE}/${direct}.gif`;

  // suffix / 괄호 제거 후 매칭.
  const stripped = cardName
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s+(ex|V|VMAX|VSTAR|VUNION|GX|BREAK|EX)\s*$/i, "")
    .trim();
  const slug = tryName(stripped);
  if (slug) return `${PS_BASE}/${slug}.gif`;

  // "X의 Y" trainer-prefix — Y 가 base 포켓몬.
  const trainer = stripped.match(/^(.+?)의\s+(.+)$/);
  if (trainer) {
    const inner = trainer[2].trim();
    if (tryName(inner)) return `${PS_BASE}/${tryName(inner)}.gif`;
    const innerStripped = inner
      .replace(/\s*\([^)]*\)\s*$/, "")
      .replace(/\s+(ex|V|VMAX|VSTAR|VUNION|GX|BREAK|EX)\s*$/i, "")
      .trim();
    if (tryName(innerStripped)) return `${PS_BASE}/${tryName(innerStripped)}.gif`;
  }

  return null;
}

/** dex 만으로 PS sprite URL — 일반 카드 / dex fallback 용. */
export function dexSpriteUrl(dex: number): string {
  return `${PS_BASE}/${psSlugByDex(dex)}.gif`;
}

/** dex → PS slug. 대부분 종 이름 영문 — sindresorhus/pokemon 의
 *  영문 이름과 1:1 매핑. CARD_NAME_TO_DEX 의 reverse 로 구하지 않고
 *  PokeAPI/Showdown 의 표준 영문 slug 가 필요하므로 별도 lookup
 *  필요 — 현재는 PokeAPI gen5 fallback 으로 대체 (호환). */
function psSlugByDex(dex: number): string {
  // PS 는 영문 이름 slug 를 사용. 직접 dex→slug 표는 1025 entry 라 별도
  // 파일이 필요하지만 현재 우선순위 낮음. 메가 폼 매핑이 핵심이라
  // 일반 dex 는 gen5 PokeAPI 로 빠짐 (호출자가 fallback).
  return `pokemon-${dex}`;
}

void CARD_NAME_TO_DEX; // import 유지 — 향후 reverse-lookup 확장 hook.
