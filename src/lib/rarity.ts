import type { Rarity } from "./types";

export const RARITY_ORDER: Rarity[] = [
  "UR",
  "MUR",
  "SAR",
  "MA",
  "SR",
  "AR",
  "RR",
  "R",
  "U",
  "C",
];

export const RARITY_LABEL: Record<Rarity, string> = {
  C: "커먼",
  U: "언커먼",
  R: "레어",
  RR: "더블레어",
  AR: "아트레어",
  SR: "슈퍼레어",
  SAR: "스페셜 아트레어",
  MA: "메가 어택",
  MUR: "메가 울트라레어",
  UR: "울트라레어",
};

export const RARITY_STYLE: Record<
  Rarity,
  { badge: string; frame: string; glow: string; tier: number }
> = {
  C: {
    badge: "bg-zinc-600 text-zinc-100",
    frame: "ring-zinc-500/30",
    glow: "",
    tier: 0,
  },
  U: {
    badge: "bg-emerald-600 text-white",
    frame: "ring-emerald-400/30",
    glow: "",
    tier: 1,
  },
  R: {
    badge: "bg-sky-600 text-white",
    frame: "ring-sky-400/40",
    glow: "shadow-[0_0_10px_rgba(56,189,248,0.18)]",
    tier: 2,
  },
  RR: {
    badge: "bg-indigo-600 text-white",
    frame: "ring-indigo-400/50",
    glow: "shadow-[0_0_12px_rgba(129,140,248,0.24)]",
    tier: 3,
  },
  AR: {
    badge: "bg-fuchsia-600 text-white",
    frame: "ring-fuchsia-400/60",
    glow: "shadow-[0_0_14px_rgba(232,121,249,0.28)]",
    tier: 4,
  },
  SR: {
    badge: "bg-amber-500 text-zinc-950",
    frame: "ring-amber-300/70",
    glow: "shadow-[0_0_16px_rgba(251,191,36,0.32)]",
    tier: 5,
  },
  MA: {
    badge: "bg-orange-500 text-white",
    frame: "ring-orange-300/80",
    glow: "shadow-[0_0_18px_rgba(251,146,60,0.32)]",
    tier: 6,
  },
  SAR: {
    badge: "bg-gradient-to-r from-pink-500 via-fuchsia-500 to-violet-500 text-white",
    frame: "ring-fuchsia-300/80",
    glow: "shadow-[0_0_20px_rgba(236,72,153,0.38)]",
    tier: 7,
  },
  MUR: {
    badge:
      "bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 text-zinc-950",
    frame: "ring-amber-300/90",
    glow: "shadow-[0_0_24px_rgba(251,191,36,0.45)]",
    tier: 8,
  },
  UR: {
    badge:
      "bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-500 text-zinc-950",
    frame: "ring-yellow-300/90",
    glow: "shadow-[0_0_26px_rgba(250,204,21,0.5)]",
    tier: 9,
  },
};

export function compareRarity(a: Rarity, b: Rarity): number {
  return RARITY_ORDER.indexOf(a) - RARITY_ORDER.indexOf(b);
}

export function isHighRarity(r: Rarity): boolean {
  return RARITY_STYLE[r].tier >= 4;
}

/**
 * Returns the CSS class name of the card-art effect overlay for a given
 * rarity, or null if no effect should render. Only MUR and SAR get
 * effects; every other rarity stays visually plain.
 */
export function cardFxClass(r: Rarity): "fx-mur" | "fx-sar" | null {
  if (r === "MUR") return "fx-mur";
  if (r === "SAR") return "fx-sar";
  return null;
}

// Points the merchant pays when buying a card of this rarity.
// 상인 단가표 (경제 리밸런스 후):
//   MUR 1,000,000 · UR 600,000 · SAR 600,000 · SR 400,000
//   MA 200,000 · AR 200,000 · RR 100,000 · 그 외 50,000
export const MERCHANT_PRICE: Record<Rarity, number> = {
  C: 50_000,
  U: 50_000,
  R: 50_000,
  RR: 100_000,
  AR: 200_000,
  MA: 200_000,
  SR: 400_000,
  SAR: 600_000,
  UR: 600_000,
  MUR: 1_000_000,
};

// Bulk-sell payout (지갑 → 일괄판매). 상인 단가 대비 약 1/40. 속도만
// 장점 — 상인 · 선물 · 센터 전시가 훨씬 이득이고, 일괄판매는 정말
// 정리용.
export const BULK_SELL_PRICE: Record<Rarity, number> = {
  C: 25,
  U: 50,
  R: 100,
  RR: 200,
  AR: 500,
  SR: 1_000,
  MA: 1_000,
  SAR: 3_000,
  UR: 5_000,
  MUR: 10_000,
};

// Cost in points to open one sealed booster box.
export const BOX_COST: Record<string, number> = {
  m2a: 50_000,
  m2: 40_000,
  sv8: 30_000,
  sv2a: 35_000,
  sv8a: 40_000,
  sv5a: 30_000,
};
