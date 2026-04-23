"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import clsx from "clsx";
import CoinIcon from "./CoinIcon";

/** Animated points counter that tweens when the value changes. */
export default function PointsChip({
  points,
  size = "md",
  highlight = false,
}: {
  points: number;
  size?: "sm" | "md";
  highlight?: boolean;
}) {
  const [display, setDisplay] = useState(points);
  const [delta, setDelta] = useState<number | null>(null);

  useEffect(() => {
    if (points === display) return;
    const diff = points - display;
    setDelta(diff);
    const start = display;
    const dur = 700;
    const t0 = performance.now();
    let frame = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setDisplay(Math.round(start + diff * eased));
      if (k < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const tm = setTimeout(() => setDelta(null), 1500);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(tm);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  return (
    <span
      className={clsx(
        "relative inline-flex items-center gap-1.5 rounded-full font-bold",
        "bg-gradient-to-r from-amber-400 to-yellow-500 text-zinc-950",
        size === "sm" && "px-2 py-0.5 text-xs",
        size === "md" && "px-3 py-1 text-sm",
        highlight && "shadow-[0_0_18px_rgba(251,191,36,0.55)]"
      )}
    >
      <CoinIcon size={size === "sm" ? "xs" : "sm"} />
      <span className="tabular-nums">{display.toLocaleString("ko-KR")}</span>
      <AnimatePresence>
        {delta !== null && delta !== 0 && (
          <motion.span
            key={`${delta}-${points}`}
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: 1, y: -22 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
            className={clsx(
              "absolute left-1/2 -translate-x-1/2 -top-1 text-xs font-black pointer-events-none",
              delta > 0 ? "text-emerald-300" : "text-rose-300"
            )}
          >
            {delta > 0 ? `+${delta}` : delta}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
