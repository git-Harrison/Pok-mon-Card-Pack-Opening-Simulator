"use client";

import clsx from "clsx";
import { motion } from "framer-motion";
import type { Card } from "@/lib/types";
import { GRADE_BRAND, PSA_LABEL, psaTone } from "@/lib/psa";
import { SETS } from "@/lib/sets";

/**
 * PCL slab — dark-glass holographic encapsulation.
 * Layers: outer bezel → inner glass → card window → bottom barcode band.
 * Grade banner uses the rarity-tier-matched `psaTone(grade)` palette so the
 * whole component glows in the right hue without hard-coded color logic.
 */
export default function PsaSlab({
  card,
  grade,
  size = "md",
  highlight = false,
}: {
  card: Card;
  grade: number;
  size?: "sm" | "md" | "lg";
  highlight?: boolean;
}) {
  const tone = psaTone(grade);
  const label = PSA_LABEL[grade] ?? "";

  const width =
    size === "sm"
      ? "w-[150px]"
      : size === "lg"
      ? "w-[260px]"
      : "w-[200px]";

  return (
    <motion.div
      initial={false}
      animate={highlight ? { scale: [1, 1.03, 1] } : { scale: 1 }}
      transition={{ duration: 1.2, times: [0, 0.5, 1] }}
      className={clsx(
        "relative rounded-[22px] overflow-hidden isolate ring-1 select-none",
        "bg-[linear-gradient(160deg,#0b0918_0%,#130b28_45%,#070410_100%)]",
        tone.ring,
        tone.glow,
        width
      )}
      style={{
        boxShadow:
          "0 20px 40px -20px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.6)",
      }}
    >
      {/* Holographic diagonal sheen */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-70"
        style={{
          background:
            "linear-gradient(125deg, rgba(255,255,255,0) 0%, rgba(147,197,253,0.1) 20%, rgba(236,72,153,0.08) 40%, rgba(250,204,21,0.08) 60%, rgba(34,197,94,0.08) 80%, rgba(255,255,255,0) 100%)",
        }}
      />
      {/* Noise grain */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-[0.12] mix-blend-overlay"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.4) 1px, transparent 1px)",
          backgroundSize: "3px 3px",
        }}
      />

      {/* ── Brand header ── */}
      <div className="relative px-3 pt-2.5 pb-2 flex items-center gap-2">
        {/* Brand mark */}
        <div className="flex items-baseline gap-1 shrink-0">
          <span className="text-[9px] uppercase tracking-[0.4em] text-white/50 font-semibold">
            {GRADE_BRAND}
          </span>
          <span className="text-[8px] uppercase tracking-[0.3em] text-white/30">
            ▸ Graded
          </span>
        </div>
        <div className="flex-1 h-px bg-gradient-to-r from-white/5 via-white/15 to-white/5" />
        {/* Grade pill */}
        <div
          className={clsx(
            "shrink-0 inline-flex items-baseline gap-1 rounded-full px-2 py-0.5 font-black tabular-nums",
            tone.banner
          )}
        >
          <span className="text-[9px] uppercase tracking-widest font-bold opacity-80">
            G
          </span>
          <span className="text-sm md:text-base leading-none">{grade}</span>
        </div>
      </div>

      {/* ── Name + label line ── */}
      <div className="relative px-3 pb-2">
        <p className="text-[11px] md:text-[12px] font-bold text-white leading-tight line-clamp-1">
          {card.name}
        </p>
        <p
          className={clsx(
            "text-[8px] md:text-[9px] uppercase tracking-[0.28em] font-semibold mt-0.5",
            tone.text
          )}
        >
          {label}
        </p>
      </div>

      {/* ── Card window ── */}
      <div
        className="relative mx-3 rounded-[10px] overflow-hidden ring-1 ring-white/10"
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(0,0,0,0.3) 100%)",
          boxShadow:
            "inset 0 0 20px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.12)",
        }}
      >
        <div className="relative aspect-[5/7]">
          {card.imageUrl ? (
            <img
              src={card.imageUrl}
              alt={card.name}
              loading="lazy"
              draggable={false}
              className="w-full h-full object-contain bg-zinc-950 select-none pointer-events-none"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white text-xs p-2 text-center bg-gradient-to-br from-indigo-700 to-amber-600">
              {card.name}
            </div>
          )}
          {/* Glass reflection sweep */}
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 40%, rgba(255,255,255,0) 70%, rgba(255,255,255,0.08) 100%)",
            }}
          />
          {/* Bottom fade */}
          <div
            aria-hidden
            className="absolute left-0 right-0 bottom-0 h-12 pointer-events-none"
            style={{
              background:
                "linear-gradient(to top, rgba(0,0,0,0.55), rgba(0,0,0,0))",
            }}
          />
        </div>
      </div>

      {/* ── Bottom band: set + cert line + barcode ── */}
      <div className="relative px-3 pt-2 pb-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[8px] md:text-[9px] uppercase tracking-[0.18em] text-white/70 truncate">
              {SETS[card.setCode].name}
            </div>
            <div className="text-[8px] md:text-[9px] uppercase tracking-[0.18em] text-white/30 tabular-nums">
              #{card.number}
            </div>
          </div>
          <Barcode />
        </div>
        {/* Cert line — fake hash for flavor */}
        <div className="mt-1.5 text-[8px] font-mono text-white/30 tabular-nums truncate">
          PCL·{card.setCode.toUpperCase()}·{card.number}·{grade}
        </div>
      </div>
    </motion.div>
  );
}

function Barcode() {
  const bars = [1, 2, 1, 3, 1, 2, 2, 1, 3, 2, 1, 2, 1, 3, 1, 2, 3, 1, 2, 1];
  return (
    <div className="flex items-end h-5 gap-[1px] shrink-0 opacity-80">
      {bars.map((w, i) => (
        <span
          key={i}
          className="bg-white/70"
          style={{ width: `${w}px`, height: "100%" }}
        />
      ))}
    </div>
  );
}
