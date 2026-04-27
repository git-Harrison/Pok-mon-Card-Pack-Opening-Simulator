import type { Rarity } from "./types";

/** PCL 감정 대상 등급 — 모든 등급의 카드를 감별할 수 있음. */
export const PCL_ELIGIBLE_RARITIES: readonly Rarity[] = [
  "C",
  "U",
  "R",
  "RR",
  "AR",
  "SR",
  "MA",
  "SAR",
  "UR",
  "MUR",
] as const;

export function isPclEligible(rarity: Rarity): boolean {
  return (PCL_ELIGIBLE_RARITIES as readonly Rarity[]).includes(rarity);
}

/** Display brand for our grading system. */
export const GRADE_BRAND = "PCL";

/**
 * PCL grade → display label mapping.
 */
export const PCL_LABEL: Record<number, string> = {
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
 * Bulk-sell price per PCL grade. Must mirror `pcl_sell_price()` in
 * supabase/migrations/20260574_pcl_sell_price_anti_dupe.sql.
 * 돈복사 방지를 위해 대폭 인하 — 박스 가격(30~50k) 대비 환산 평균
 * 이 카드당 ~400p 수준이라 한 박스(150장) 풀 감별 시 박스 비용
 * 정도만 회수 (이전엔 ~40× 폭리). PCL 9/10 은 lottery 성격으로 유지.
 */
export const PCL_SELL_PRICE: Record<number, number> = {
  10: 10_000,
  9: 5_000,
  8: 1_000,
  7: 150,
  6: 100,
};

/**
 * Premium tone per PCL grade. Palette moves from:
 *   10  → rich gold (chase rarity)
 *   9   → platinum / silver-white
 *   8   → teal
 *   7   → sky / azure
 *   6   → lavender
 *   5~4 → slate neutral
 *   3~1 → cool gray
 * No more primary red/green that looked childish.
 */
export function pclTone(grade: number): {
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
