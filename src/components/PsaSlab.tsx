"use client";

import clsx from "clsx";
import { motion } from "framer-motion";
import type { Card } from "@/lib/types";
import { PSA_LABEL, psaTone } from "@/lib/psa";

/**
 * Visual PSA slab: plastic-cased card with a red PSA header, grade
 * chip, and condition label. Sized via `size` prop.
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
      ? "w-[140px]"
      : size === "lg"
      ? "w-[240px]"
      : "w-[180px]";

  return (
    <motion.div
      initial={false}
      animate={highlight ? { scale: [1, 1.03, 1] } : { scale: 1 }}
      transition={{ duration: 1.2, times: [0, 0.5, 1] }}
      className={clsx(
        "relative rounded-xl overflow-hidden isolate bg-gradient-to-br from-zinc-50 to-zinc-200 text-zinc-900 ring-1",
        tone.ring,
        tone.glow,
        width
      )}
    >
      {/* plastic shine */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(115deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 35%, rgba(255,255,255,0) 65%, rgba(255,255,255,0.25) 100%)",
        }}
      />

      {/* PSA header */}
      <div className="relative flex items-center justify-between h-8 md:h-9 px-2.5 bg-gradient-to-r from-red-700 to-red-600 text-white">
        <span className="font-black tracking-wider text-xs md:text-sm">PSA</span>
        <span className="text-[9px] md:text-[10px] uppercase tracking-[0.15em] font-semibold opacity-80">
          {card.name.length > 14 ? `${card.name.slice(0, 13)}…` : card.name}
        </span>
        <div
          className={clsx(
            "rounded px-1.5 py-0.5 font-black leading-none text-xs md:text-sm tabular-nums",
            tone.banner
          )}
        >
          {grade}
        </div>
      </div>

      {/* Card window */}
      <div className="relative aspect-[5/7] bg-zinc-900">
        {card.imageUrl ? (
          <img
            src={card.imageUrl}
            alt={card.name}
            className="w-full h-full object-contain select-none pointer-events-none"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white text-xs p-2 text-center bg-gradient-to-br from-indigo-700 to-amber-600">
            {card.name}
          </div>
        )}
      </div>

      {/* Bottom banner */}
      <div
        className={clsx(
          "flex items-center justify-center h-6 md:h-7 text-[10px] md:text-xs font-black tracking-wider",
          tone.banner
        )}
      >
        {label}
      </div>
    </motion.div>
  );
}
