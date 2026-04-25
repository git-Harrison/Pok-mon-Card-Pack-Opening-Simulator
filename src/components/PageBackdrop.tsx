"use client";

/**
 * PageBackdrop — page-specific themed ambient background.
 *
 * Inspired by HomeView's BackgroundFx (aurora blobs + subtle dot pattern +
 * optional star/sparkle field), but recolored per route via the `tone` prop.
 *
 * Usage: drop near the top of a page's render so it sits BEHIND content.
 *   <div className="relative ...">
 *     <PageBackdrop tone="amber" />
 *     ...content...
 *   </div>
 *
 * The component is `pointer-events-none` and `aria-hidden`. With reduced
 * motion, optional sparkles/stars are suppressed and remaining elements are
 * fully static. It also positions itself with `absolute inset-0 -z-10
 * overflow-hidden`, so it never causes horizontal scroll on mobile and never
 * intercepts clicks.
 */

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

export type BackdropTone =
  | "amber" // wallet — treasure / gold
  | "parchment" // pokedex — warm library
  | "stadium" // users — leaderboard gold + rose
  | "sky" // profile — trainer sky
  | "admin"; // admin — neutral / rose gravitas

interface ToneSpec {
  /** Three aurora blobs, by Tailwind bg utility. */
  blobs: [string, string, string];
  /** Dot pattern color (CSS color string used inside backgroundImage). */
  dot: string;
  /** Whether to render the sparkle/star field on top. */
  sparkles: boolean;
  /** Sparkle fill color (only used when sparkles is true). */
  sparkleFill: string;
}

const TONES: Record<BackdropTone, ToneSpec> = {
  amber: {
    blobs: ["bg-amber-400/15", "bg-rose-400/10", "bg-yellow-400/[0.08]"],
    dot: "rgba(251,191,36,0.5)",
    sparkles: true,
    sparkleFill: "rgba(252,211,77,0.85)",
  },
  parchment: {
    blobs: ["bg-amber-500/[0.12]", "bg-fuchsia-500/[0.08]", "bg-indigo-500/[0.08]"],
    dot: "rgba(252,231,180,0.45)",
    sparkles: false,
    sparkleFill: "rgba(252,211,77,0.75)",
  },
  stadium: {
    blobs: ["bg-amber-400/[0.12]", "bg-rose-400/10", "bg-fuchsia-400/[0.08]"],
    dot: "rgba(251,191,36,0.45)",
    sparkles: true,
    sparkleFill: "rgba(253,164,175,0.8)",
  },
  sky: {
    blobs: ["bg-sky-400/[0.12]", "bg-indigo-400/10", "bg-violet-400/[0.08]"],
    dot: "rgba(186,230,253,0.45)",
    sparkles: false,
    sparkleFill: "rgba(186,230,253,0.85)",
  },
  admin: {
    blobs: ["bg-rose-500/[0.10]", "bg-zinc-400/[0.08]", "bg-rose-400/[0.06]"],
    dot: "rgba(244,114,182,0.35)",
    sparkles: false,
    sparkleFill: "rgba(244,114,182,0.7)",
  },
};

export default function PageBackdrop({ tone }: { tone: BackdropTone }) {
  const reduce = useReducedMotion();
  const spec = TONES[tone];

  // Deterministic sparkle positions so SSR/CSR markup matches.
  const sparkles = useMemo(() => {
    if (!spec.sparkles) return [];
    const out: { x: number; y: number; r: number; d: number; o: number }[] = [];
    for (let i = 0; i < 22; i++) {
      out.push({
        x: ((i * 137) % 100) + ((i * 31) % 7) / 7,
        y: ((i * 61) % 100) + ((i * 17) % 5) / 5,
        r: 0.55 + ((i * 13) % 5) * 0.16,
        d: 2.4 + ((i * 7) % 5) * 0.55,
        o: 0.3 + ((i * 11) % 6) * 0.07,
      });
    }
    return out;
  }, [spec.sparkles]);

  // Defer sparkles to after mount to avoid framer-motion animation hydration
  // mismatches on initial render.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Pokedex tone gets a soft "library shelf" stripe near the top edge so the
  // book sits in a parchment-y room. Other tones skip this.
  const showBookshelf = tone === "parchment";

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* ---------- Aurora blobs ---------- */}
      <div
        className={`absolute -top-40 left-1/2 -translate-x-1/2 w-[820px] h-[820px] max-w-[120vw] rounded-full ${spec.blobs[0]} blur-3xl`}
      />
      <div
        className={`absolute top-40 -left-20 w-[420px] h-[420px] max-w-[80vw] rounded-full ${spec.blobs[1]} blur-3xl`}
      />
      <div
        className={`absolute top-20 -right-20 w-[420px] h-[420px] max-w-[80vw] rounded-full ${spec.blobs[2]} blur-3xl`}
      />

      {/* ---------- Dot pattern (very subtle) ---------- */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: `radial-gradient(circle at center, ${spec.dot} 0 1.6px, transparent 1.7px)`,
          backgroundSize: "30px 30px",
        }}
      />

      {/* ---------- Sky tone — soft cloud puffs ---------- */}
      {tone === "sky" && (
        <>
          <div className="absolute top-[18%] left-[8%] w-56 h-20 rounded-full bg-white/[0.05] blur-2xl" />
          <div className="absolute top-[36%] right-[6%] w-72 h-24 rounded-full bg-sky-100/[0.05] blur-2xl" />
          <div className="absolute top-[58%] left-[22%] w-48 h-16 rounded-full bg-white/[0.04] blur-2xl" />
        </>
      )}

      {/* ---------- Parchment tone — bookshelf stripe at top edge ---------- */}
      {showBookshelf && (
        <div
          className="absolute top-0 inset-x-0 h-24 opacity-[0.18]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, rgba(180,120,60,0.55) 0 6px, rgba(120,72,30,0.0) 6px 16px, rgba(160,100,50,0.5) 16px 22px, rgba(120,72,30,0.0) 22px 34px, rgba(200,140,70,0.5) 34px 40px, rgba(120,72,30,0.0) 40px 56px)",
            maskImage:
              "linear-gradient(180deg, rgba(0,0,0,0.65), rgba(0,0,0,0))",
            WebkitMaskImage:
              "linear-gradient(180deg, rgba(0,0,0,0.65), rgba(0,0,0,0))",
          }}
        />
      )}

      {/* ---------- Optional sparkle / star field ---------- */}
      <AnimatePresence>
        {spec.sparkles && mounted && !reduce && (
          <motion.svg
            key="sparkles"
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
          >
            {sparkles.map((s, i) => (
              <motion.circle
                key={i}
                cx={s.x}
                cy={s.y}
                r={s.r * 0.18}
                fill={spec.sparkleFill}
                initial={{ opacity: 0 }}
                animate={{ opacity: [s.o * 0.3, s.o, s.o * 0.3] }}
                transition={{
                  duration: s.d,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: (i % 7) * 0.3,
                }}
              />
            ))}
          </motion.svg>
        )}
      </AnimatePresence>
    </div>
  );
}
