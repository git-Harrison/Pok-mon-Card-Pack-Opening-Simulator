"use client";

/**
 * PageBackdrop — page-specific themed full-viewport backdrop.
 *
 * IMPORTANT: this component intentionally mirrors the proven mounting
 * pattern from <CenterBackdrop> in CenterView.tsx — a `fixed inset-0 -z-10`
 * element rendered DIRECTLY by each page component, not from the root
 * layout. Earlier attempts that mounted a single global backdrop inside
 * `<main>` rendered nothing visible in production because:
 *   1) Pages wrap their root in `relative` containers that establish a
 *      stacking context, isolating any negative-z-index sibling above
 *      them in the layout tree.
 *   2) The Pokémon Showdown PNGs we layered on top are external and
 *      occasionally blocked / 404 / blend-mode quirks → invisible.
 *
 * So instead of being clever, this component now:
 *   - Is mounted INSIDE each page-view component (WalletView, ProfileView,
 *     UsersView, PokedexView, WildView, GradingView, GiftsView, AdminView).
 *   - Renders ONLY CSS gradients — no network image dependency.
 *   - Uses vivid, distinctive multi-stop radial + linear gradients that
 *     read clearly at first paint.
 *
 * Each tone is visually distinct so the user can FEEL which page they're
 * on at a glance.
 */

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useIsMobile } from "@/lib/useIsMobile";

export type BackdropTone =
  | "amber"      // wallet — treasure / gold vault
  | "parchment"  // pokedex — warm library
  | "stadium"    // users — coliseum / leaderboard
  | "sky"        // profile — trainer hometown sky
  | "admin"      // admin — dark control room
  | "meadow"     // gifts — friendly meadow / sunset
  | "forest"     // wild idle — forest biome
  | "lab";       // grading — research lab

interface ToneSpec {
  /** Base gradient stack — painted on the first fixed -z-10 layer. */
  base: string;
  /** Aurora blob colors (Tailwind utility), three blobs. */
  blobs: [string, string, string];
  /** Subtle dot pattern color. */
  dot: string;
  /** Whether to render twinkling sparkles. */
  sparkles: boolean;
  /** Sparkle fill color. */
  sparkleFill: string;
  /** Optional decorative bottom band CSS gradient (or null). */
  bottomBand: string | null;
}

