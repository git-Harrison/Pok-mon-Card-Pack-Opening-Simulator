import type { Card, SetCode, SetInfo } from "../types";
import { m2a } from "./m2a";
import { m2 } from "./m2";
import { sv8 } from "./sv8";
import { sv2a } from "./sv2a";
import { sv8a } from "./sv8a";
import { sv5a } from "./sv5a";
import { sv10 } from "./sv10";
import { sv11b } from "./sv11b";
import { sv11w } from "./sv11w";
import { m1l } from "./m1l";
import { m1s } from "./m1s";
import { m3 } from "./m3";
import { m4 } from "./m4";
// S 시리즈 (소드&실드, 2020-2022). 카드 데이터는 다음 턴 recon 에이전트가 채움.
import { s4a } from "./s4a";
import { s6a } from "./s6a";
import { s7r } from "./s7r";
import { s8ap } from "./s8ap";
import { s8b } from "./s8b";
import { s9a } from "./s9a";

export const SETS: Record<SetCode, SetInfo> = {
  m2a,
  m2,
  sv8,
  sv2a,
  sv8a,
  sv5a,
  sv10,
  sv11b,
  sv11w,
  m1l,
  m1s,
  m3,
  m4,
  s4a,
  s6a,
  s7r,
  s8ap,
  s8b,
  s9a,
};

// 메인 페이지 카드 노출 순서 (최신 정발 → 옛 세트).
//   m4 (2026-03-13) > m3 (2026-03) > m2a (2026-01) > m2 (2025-11)
//   > m1l/m1s (2025-09) > sv11b/sv11w (2025-08, KR 정발) > sv10 (2025-06)
//   > sv8a (2024-12) > sv8 (2024-11) > sv5a (2024-03) > sv2a (2023-06)
//   > S 시리즈 (소드&실드, 2020-2022, 가장 옛 세트):
//     s9a (2022-08) > s8b (2022-05) > s8ap (2022-02) > s7r (2021-12)
//     > s6a (2021-08) > s4a (2020-12)
export const SET_ORDER: SetCode[] = [
  "m4",
  "m3",
  "m2a",
  "m2",
  "m1l",
  "m1s",
  "sv11b",
  "sv11w",
  "sv10",
  "sv8a",
  "sv8",
  "sv5a",
  "sv2a",
  "s9a",
  "s8b",
  "s8ap",
  "s7r",
  "s6a",
  "s4a",
];

// 시리즈 분류 — HomeView 필터 칩이 이 레지스트리를 그대로 순회. 신규
// 시리즈 추가 시 항목만 push 하면 칩 / 카운트 자동 반영. matcher 는
// set code prefix 기반 (m / sv / s+digit). SV 와 S 가 충돌하지 않도록
// S 시리즈 matcher 는 /^s\d/ — sv* 는 's' 다음 'v' 가 와서 매칭 안 됨.
export type SeriesKey = "mega" | "sv" | "swsh";

export interface SeriesInfo {
  key: SeriesKey;
  label: string; // 풀 라벨 (데스크탑/장문)
  short: string; // 칩에 노출되는 짧은 라벨
  icon: string;  // 이모지
  matcher: (code: SetCode) => boolean;
}

export const SERIES: SeriesInfo[] = [
  {
    key: "mega",
    label: "MEGA 시리즈",
    short: "MEGA",
    icon: "🔮",
    matcher: (c) => /^m/.test(c),
  },
  {
    key: "sv",
    label: "스칼렛 & 바이올렛",
    short: "SV",
    icon: "⚔️",
    matcher: (c) => /^sv/.test(c),
  },
  {
    key: "swsh",
    label: "소드 & 실드",
    short: "SWSH",
    icon: "🗡️",
    matcher: (c) => /^s\d/.test(c),
  },
];

export function getSetSeries(code: SetCode): SeriesKey | null {
  for (const s of SERIES) if (s.matcher(code)) return s.key;
  return null;
}

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

export {
  m2a, m2, sv8, sv2a, sv8a, sv5a, sv10, sv11b, sv11w, m1l, m1s, m3, m4,
  s4a, s6a, s7r, s8ap, s8b, s9a,
};
