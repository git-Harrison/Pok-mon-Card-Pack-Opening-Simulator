"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { motion, AnimatePresence } from "framer-motion";

export type NpcMood =
  | "idle"       // resting bob
  | "excited"    // bounce + sparkle
  | "working"    // wiggle (scanning, trading)
  | "happy"      // thumbs-up bounce
  | "sad"        // slow sway
  | "shocked"    // shake
  | "angry";     // shake faster

/**
 * Animated NPC block: character portrait on the left, typing speech
 * bubble on the right. Dialogue re-types whenever `text` changes so a
 * state transition (idle → working → done) feels alive.
 */
export default function NpcDialog({
  src,
  alt,
  text,
  mood = "idle",
  nameplate,
  accent = "amber",
  sizeClass = "w-14 h-14 md:w-16 md:h-16",
}: {
  src: string;
  alt: string;
  text: string;
  mood?: NpcMood;
  /** Small label under the portrait (e.g. 감정사 · 후딘 박사). */
  nameplate?: { role?: string; name: string };
  /** Bubble tone. */
  accent?: "amber" | "fuchsia" | "emerald" | "rose";
  sizeClass?: string;
}) {
  const moodAnim = MOOD_ANIMS[mood];
  const bubbleTone = BUBBLE_TONES[accent];

  return (
    <div className="relative flex items-start gap-3">
      {/* Portrait + nameplate */}
      <div className="relative shrink-0 flex flex-col items-center">
        <div
          className={clsx("relative", sizeClass)}
          style={{ perspective: 600 }}
        >
          <div
            className="absolute inset-0 rounded-full blur-md"
            style={{ background: GLOW[accent] }}
          />
          <motion.img
            src={src}
            alt={alt}
            draggable={false}
            className="relative w-full h-full object-contain select-none pointer-events-none"
            {...moodAnim}
          />
          {mood === "excited" && <SparkleCloud />}
          {mood === "shocked" && <ExclaimMark />}
        </div>
        {nameplate && (
          <div className="mt-1 text-center">
            {nameplate.role && (
              <div
                className={clsx(
                  "text-[9px] uppercase tracking-[0.2em] font-semibold",
                  ACCENT_TEXT[accent]
                )}
              >
                {nameplate.role}
              </div>
            )}
            <div className="text-[10px] font-bold text-white whitespace-nowrap">
              {nameplate.name}
            </div>
          </div>
        )}
      </div>

      {/* Speech bubble */}
      <div className="flex-1 min-w-0 pt-1">
        <div
          className={clsx(
            "relative rounded-xl px-3 py-2 text-xs leading-snug",
            "border shadow-sm",
            bubbleTone.bg,
            bubbleTone.border,
            bubbleTone.text
          )}
        >
          {/* Tail */}
          <span
            aria-hidden
            className={clsx(
              "absolute -left-1.5 top-3 w-3 h-3 rotate-45 border-l border-b",
              bubbleTone.bg,
              bubbleTone.border
            )}
          />
          <AnimatePresence mode="wait" initial={false}>
            <TypedLine key={text} text={text} />
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/** Letter-by-letter typing effect. Re-triggers whenever parent keys it. */
function TypedLine({ text }: { text: string }) {
  const [shown, setShown] = useState("");
  useEffect(() => {
    let i = 0;
    setShown("");
    // per-char cadence ~25ms; Korean syllables feel natural at this speed
    const interval = setInterval(() => {
      i += 1;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(interval);
    }, 25);
    return () => clearInterval(interval);
  }, [text]);
  return (
    <motion.span
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="block"
    >
      {shown}
      {shown.length < text.length && (
        <span className="inline-block w-1.5 h-3 ml-0.5 bg-current align-middle animate-pulse" />
      )}
    </motion.span>
  );
}

function SparkleCloud() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="absolute text-amber-300 text-[10px] pointer-events-none"
          style={{
            top: `${10 + i * 20}%`,
            left: i % 2 === 0 ? "-10%" : "90%",
          }}
          animate={{
            opacity: [0, 1, 0],
            y: [-4, -14, -24],
            rotate: [0, 20, 40],
          }}
          transition={{
            duration: 1.4,
            repeat: Infinity,
            delay: i * 0.35,
            ease: "easeOut",
          }}
        >
          ✦
        </motion.span>
      ))}
    </>
  );
}

function ExclaimMark() {
  return (
    <motion.span
      className="absolute -top-2 -right-1 text-rose-400 text-xs font-black pointer-events-none"
      animate={{ y: [0, -3, 0], rotate: [-8, 8, -8] }}
      transition={{ duration: 0.4, repeat: Infinity }}
    >
      !
    </motion.span>
  );
}

/* ─────────────── mood animation table ─────────────── */

type Anim = Parameters<typeof motion.img>[0];

const MOOD_ANIMS: Record<NpcMood, Anim> = {
  idle: {
    animate: { y: [0, -3, 0] },
    transition: { duration: 2.2, repeat: Infinity, ease: "easeInOut" },
  },
  excited: {
    animate: { y: [0, -6, 0], scale: [1, 1.05, 1] },
    transition: { duration: 0.7, repeat: Infinity, ease: "easeInOut" },
  },
  working: {
    animate: { rotate: [-3, 3, -3, 3, 0] },
    transition: { duration: 0.9, repeat: Infinity, ease: "easeInOut" },
  },
  happy: {
    animate: { y: [0, -4, 0], rotate: [-2, 2, 0] },
    transition: { duration: 0.55, repeat: Infinity, ease: "easeInOut" },
  },
  sad: {
    animate: { y: [0, 2, 0], rotate: [0, -3, 0] },
    transition: { duration: 3.0, repeat: Infinity, ease: "easeInOut" },
  },
  shocked: {
    animate: { x: [-2, 2, -2, 2, 0] },
    transition: { duration: 0.35, repeat: Infinity },
  },
  angry: {
    animate: { x: [-3, 3, -3, 3, 0], rotate: [-4, 4, -4, 4, 0] },
    transition: { duration: 0.25, repeat: Infinity },
  },
};

const BUBBLE_TONES = {
  amber: {
    bg: "bg-amber-50",
    border: "border-amber-300",
    text: "text-amber-950",
  },
  fuchsia: {
    bg: "bg-fuchsia-50",
    border: "border-fuchsia-300",
    text: "text-fuchsia-950",
  },
  emerald: {
    bg: "bg-emerald-50",
    border: "border-emerald-300",
    text: "text-emerald-950",
  },
  rose: {
    bg: "bg-rose-50",
    border: "border-rose-300",
    text: "text-rose-950",
  },
};

const ACCENT_TEXT: Record<string, string> = {
  amber: "text-amber-300",
  fuchsia: "text-fuchsia-300",
  emerald: "text-emerald-300",
  rose: "text-rose-300",
};

const GLOW: Record<string, string> = {
  amber:
    "radial-gradient(closest-side, rgba(251,191,36,0.45), rgba(251,191,36,0) 70%)",
  fuchsia:
    "radial-gradient(closest-side, rgba(217,70,239,0.45), rgba(217,70,239,0) 70%)",
  emerald:
    "radial-gradient(closest-side, rgba(52,211,153,0.45), rgba(52,211,153,0) 70%)",
  rose:
    "radial-gradient(closest-side, rgba(244,63,94,0.45), rgba(244,63,94,0) 70%)",
};
