"use client";

import clsx from "clsx";
import { motion } from "framer-motion";
import type { Card } from "@/lib/types";
import { PSA_LABEL, psaTone } from "@/lib/psa";
import { SETS } from "@/lib/sets";

/**
 * Realistic PSA slab visual:
 *   ┌─────────────────────┐
 *   │ RED HEADER (PSA..)  │
 *   │ CARD NAME + GRADE   │
 *   ├─────────────────────┤
 *   │   CARD IMAGE        │
 *   │   inside plastic    │
 *   ├─────────────────────┤
 *   │ BARCODE │ SET · #N  │
 *   └─────────────────────┘
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
      : "w-[195px]";

  return (
    <motion.div
      initial={false}
      animate={highlight ? { scale: [1, 1.03, 1] } : { scale: 1 }}
      transition={{ duration: 1.2, times: [0, 0.5, 1] }}
      className={clsx(
        "relative rounded-2xl overflow-hidden isolate ring-1 select-none",
        // Plastic case shell — light gradient + inner ring for depth
        "bg-gradient-to-b from-zinc-50 via-white to-zinc-200",
        tone.ring,
        tone.glow,
        width
      )}
    >
      {/* Inner plastic bevel (creates "case within case" depth) */}
      <div
        aria-hidden
        className="absolute inset-1.5 rounded-[14px] pointer-events-none ring-1 ring-black/10"
        style={{
          boxShadow: "inset 0 0 8px rgba(255,255,255,0.6)",
        }}
      />
      {/* Diagonal plastic sheen */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(130deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 30%, rgba(255,255,255,0) 70%, rgba(255,255,255,0.28) 100%)",
        }}
      />

      {/* ── Red header (PSA brand + card + grade) ── */}
      <div className="relative m-1.5 rounded-t-[10px] overflow-hidden bg-gradient-to-b from-red-600 to-red-700 text-white shadow-inner">
        <div className="flex items-stretch">
          {/* PSA brand mark */}
          <div className="px-2 py-1.5 flex items-center justify-center bg-red-700/80 border-r border-white/10">
            <span className="font-black tracking-[0.12em] text-[11px] md:text-xs leading-none">
              PSA
            </span>
          </div>
          {/* Name + grade line */}
          <div className="flex-1 px-2 py-1 min-w-0 flex flex-col justify-center">
            <span className="text-[9px] md:text-[10px] uppercase tracking-wider opacity-85 truncate">
              {card.name}
            </span>
            <span className="text-[8px] md:text-[9px] uppercase tracking-[0.18em] opacity-75 truncate">
              {label}
            </span>
          </div>
          {/* Grade chip */}
          <div
            className={clsx(
              "px-2.5 flex items-center justify-center font-black text-lg md:text-xl tabular-nums",
              tone.banner
            )}
          >
            {grade}
          </div>
        </div>
      </div>

      {/* ── Card window ── */}
      <div className="relative mx-1.5 rounded-[4px] overflow-hidden bg-zinc-950 ring-1 ring-black/20">
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
          {/* subtle reflective sheen on the card window */}
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 45%)",
            }}
          />
        </div>
      </div>

      {/* ── Bottom band: barcode + set info ── */}
      <div className="relative m-1.5 mt-1.5 flex items-center gap-2 px-1.5 py-1">
        <Barcode />
        <div className="flex-1 min-w-0 text-right">
          <div className="text-[8px] md:text-[9px] uppercase tracking-wider text-zinc-600 truncate">
            {SETS[card.setCode].name}
          </div>
          <div className="text-[8px] md:text-[9px] uppercase tracking-[0.12em] text-zinc-500 tabular-nums">
            #{card.number}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Decorative barcode rendered as a stack of CSS bars of varying widths.
 * No real data encoded — just visual filler like a real PSA label.
 */
function Barcode() {
  // Pseudo-barcode pattern: widths 1–3px repeating, gaps of 1px.
  const bars = [1, 2, 1, 3, 1, 2, 2, 1, 3, 2, 1, 2, 1, 3, 1, 2, 3, 1, 2, 1, 3, 2, 1, 2];
  return (
    <div className="flex items-end h-6 gap-[1px] shrink-0">
      {bars.map((w, i) => (
        <span
          key={i}
          className="bg-zinc-900"
          style={{ width: `${w}px`, height: "100%" }}
        />
      ))}
    </div>
  );
}
