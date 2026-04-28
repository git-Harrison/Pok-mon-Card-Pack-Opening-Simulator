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

export const SHOWCASES: Record<ShowcaseType, ShowcaseSpec> = {
  basic: {
    key: "basic",
    name: "기본 진열대",
    tagline: "STARTER PEDESTAL",
    price: 10_000,
    capacity: 1,
    defense: 3,
    sabotageCost: 1_000,
    // note: all showcases are 1-slot; tiers differ by price + defense only.
    accent: "ring-zinc-400/40 shadow-[0_0_6px_rgba(212,212,216,0.2)]",
    body: "from-zinc-700 to-zinc-800",
    blurb: "가볍게 카드 한 장을 올려두는 기본 진열대. 방어 3%.",
    icon: "🪵",
  },
  glass: {
    key: "glass",
    name: "유리 쇼케이스",
    tagline: "GLASS SHOWCASE",
    price: 100_000,
    capacity: 1,
    defense: 5,
    sabotageCost: 10_000,
    accent: "ring-sky-300/60 shadow-[0_0_8px_rgba(56,189,248,0.28)]",
    body: "from-sky-800 to-zinc-900",
    blurb: "투명한 유리 쇼케이스. 방어 5%.",
    icon: "🔷",
  },
  premium: {
    key: "premium",
    name: "프리미엄 디스플레이",
    tagline: "PREMIUM DISPLAY",
    price: 300_000,
    capacity: 1,
    defense: 10,
    sabotageCost: 30_000,
    accent: "ring-fuchsia-300/70 shadow-[0_0_10px_rgba(232,121,249,0.4)]",
    body: "from-fuchsia-900 to-zinc-950",
    blurb: "은은한 조명이 켜지는 프리미엄 전시함. 방어 10%.",
    icon: "💠",
  },
  legendary: {
    key: "legendary",
    name: "레전더리 보관함",
    tagline: "LEGENDARY VAULT",
    price: 1_000_000,
    capacity: 1,
    defense: 15,
    sabotageCost: 100_000,
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

// 20260614_showcase_income_lowrarity_buff.sql 의 slab_income_trade
// 값과 동기화. 30분 주기 1회 정산 시 지급되는 per-cycle 값.
// 시간당 환산하려면 ×2. AR/RR/R/U/C 신규 적립 추가 + 전체 2x 상향.
const SLAB_INCOME_TRADE: Record<string, Record<number, number>> = {
  MUR: { 10: 600_000, 9: 300_000, 8: 120_000, 7: 60_000, 6: 30_000 },
  UR: { 10: 360_000, 9: 180_000, 8: 72_000, 7: 36_000, 6: 18_000 },
  SAR: { 10: 240_000, 9: 120_000, 8: 48_000, 7: 24_000, 6: 12_000 },
  MA: { 10: 180_000, 9: 90_000, 8: 36_000, 7: 18_000, 6: 9_000 },
  SR: { 10: 120_000, 9: 60_000, 8: 24_000, 7: 12_000, 6: 6_000 },
  AR: { 10: 80_000, 9: 40_000, 8: 16_000, 7: 8_000, 6: 4_000 },
  RR: { 10: 50_000, 9: 25_000, 8: 10_000, 7: 5_000, 6: 2_500 },
  R: { 10: 30_000, 9: 15_000, 8: 6_000, 7: 3_000, 6: 1_500 },
  U: { 10: 20_000, 9: 10_000, 8: 4_000, 7: 2_000, 6: 1_000 },
  C: { 10: 15_000, 9: 7_500, 8: 3_000, 7: 1_500, 6: 750 },
};

export function slabIncomeTrade(rarity: string, grade: number): number {
  return SLAB_INCOME_TRADE[rarity]?.[grade] ?? 0;
}

/** 30분당 랭킹 점수 — 서버 slab_income_rank 와 정합 (분모 1200). */
export function slabIncomeRank(rarity: string, grade: number): number {
  return Math.floor(slabIncomeTrade(rarity, grade) / 1200);
}
