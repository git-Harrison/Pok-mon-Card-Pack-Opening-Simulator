import type { Rarity } from "./types";

// 등급 순서 (high → low). 사용자 정한 hierarchy:
//   MUR > UR > SAR > SR > AR > MA > RR > R > U > C
// 정렬 / 비교 / 컬렉션 표시에 모두 사용. tier 값과 일관성 유지.
export const RARITY_ORDER: Rarity[] = [
  "MUR",
  "UR",
  "SAR",
  "SR",
  "AR",
  "MA",
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
  // 사용자 정한 hierarchy (low → high tier 값):
  //   C(0) U(1) R(2) RR(3) MA(4) AR(5) SR(6) SAR(7) UR(8) MUR(9)
  MA: {
    badge: "bg-orange-500 text-white",
    frame: "ring-orange-300/80",
    glow: "shadow-[0_0_14px_rgba(251,146,60,0.28)]",
    tier: 4,
  },
  AR: {
    badge: "bg-fuchsia-600 text-white",
    frame: "ring-fuchsia-400/60",
    glow: "shadow-[0_0_16px_rgba(232,121,249,0.32)]",
    tier: 5,
  },
  SR: {
    badge: "bg-amber-500 text-zinc-950",
    frame: "ring-amber-300/70",
    glow: "shadow-[0_0_18px_rgba(251,191,36,0.32)]",
    tier: 6,
  },
  SAR: {
    badge: "bg-gradient-to-r from-pink-500 via-fuchsia-500 to-violet-500 text-white",
    frame: "ring-fuchsia-300/80",
    glow: "shadow-[0_0_20px_rgba(236,72,153,0.38)]",
    tier: 7,
  },
  UR: {
    badge:
      "bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-500 text-zinc-950",
    frame: "ring-yellow-300/90",
    glow: "shadow-[0_0_24px_rgba(250,204,21,0.45)]",
    tier: 8,
  },
  MUR: {
    badge:
      "bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 text-zinc-950",
    frame: "ring-amber-300/90",
    glow: "shadow-[0_0_26px_rgba(251,191,36,0.5)]",
    tier: 9,
  },
};

export function compareRarity(a: Rarity, b: Rarity): number {
  return RARITY_ORDER.indexOf(a) - RARITY_ORDER.indexOf(b);
}

export function cardFxClass(r: Rarity): "fx-mur" | "fx-sar" | null {
  if (r === "MUR") return "fx-mur";
  if (r === "SAR") return "fx-sar";
  return null;
}

// Bulk-sell payout (지갑 → 일괄판매). 정리용 단가.
// 돈복사 차단 위해 전반 50% 인하 + low-tier 추가 인하.
// 사용자 hierarchy 와 정합: C < U < R < RR < MA < AR < SR < SAR < UR < MUR.
// 서버 함수 bulk_sell_price() 와 mirror — 동기화 필수.
export const BULK_SELL_PRICE: Record<Rarity, number> = {
  C: 10,
  U: 25,
  R: 50,
  RR: 100,
  MA: 250,
  AR: 400,
  SR: 750,
  SAR: 1_500,
  UR: 2_500,
  MUR: 5_000,
};

// Cost in points to open one sealed booster box.
export const BOX_COST: Record<string, number> = {
  m2a: 50_000,
  m2: 40_000,
  sv8: 30_000,
  sv2a: 35_000,
  sv8a: 40_000,
  sv5a: 30_000,
  sv10: 35_000,
  m1l: 45_000,
  m1s: 45_000,
  m3: 50_000,
  m4: 50_000,
};
