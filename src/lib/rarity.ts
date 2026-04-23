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
    glow: "shadow-[0_0_18px_rgba(56,189,248,0.25)]",
    tier: 2,
  },
  RR: {
    badge: "bg-indigo-600 text-white",
    frame: "ring-indigo-400/50",
    glow: "shadow-[0_0_22px_rgba(129,140,248,0.4)]",
    tier: 3,
  },
  AR: {
    badge: "bg-fuchsia-600 text-white",
    frame: "ring-fuchsia-400/60",
    glow: "shadow-[0_0_24px_rgba(232,121,249,0.45)]",
    tier: 4,
  },
  SR: {
    badge: "bg-amber-500 text-zinc-950",
    frame: "ring-amber-300/70",
    glow: "shadow-[0_0_28px_rgba(251,191,36,0.55)]",
    tier: 5,
  },
  MA: {
    badge: "bg-orange-500 text-white",
    frame: "ring-orange-300/80",
    glow: "shadow-[0_0_30px_rgba(251,146,60,0.55)]",
    tier: 6,
  },
  SAR: {
    badge: "bg-gradient-to-r from-pink-500 via-fuchsia-500 to-violet-500 text-white",
    frame: "ring-fuchsia-300/80",
    glow: "shadow-[0_0_36px_rgba(236,72,153,0.65)]",
    tier: 7,
  },
  MUR: {
    badge:
      "bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 text-zinc-950",
    frame: "ring-amber-300/90",
    glow: "shadow-[0_0_44px_rgba(251,191,36,0.8)]",
    tier: 8,
  },
  UR: {
    badge:
      "bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-500 text-zinc-950",
    frame: "ring-yellow-300/90",
    glow: "shadow-[0_0_48px_rgba(250,204,21,0.9)]",
    tier: 9,
  },
};

export function compareRarity(a: Rarity, b: Rarity): number {
  return RARITY_ORDER.indexOf(a) - RARITY_ORDER.indexOf(b);
}

export function isHighRarity(r: Rarity): boolean {
  return RARITY_STYLE[r].tier >= 4;
}

// Points the merchant pays when buying a card of this rarity.
export const MERCHANT_PRICE: Record<Rarity, number> = {
  C: 20,
  U: 60,
  R: 150,
  RR: 400,
  AR: 800,
  SR: 1500,
  MA: 2200,
  SAR: 3500,
  MUR: 6000,
  UR: 6000,
};
