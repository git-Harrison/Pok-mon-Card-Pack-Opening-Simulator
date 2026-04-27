import type { Card, SetCode, SetInfo } from "../types";
import { m2a } from "./m2a";
import { m2 } from "./m2";
import { sv8 } from "./sv8";
import { sv2a } from "./sv2a";
import { sv8a } from "./sv8a";
import { sv5a } from "./sv5a";
import { sv10 } from "./sv10";
import { m1l } from "./m1l";
import { m1s } from "./m1s";
import { m3 } from "./m3";
import { m4 } from "./m4";

export const SETS: Record<SetCode, SetInfo> = {
  m2a,
  m2,
  sv8,
  sv2a,
  sv8a,
  sv5a,
  sv10,
  m1l,
  m1s,
  m3,
  m4,
};

// 메인 페이지 카드 노출 순서 (최신 정발 → 옛 세트).
//   m4 (2026-03-13) > m3 (2026-03) > m2a (2026-01) > m2 (2025-11)
//   > m1l/m1s (2025-09) > sv10 (2025-06) > sv8a (2024-12) > sv8 (2024-11)
//   > sv5a (2024-03) > sv2a (2023-06)
export const SET_ORDER: SetCode[] = [
  "m4",
  "m3",
  "m2a",
  "m2",
  "m1l",
  "m1s",
  "sv10",
  "sv8a",
  "sv8",
  "sv5a",
  "sv2a",
];

export function getSet(code: string): SetInfo | null {
  return (SETS as Record<string, SetInfo | undefined>)[code] ?? null;
}

// Build the id→card lookup once per module load. The previous
// implementation did Array.find across every set on every call —
// O(N×6), where N is per-set card count. With ~1,000 cards across six
// sets it ran thousands of times per render in CenterView (incomePerHour
// loop), WildView (eligibleSlabs), WalletView (pclItems), etc. The Map
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

export { m2a, m2, sv8, sv2a, sv8a, sv5a, sv10, m1l, m1s, m3, m4 };
