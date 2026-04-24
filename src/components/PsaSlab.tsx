"use client";

import clsx from "clsx";
import { motion } from "framer-motion";
import type { Card } from "@/lib/types";
import { GRADE_BRAND, PSA_LABEL, psaTone } from "@/lib/psa";
import { SETS } from "@/lib/sets";

/**
 * PCL grading slab. Mirrors a real PSA slab's proportions — chunky
 * header that reads [brand stack] [card info] [grade number], a
 * recessed card window, and a minimal bottom band with cert + barcode.
 * The whole slab glows in the grade's palette via `psaTone(grade)`.
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

  // Responsive: slab fits its container up to the size cap so it never
  // overflows narrow modal grid columns.
  const width =
    size === "sm"
      ? "w-full max-w-[150px]"
      : size === "lg"
      ? "w-full max-w-[320px]"
      : "w-full max-w-[220px]";

  const cert = `${card.setCode.toUpperCase()}-${card.number}-${grade}`;

  return (
    <motion.div
      initial={false}
      animate={highlight ? { scale: [1, 1.03, 1] } : { scale: 1 }}
      transition={{ duration: 1.2, times: [0, 0.5, 1] }}
      className={clsx(
        "relative rounded-2xl overflow-hidden isolate ring-1 select-none",
        "bg-[linear-gradient(168deg,#1a1030_0%,#231847_45%,#0b0620_100%)]",
        tone.ring,
        tone.glow,
        width
      )}
      style={{
        boxShadow:
          "0 20px 44px -20px rgba(0,0,0,0.95), inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.7)",
      }}
    >
      {/* Subtle holographic sheen over the whole slab */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-70"
        style={{
          background:
            "linear-gradient(130deg, rgba(255,255,255,0) 0%, rgba(147,197,253,0.12) 25%, rgba(236,72,153,0.10) 50%, rgba(250,204,21,0.10) 75%, rgba(255,255,255,0) 100%)",
        }}
      />
      {/* Top-edge highlight */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px pointer-events-none"
        style={{
          background:
            "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.35) 50%, rgba(255,255,255,0) 100%)",
        }}
      />

      {/* ── Header: brand | card info | grade ── */}
      <div className="relative flex items-stretch">
        {/* Brand column */}
        <div
          className={clsx(
            "shrink-0 px-1.5 md:px-2 py-1.5 flex flex-col items-center justify-center border-r border-white/10",
            tone.text
          )}
        >
          <span className="text-[10px] md:text-[11px] font-black tracking-[0.16em] leading-none">
            {GRADE_BRAND}
          </span>
          <span className="mt-0.5 text-[7px] uppercase tracking-[0.22em] opacity-70 leading-none">
            Graded
          </span>
        </div>
        {/* Card info column */}
        <div className="flex-1 min-w-0 px-2 py-1.5 flex flex-col justify-center">
          <p className="text-[11px] md:text-[12px] font-bold text-white leading-snug line-clamp-2 break-keep">
            {card.name}
          </p>
          <p className="text-[8px] md:text-[9px] uppercase tracking-[0.14em] text-white/55 truncate mt-0.5">
            {SETS[card.setCode].name} · #{card.number}
          </p>
        </div>
        {/* Grade banner */}
        <div
          className={clsx(
            "shrink-0 flex flex-col items-center justify-center px-2 md:px-2.5 font-black tabular-nums",
            tone.banner
          )}
        >
          <span className="text-[7px] uppercase tracking-[0.2em] font-bold opacity-80 leading-none">
            Grade
          </span>
          <span className="text-xl md:text-2xl leading-none mt-0.5">
            {grade}
          </span>
        </div>
      </div>

      {/* Label strip (e.g. GEM MINT) */}
      <div
        className={clsx(
          "relative px-3 py-1 text-center border-t border-white/5 border-b border-white/5",
          tone.text
        )}
      >
        <span className="text-[9px] md:text-[10px] uppercase tracking-[0.3em] font-bold">
          {label}
        </span>
      </div>

      {/* ── Card window ── */}
      <div
        className="relative m-2.5 rounded-md overflow-hidden ring-1 ring-white/10 bg-zinc-950"
        style={{
          boxShadow:
            "inset 0 0 16px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)",
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
                "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 45%)",
            }}
          />
        </div>
      </div>

      {/* ── Bottom band: cert + barcode ── */}
      <div className="relative px-3 pb-2 flex items-center justify-between gap-2">
        <span className="text-[8px] md:text-[9px] font-mono tracking-wider text-white/45 truncate">
          {GRADE_BRAND} · {cert}
        </span>
        <Barcode />
      </div>
    </motion.div>
  );
}

/** Decorative barcode — static widths, flat white bars. */
function Barcode() {
  const bars = [1, 2, 1, 3, 1, 2, 2, 1, 2, 3, 1, 2, 1, 2, 3, 1];
  return (
    <div className="flex items-end h-3.5 gap-[1px] shrink-0 opacity-70">
      {bars.map((w, i) => (
        <span
          key={i}
          className="bg-white/85"
          style={{ width: `${w}px`, height: "100%" }}
        />
      ))}
    </div>
  );
}
