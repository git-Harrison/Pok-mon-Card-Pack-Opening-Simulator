import type { Rarity } from "./types";

/** AURA 감정 대상 등급 — SR/MA/SAR/MUR/UR 카드만 맡길 수 있음. */
export const PSA_ELIGIBLE_RARITIES: readonly Rarity[] = [
  "SR",
  "MA",
  "SAR",
  "MUR",
  "UR",
] as const;

export function isPsaEligible(rarity: Rarity): boolean {
  return (PSA_ELIGIBLE_RARITIES as readonly Rarity[]).includes(rarity);
}

/** Display brand for our grading system (replaces "PSA"). */
export const GRADE_BRAND = "PCL";

/**
 * PSA grade → display label mapping.
 * See https://www.psacard.com/resources/gradingstandards for reference.
 */
export const PSA_LABEL: Record<number, string> = {
  10: "GEM MINT",
  9: "MINT",
  8: "NM-MT",
  7: "NEAR MINT",
  6: "EX-MT",
  5: "EXCELLENT",
  4: "VG-EX",
  3: "VERY GOOD",
  2: "GOOD",
  1: "POOR",
};

/**
 * 감정 확률. 실패 70% + 성공 30% (등급 6~10).
 * 10등급: 0.5% · 9등급: 3.5% · 8등급: 8% · 7등급: 10% · 6등급: 8%
 */
export const PSA_FAIL_PCT = 70;

export const PSA_DISTRIBUTION = [
  { grade: 10, pct: 0.5 },
  { grade: 9, pct: 3.5 },
  { grade: 8, pct: 8 },
  { grade: 7, pct: 10 },
  { grade: 6, pct: 8 },
];

/**
 * Bulk-sell price per PCL grade. Must mirror `pcl_sell_price()` in
 * supabase/migrations/20260425_bulk_sell_pcl.sql — the server enforces.
 */
export const PCL_SELL_PRICE: Record<number, number> = {
  10: 200_000,
  9: 100_000,
  8: 20_000,
  7: 10_000,
  6: 10_000,
};

/**
 * Premium tone per PSA grade. Palette moves from:
 *   10  → rich gold (chase rarity)
 *   9   → platinum / silver-white
 *   8   → teal
 *   7   → sky / azure
 *   6   → lavender
 *   5~4 → slate neutral
 *   3~1 → cool gray
 * No more primary red/green that looked childish.
 */
export function psaTone(grade: number): {
  text: string;
  ring: string;
  glow: string;
  banner: string;
} {
  if (grade >= 10)
    return {
      text: "text-amber-300",
      ring: "ring-amber-300/70",
      glow: "shadow-[0_0_40px_rgba(251,191,36,0.9)]",
      banner:
        "bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 text-zinc-950",
    };
  if (grade === 9)
    return {
      text: "text-slate-100",
      ring: "ring-slate-200/60",
      glow: "shadow-[0_0_28px_rgba(226,232,240,0.55)]",
      banner:
        "bg-gradient-to-r from-slate-200 via-slate-100 to-slate-300 text-slate-900",
    };
  if (grade === 8)
    return {
      text: "text-teal-200",
      ring: "ring-teal-300/50",
      glow: "shadow-[0_0_22px_rgba(45,212,191,0.45)]",
      banner:
        "bg-gradient-to-r from-teal-500 to-cyan-500 text-white",
    };
  if (grade === 7)
    return {
      text: "text-sky-200",
      ring: "ring-sky-300/45",
      glow: "shadow-[0_0_18px_rgba(56,189,248,0.4)]",
      banner: "bg-gradient-to-r from-sky-600 to-sky-500 text-white",
    };
  if (grade === 6)
    return {
      text: "text-indigo-200",
      ring: "ring-indigo-300/45",
      glow: "shadow-[0_0_16px_rgba(129,140,248,0.4)]",
      banner: "bg-gradient-to-r from-indigo-600 to-violet-600 text-white",
    };
  if (grade === 5)
    return {
      text: "text-zinc-200",
      ring: "ring-zinc-300/30",
      glow: "",
      banner: "bg-gradient-to-r from-slate-600 to-slate-500 text-white",
    };
  return {
    text: "text-zinc-400",
    ring: "ring-zinc-500/30",
    glow: "",
    banner: "bg-zinc-700 text-zinc-200",
  };
}
