// Showcase catalog for the "내 포켓몬센터" (museum) feature.
// Prices/capacities MUST mirror supabase/center-v1.sql exactly so the
// client-side UI matches the server's authoritative check.

export type ShowcaseType = "basic" | "glass" | "premium" | "legendary";

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
    defense: 0,
    sabotageCost: 30_000,
    // note: all showcases are 1-slot; tiers differ by price + defense only.
    accent: "ring-zinc-400/40 shadow-[0_0_6px_rgba(212,212,216,0.2)]",
    body: "from-zinc-700 to-zinc-800",
    blurb: "가볍게 카드 한 장을 올려두는 기본 진열대. 방어 0%.",
    icon: "🪵",
  },
  glass: {
    key: "glass",
    name: "유리 쇼케이스",
    tagline: "GLASS SHOWCASE",
    price: 30_000,
    capacity: 1,
    defense: 2,
    sabotageCost: 50_000,
    accent: "ring-sky-300/60 shadow-[0_0_8px_rgba(56,189,248,0.28)]",
    body: "from-sky-800 to-zinc-900",
    blurb: "투명한 유리 쇼케이스. 방어 2%.",
    icon: "🔷",
  },
  premium: {
    key: "premium",
    name: "프리미엄 디스플레이",
    tagline: "PREMIUM DISPLAY",
    price: 100_000,
    capacity: 1,
    defense: 5,
    sabotageCost: 100_000,
    accent: "ring-fuchsia-300/70 shadow-[0_0_10px_rgba(232,121,249,0.4)]",
    body: "from-fuchsia-900 to-zinc-950",
    blurb: "은은한 조명이 켜지는 프리미엄 전시함. 방어 5%.",
    icon: "💠",
  },
  legendary: {
    key: "legendary",
    name: "레전더리 보관함",
    tagline: "LEGENDARY VAULT",
    price: 300_000,
    capacity: 1,
    defense: 10,
    sabotageCost: 200_000,
    accent: "ring-amber-300/80 shadow-[0_0_14px_rgba(251,191,36,0.5)]",
    body: "from-amber-900 to-zinc-950",
    blurb: "금장 프레임의 전설의 보관함. 방어 10%.",
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
export const CENTER_GRID_COLS = 4;
export const CENTER_GRID_ROWS = 6;
