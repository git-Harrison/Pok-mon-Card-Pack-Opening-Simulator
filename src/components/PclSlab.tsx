"use client";

import clsx from "clsx";
import { motion } from "framer-motion";
import type { Card } from "@/lib/types";
import { GRADE_BRAND, PCL_LABEL, pclTone } from "@/lib/pcl";
import RarityBadge from "./RarityBadge";

/**
 * PCL grading slab. Mirrors a real grading slab's proportions — chunky
 * header that reads [brand stack] [card info] [grade number], a
 * recessed card window, and a minimal bottom band with cert + barcode.
 * The whole slab glows in the grade's palette via `pclTone(grade)`.
 */
export default function PclSlab({
  card,
  grade,
  size = "md",
  highlight = false,
  compact = false,
}: {
  card: Card;
  grade: number;
  size?: "sm" | "md" | "lg";
  highlight?: boolean;
  /** When true, hides the header card-info column and the bottom cert+barcode band. */
  compact?: boolean;
}) {
  const tone = pclTone(grade);
  const label = PCL_LABEL[grade] ?? "";

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
        "relative rounded-[22px] p-[3px] isolate select-none",
        tone.glow,
        width
      )}
      style={{
        // Outer acrylic case — a subtle translucent frame + bevel so the
        // slab reads as physical plastic rather than a flat tile.
        background:
          "linear-gradient(145deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.35) 35%, rgba(255,255,255,0.15) 55%, rgba(255,255,255,0.55) 100%)",
        boxShadow:
          "0 20px 44px -20px rgba(0,0,0,0.95), inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(0,0,0,0.55)",
      }}
    >
    <div
      className={clsx(
        "relative rounded-[19px] overflow-hidden ring-1",
        "bg-[linear-gradient(168deg,#1a1030_0%,#231847_45%,#0b0620_100%)]",
        tone.ring
      )}
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
      <div className="relative flex items-stretch h-9 md:h-10">
        {/* Brand column */}
        <div
          className={clsx(
            "shrink-0 px-1.5 md:px-2 flex flex-col items-center justify-center border-r border-white/10",
            tone.text
          )}
        >
          <span className="text-[9px] md:text-[10px] font-black tracking-[0.14em] leading-none">
            {GRADE_BRAND}
          </span>
        </div>
        {/* Card info column */}
        {!compact && (
          <div className="flex-1 min-w-0 px-2 flex flex-col justify-center">
            <p className="text-[11px] md:text-[12px] font-bold text-white leading-tight truncate">
              {card.name}
            </p>
            <p className="text-[8px] md:text-[9px] uppercase tracking-[0.1em] text-white/70 truncate leading-tight mt-px">
              #{card.number}
            </p>
          </div>
        )}
        {compact && <div className="flex-1" />}
        {/* Grade banner */}
        <div
          className={clsx(
            "shrink-0 flex items-center justify-center px-2 md:px-2.5 font-black tabular-nums",
            tone.banner
          )}
        >
          <span className="text-base md:text-lg leading-none">{grade}</span>
        </div>
      </div>

      {/* Label strip (e.g. GEM MINT) */}
      <div
        className={clsx(
          "relative px-2 py-0.5 text-center border-t border-b border-white/5",
          tone.text
        )}
      >
        <span className="text-[8px] md:text-[9px] uppercase tracking-[0.24em] font-bold">
          {label}
        </span>
      </div>

      {/* ── Card window ── */}
      <div
        className="relative m-1.5 md:m-2 rounded-md overflow-hidden ring-1 ring-white/10 bg-zinc-950"
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
          {/* PokeCard 와 동일한 위치(좌하단) 에 희귀도 뱃지 — 펫 등록
              picker 등에서 등급/희귀도 한눈 식별. */}
          <div className="absolute left-1.5 bottom-1.5 pointer-events-none">
            <RarityBadge rarity={card.rarity} size="xs" />
          </div>
        </div>
      </div>

      {/* ── Bottom band: cert + barcode ── */}
      {!compact && (
        <div className="relative px-2 pb-1 flex items-center justify-between gap-2">
          <span className="text-[7px] md:text-[8px] font-mono tracking-wider text-white/50 truncate">
            {cert}
          </span>
          <Barcode />
        </div>
      )}
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