const TONES: Record<BackdropTone, ToneSpec> = {
  // 지갑 — 황금 보물창고
  amber: {
    base:
      "radial-gradient(120% 80% at 20% -10%, rgba(251,191,36,0.55) 0%, rgba(180,83,9,0.40) 35%, rgba(20,12,4,0.95) 75%), linear-gradient(180deg, #2a1d08 0%, #150d04 60%, #0a0602 100%)",
    blobs: ["bg-amber-400/25", "bg-orange-400/15", "bg-yellow-300/15"],
    dot: "rgba(251,191,36,0.55)",
    sparkles: true,
    sparkleFill: "rgba(252,211,77,0.9)",
    bottomBand:
      "linear-gradient(180deg, transparent 60%, rgba(120,60,8,0.35) 90%, rgba(8,4,2,0.55) 100%)",
  },
  // 도감 — 양피지 도서관
  parchment: {
    base:
      "radial-gradient(110% 75% at 80% 0%, rgba(217,119,6,0.50) 0%, rgba(120,53,15,0.40) 38%, rgba(10,7,4,0.95) 80%), linear-gradient(180deg, #2a1d0a 0%, #150c05 55%, #08060a 100%)",
    blobs: ["bg-amber-500/20", "bg-orange-700/15", "bg-yellow-200/10"],
    dot: "rgba(252,231,180,0.50)",
    sparkles: false,
    sparkleFill: "rgba(252,211,77,0.75)",
    bottomBand:
      "linear-gradient(180deg, transparent 55%, rgba(80,42,12,0.35) 85%, rgba(8,5,2,0.55) 100%)",
  },
  // 트레이너 — 콜로세움 / 명예의 전당
  stadium: {
    base:
      "radial-gradient(120% 80% at 50% -10%, rgba(244,114,182,0.50) 0%, rgba(99,102,241,0.40) 35%, rgba(8,6,16,0.95) 78%), linear-gradient(180deg, #1a0e2a 0%, #0d0820 55%, #050410 100%)",
    blobs: ["bg-fuchsia-400/20", "bg-amber-300/15", "bg-indigo-400/15"],
    dot: "rgba(251,191,36,0.45)",
    sparkles: true,
    sparkleFill: "rgba(253,164,175,0.9)",
    bottomBand:
      "linear-gradient(180deg, transparent 60%, rgba(80,30,80,0.35) 88%, rgba(4,3,8,0.6) 100%)",
  },
  // 프로필 — 트레이너의 하늘
  sky: {
    base:
      "radial-gradient(120% 80% at 30% -10%, rgba(56,189,248,0.55) 0%, rgba(99,102,241,0.40) 40%, rgba(6,8,18,0.95) 82%), linear-gradient(180deg, #0c1a3a 0%, #08122a 50%, #050a18 100%)",
    blobs: ["bg-sky-400/25", "bg-indigo-400/15", "bg-violet-400/15"],
    dot: "rgba(186,230,253,0.45)",
    sparkles: false,
    sparkleFill: "rgba(186,230,253,0.85)",
    bottomBand:
      "linear-gradient(180deg, transparent 55%, rgba(30,70,140,0.35) 85%, rgba(4,8,18,0.6) 100%)",
  },
  // 관리자 — 어둠의 통제실
  admin: {
    base:
      "radial-gradient(120% 80% at 70% 0%, rgba(244,63,94,0.45) 0%, rgba(127,29,29,0.40) 38%, rgba(10,4,4,0.96) 78%), linear-gradient(180deg, #1a0808 0%, #100404 55%, #060202 100%)",
    blobs: ["bg-rose-500/20", "bg-zinc-300/10", "bg-rose-400/15"],
    dot: "rgba(244,114,182,0.40)",
    sparkles: false,
    sparkleFill: "rgba(244,114,182,0.7)",
    bottomBand:
      "linear-gradient(180deg, transparent 55%, rgba(80,8,12,0.35) 85%, rgba(8,2,2,0.6) 100%)",
  },
  // 선물함 — 따뜻한 보랏빛 황혼 / 친근한 들판
  meadow: {
    base:
      "radial-gradient(120% 80% at 50% -10%, rgba(251,191,36,0.50) 0%, rgba(190,24,93,0.38) 38%, rgba(10,6,12,0.95) 80%), linear-gradient(180deg, #2a0e22 0%, #160818 55%, #08040a 100%)",
    blobs: ["bg-amber-300/20", "bg-fuchsia-400/15", "bg-rose-300/15"],
    dot: "rgba(251,191,36,0.40)",
    sparkles: true,
    sparkleFill: "rgba(253,224,71,0.85)",
    bottomBand:
      "linear-gradient(180deg, transparent 55%, rgba(80,20,60,0.35) 85%, rgba(8,3,8,0.6) 100%)",
  },
  // 야생 — 숲 / 자연 바이옴
  forest: {
    base:
      "radial-gradient(120% 80% at 30% -10%, rgba(34,197,94,0.45) 0%, rgba(16,101,42,0.40) 38%, rgba(4,12,8,0.95) 80%), linear-gradient(180deg, #0a2014 0%, #061410 55%, #030806 100%)",
    blobs: ["bg-emerald-400/20", "bg-lime-400/12", "bg-teal-400/15"],
    dot: "rgba(134,239,172,0.40)",
    sparkles: false,
    sparkleFill: "rgba(134,239,172,0.85)",
    bottomBand:
      "linear-gradient(180deg, transparent 55%, rgba(8,40,20,0.40) 85%, rgba(2,6,3,0.65) 100%)",
  },
  // 감별 — 연구실 (보라/시안)
  lab: {
    base:
      "radial-gradient(120% 80% at 60% -10%, rgba(168,85,247,0.50) 0%, rgba(34,211,238,0.32) 40%, rgba(8,6,18,0.95) 80%), linear-gradient(180deg, #160a2a 0%, #0a0820 55%, #050410 100%)",
    blobs: ["bg-fuchsia-400/22", "bg-cyan-400/15", "bg-violet-400/18"],
    dot: "rgba(216,180,254,0.45)",
    sparkles: true,
    sparkleFill: "rgba(216,180,254,0.85)",
    bottomBand:
      "linear-gradient(180deg, transparent 55%, rgba(60,20,100,0.35) 85%, rgba(6,4,16,0.6) 100%)",
  },
};

