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
 * 감별 확률. 실패 70% + 성공 30% (등급 6~10).
 * 10등급: 1% · 9등급: 3% · 8등급: 8% · 7등급: 10% · 6등급: 8%
 */
export const PSA_FAIL_PCT = 70;

export const PSA_DISTRIBUTION = [
  { grade: 10, pct: 1 },
  { grade: 9, pct: 3 },
  { grade: 8, pct: 8 },
  { grade: 7, pct: 10 },
  { grade: 6, pct: 8 },
];

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
      text: "text-zinc-100",
      ring: "ring-zinc-300/60",
      glow: "shadow-[0_0_30px_rgba(228,228,231,0.6)]",
      banner:
        "bg-gradient-to-r from-zinc-200 via-white to-zinc-300 text-zinc-950",
    };
  if (grade === 8)
    return {
      text: "text-emerald-300",
      ring: "ring-emerald-400/60",
      glow: "shadow-[0_0_24px_rgba(52,211,153,0.5)]",
      banner: "bg-emerald-500 text-zinc-950",
    };
  if (grade === 7)
    return {
      text: "text-cyan-300",
      ring: "ring-cyan-400/50",
      glow: "shadow-[0_0_18px_rgba(34,211,238,0.4)]",
      banner: "bg-cyan-500 text-zinc-950",
    };
  if (grade >= 5)
    return {
      text: "text-sky-300",
      ring: "ring-sky-400/40",
      glow: "",
      banner: "bg-sky-600 text-white",
    };
  return {
    text: "text-zinc-400",
    ring: "ring-zinc-500/30",
    glow: "",
    banner: "bg-zinc-600 text-white",
  };
}
