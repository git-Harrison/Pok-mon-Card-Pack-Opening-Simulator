// Showcase catalog for the "내 포켓몬센터" (museum) feature.
// Prices/capacities MUST mirror supabase/center-v1.sql exactly so the
// client-side UI matches the server's authoritative check.

export type ShowcaseType =
  | "basic"
  | "glass"
  | "premium"
  | "legendary";

export interface ShowcaseSpec {
  key: ShowcaseType;
  name: string;
  tagline: string;
  price: number;
  capacity: number;
  /** Sabotage defense % subtracted from the 30% base success roll. */
  defense: number;
  /** Points a visitor pays to attempt to destroy this showcase. */
  sabotageCost: number;
  /** Tailwind class for the frame glow / accent. */
  accent: string;
  /** Tailwind class for the display-case body tint. */
  body: string;
  /** Short description for the shop card. */
  blurb: string;
  icon: string;
}

// 1/10 경제 정책 (20260714) — 가격/사보타지 비용 모두 ÷10.
// 서버 showcase_price / showcase_sabotage_cost (=price × 0.1) 와 일치.
export const SHOWCASES: Record<ShowcaseType, ShowcaseSpec> = {
  basic: {
    key: "basic",
    name: "기본 진열대",
    tagline: "STARTER PEDESTAL",
    price: 1_000,
    capacity: 1,
    defense: 3,
    sabotageCost: 100,
    accent: "ring-zinc-400/40 shadow-[0_0_6px_rgba(212,212,216,0.2)]",
    body: "from-zinc-700 to-zinc-800",
    blurb: "가볍게 카드 한 장을 올려두는 기본 진열대. 방어 3%.",
    icon: "🪵",
  },
  glass: {
    key: "glass",
    name: "유리 쇼케이스",
    tagline: "GLASS SHOWCASE",
    price: 10_000,
    capacity: 1,
    defense: 5,
    sabotageCost: 1_000,
    accent: "ring-sky-300/60 shadow-[0_0_8px_rgba(56,189,248,0.28)]",
    body: "from-sky-800 to-zinc-900",
    blurb: "투명한 유리 쇼케이스. 방어 5%.",
    icon: "🔷",
  },
  premium: {
    key: "premium",
    name: "프리미엄 디스플레이",
    tagline: "PREMIUM DISPLAY",
    price: 30_000,
    capacity: 1,
    defense: 10,
    sabotageCost: 3_000,
    accent: "ring-fuchsia-300/70 shadow-[0_0_10px_rgba(232,121,249,0.4)]",
    body: "from-fuchsia-900 to-zinc-950",
    blurb: "은은한 조명이 켜지는 프리미엄 전시함. 방어 10%.",
    icon: "💠",
  },
  legendary: {
    key: "legendary",
    name: "레전더리 보관함",
    tagline: "LEGENDARY VAULT",
    price: 100_000,
    capacity: 1,
    defense: 15,
    sabotageCost: 10_000,
    accent: "ring-amber-300/80 shadow-[0_0_14px_rgba(251,191,36,0.5)]",
    body: "from-amber-900 to-zinc-950",
    blurb: "금장 프레임의 전설의 보관함. 방어 15%.",
    icon: "👑",
  },
};

/** Base sabotage success rate before showcase defense is subtracted. */
export const SABOTAGE_BASE_RATE = 30;

export const SHOWCASE_ORDER: ShowcaseType[] = [
  "basic",
  "glass",
  "premium",
  "legendary",
];

// Grid the UI renders. Server checks slot_x < 8 / slot_y < 12, so we
// stay within that bound.
export const CENTER_GRID_COLS = 6;
export const CENTER_GRID_ROWS = 6;

// 20260714 의 slab_income_trade 값과 동기화 (1/10 경제 정책).
// 30분 주기 1회 정산 시 지급되는 per-cycle 값. 시간당 환산하려면 ×2.
const SLAB_INCOME_TRADE: Record<string, Record<number, number>> = {
  MUR: { 10: 60_000, 9: 30_000, 8: 12_000, 7: 6_000, 6: 3_000 },
  UR: { 10: 36_000, 9: 18_000, 8: 7_200, 7: 3_600, 6: 1_800 },
  SAR: { 10: 24_000, 9: 12_000, 8: 4_800, 7: 2_400, 6: 1_200 },
  MA: { 10: 18_000, 9: 9_000, 8: 3_600, 7: 1_800, 6: 900 },
  SR: { 10: 12_000, 9: 6_000, 8: 2_400, 7: 1_200, 6: 600 },
  AR: { 10: 8_000, 9: 4_000, 8: 1_600, 7: 800, 6: 400 },
  RR: { 10: 5_000, 9: 2_500, 8: 1_000, 7: 500, 6: 250 },
  R: { 10: 3_000, 9: 1_500, 8: 600, 7: 300, 6: 150 },
  U: { 10: 2_000, 9: 1_000, 8: 400, 7: 200, 6: 100 },
  C: { 10: 1_500, 9: 750, 8: 300, 7: 150, 6: 75 },
};

export function slabIncomeTrade(rarity: string, grade: number): number {
  return SLAB_INCOME_TRADE[rarity]?.[grade] ?? 0;
}

/** 30분당 랭킹 점수 — 서버 slab_income_rank 와 정합 (분모 1200). */
export function slabIncomeRank(rarity: string, grade: number): number {
  return Math.floor(slabIncomeTrade(rarity, grade) / 1200);
}