export default function PageBackdrop({ tone }: { tone: BackdropTone }) {
  const reduce = useReducedMotion();
  const isMobile = useIsMobile();
  const spec = TONES[tone];

  // 데스크탑 sparkle 위치 (모바일에서는 어차피 마운트 안 됨).
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

  // 모바일에서는 배경 레이어 자체를 마운트하지 않는다. body 의 단색 dark
  // 배경만 보여주기로 합의 (PC 만 화려하게). 그라데이션 + blur blob +
  // dot pattern + 톤별 데코(숲 실루엣, 격자, 책장 줄무늬, 별빛 sparkle)
  // 가 모바일 GPU 합성기 부담을 주는 주범이었음.
  if (isMobile) return null;

  // Pokedex tone gets a soft "library shelf" stripe near the top edge.
  const showBookshelf = tone === "parchment";

  return (
    <>
      {/* ---------- Layer 1: solid base gradient (always paints) ---------- */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          backgroundImage: spec.base,
          backgroundSize: "100% 100%",
          backgroundRepeat: "no-repeat",
        }}
      />
      {/* ---------- Layer 2: aurora blobs + decoration (above base, still behind content) ---------- */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <div
          className={`absolute -top-40 left-1/2 -translate-x-1/2 w-[820px] h-[820px] max-w-[120vw] rounded-full ${spec.blobs[0]} blur-2xl md:blur-3xl`}
        />
        <div
          className={`absolute top-40 -left-20 w-[420px] h-[420px] max-w-[80vw] rounded-full ${spec.blobs[1]} blur-2xl md:blur-3xl`}
        />
        <div
          className={`absolute top-20 -right-20 w-[420px] h-[420px] max-w-[80vw] rounded-full ${spec.blobs[2]} blur-2xl md:blur-3xl`}
        />

        {/* Dot pattern */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: `radial-gradient(circle at center, ${spec.dot} 0 1.6px, transparent 1.7px)`,
            backgroundSize: "30px 30px",
          }}
        />

        {/* Sky tone — soft cloud puffs */}
        {tone === "sky" && (
          <>
            <div className="absolute top-[18%] left-[8%] w-56 h-20 rounded-full bg-white/[0.06] blur-2xl" />
            <div className="absolute top-[36%] right-[6%] w-72 h-24 rounded-full bg-sky-100/[0.07] blur-2xl" />
            <div className="absolute top-[58%] left-[22%] w-48 h-16 rounded-full bg-white/[0.05] blur-2xl" />
          </>
        )}

        {/* Forest tone — distant tree silhouettes near bottom */}
        {tone === "forest" && (
          <div
            className="absolute inset-x-0 bottom-0 h-40 opacity-[0.35]"
            style={{
              backgroundImage:
                "radial-gradient(60px 80px at 8% 100%, rgba(6,30,16,0.95) 0%, transparent 65%)," +
                "radial-gradient(80px 110px at 22% 100%, rgba(6,30,16,0.95) 0%, transparent 65%)," +
                "radial-gradient(70px 90px at 38% 100%, rgba(6,30,16,0.95) 0%, transparent 65%)," +
                "radial-gradient(90px 120px at 56% 100%, rgba(6,30,16,0.95) 0%, transparent 65%)," +
                "radial-gradient(70px 95px at 74% 100%, rgba(6,30,16,0.95) 0%, transparent 65%)," +
                "radial-gradient(80px 110px at 92% 100%, rgba(6,30,16,0.95) 0%, transparent 65%)",
            }}
          />
        )}

        {/* Stadium tone — distant arched coliseum tier band near top */}
        {tone === "stadium" && (
          <div
            className="absolute inset-x-0 top-[12%] h-24 opacity-[0.18]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, rgba(244,114,182,0.55) 0 18px, rgba(99,102,241,0.0) 18px 30px, rgba(251,191,36,0.5) 30px 38px, rgba(99,102,241,0.0) 38px 56px)",
              maskImage:
                "linear-gradient(180deg, rgba(0,0,0,0.65), rgba(0,0,0,0))",
              WebkitMaskImage:
                "linear-gradient(180deg, rgba(0,0,0,0.65), rgba(0,0,0,0))",
            }}
          />
        )}

        {/* Lab tone — faint grid floor */}
        {tone === "lab" && (
          <div
            className="absolute inset-0 opacity-[0.10]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(216,180,254,0.55) 1px, transparent 1px), linear-gradient(90deg, rgba(216,180,254,0.55) 1px, transparent 1px)",
              backgroundSize: "44px 44px",
              maskImage:
                "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.6) 60%, rgba(0,0,0,0.9) 100%)",
              WebkitMaskImage:
                "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.6) 60%, rgba(0,0,0,0.9) 100%)",
            }}
          />
        )}

        {/* Admin tone — angular grid scanlines */}
        {tone === "admin" && (
          <div
            className="absolute inset-0 opacity-[0.10]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, rgba(244,114,182,0.55) 0 1px, transparent 1px 4px)",
            }}
          />
        )}

        {/* Parchment tone — bookshelf stripe at top edge */}
        {showBookshelf && (
          <div
            className="absolute top-0 inset-x-0 h-24 opacity-[0.22]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, rgba(180,120,60,0.6) 0 6px, rgba(120,72,30,0.0) 6px 16px, rgba(160,100,50,0.55) 16px 22px, rgba(120,72,30,0.0) 22px 34px, rgba(200,140,70,0.55) 34px 40px, rgba(120,72,30,0.0) 40px 56px)",
              maskImage:
                "linear-gradient(180deg, rgba(0,0,0,0.65), rgba(0,0,0,0))",
              WebkitMaskImage:
                "linear-gradient(180deg, rgba(0,0,0,0.65), rgba(0,0,0,0))",
            }}
          />
        )}

        {/* Bottom decorative band */}
        {spec.bottomBand && (
          <div
            className="absolute inset-x-0 bottom-0 h-[55%]"
            style={{ backgroundImage: spec.bottomBand }}
          />
        )}

        {/* Optional sparkle / star field */}
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
    </>
  );
}
