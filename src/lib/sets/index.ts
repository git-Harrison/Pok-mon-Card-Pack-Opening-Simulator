import type { Card, SetCode, SetInfo } from "../types";
import { m2a } from "./m2a";
import { m2 } from "./m2";
import { sv8 } from "./sv8";
import { sv2a } from "./sv2a";
import { sv8a } from "./sv8a";
import { sv5a } from "./sv5a";
import { sv10 } from "./sv10";

export const SETS: Record<SetCode, SetInfo> = {
  m2a,
  m2,
  sv8,
  sv2a,
  sv8a,
  sv5a,
  sv10,
};

// 메인 페이지 카드 노출 순서 (최신 정발 → 옛 세트).
export const SET_ORDER: SetCode[] = [
  "m2a",
  "sv8a",
  "m2",
  "sv10",
  "sv8",
  "sv2a",
  "sv5a",
];

export function getSet(code: string): SetInfo | null {
  return (SETS as Record<string, SetInfo | undefined>)[code] ?? null;
}

// Build the id→card lookup once per module load. The previous
// implementation did Array.find across every set on every call —
// O(N×6), where N is per-set card count. With ~1,000 cards across six
// sets it ran thousands of times per render in CenterView (incomePerHour
// loop), WildView (eligibleSlabs), WalletView (psaItems), etc. The Map
// is built lazily on first lookup so no startup cost is paid until a
// card lookup is actually requested.
let CARD_BY_ID: Map<string, Card> | null = null;
function getCardIndex(): Map<string, Card> {
  if (CARD_BY_ID) return CARD_BY_ID;
  const m = new Map<string, Card>();
  for (const code of SET_ORDER) {
    for (const c of SETS[code].cards) m.set(c.id, c);
  }
  CARD_BY_ID = m;
  return m;
}

export function getCard(id: string): Card | null {
  return getCardIndex().get(id) ?? null;
}

export { m2a, m2, sv8, sv2a, sv8a, sv5a, sv10 };
