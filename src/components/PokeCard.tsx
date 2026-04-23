"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import type { Card } from "@/lib/types";
import { RARITY_STYLE, isHighRarity } from "@/lib/rarity";
import RarityBadge from "./RarityBadge";

interface Props {
  card: Card;
  revealed: boolean;
  onReveal?: () => void;
  size?: "sm" | "md" | "lg";
  index?: number;
}

export default function PokeCard({
  card,
  revealed,
  onReveal,
  size = "md",
  index = 0,
}: Props) {
  const [imgError, setImgError] = useState(false);
  const style = RARITY_STYLE[card.rarity];
  const highRarity = isHighRarity(card.rarity);

  const sizing =
    size === "sm"
      ? "w-[120px] h-[168px]"
      : size === "lg"
      ? "w-[220px] h-[308px]"
      : "w-[160px] h-[224px]";

  // Only treat the card as an interactive button when it has a flip
  // handler AND is currently face-down. In wallet / grid views (revealed
  // with no onReveal), render as a plain div so parent click handlers
  // (e.g. "open detail modal") receive the event without being swallowed
  // by an inner <button>.
  const interactive = !revealed && !!onReveal;
  const Wrapper = interactive ? motion.button : motion.div;

  return (
    // Outer clip container keeps the rarity-ring glow strictly inside the card
    // bounds so it can't bleed into adjacent cards in a grid.
    <div
      className={clsx(
        "relative perspective-1200 rounded-xl overflow-hidden isolate",
        sizing
      )}
    >
      {highRarity && revealed && <div className="rarity-ring" />}
      <Wrapper
        {...(interactive
          ? {
              type: "button" as const,
              onClick: () => onReveal?.(),
              style: { touchAction: "manipulation" as const },
            }
          : {})}
        className={clsx(
          "relative preserve-3d w-full h-full rounded-xl select-none",
          "ring-2 ring-offset-0",
          interactive && "cursor-pointer",
          revealed ? style.frame : "ring-white/10",
          revealed && style.glow
        )}
        initial={false}
        animate={{ rotateY: revealed ? 180 : 0 }}
        transition={{
          duration: 0.55,
          ease: [0.4, 0, 0.2, 1],
          delay: index * 0.02,
        }}
        whileHover={
          interactive
            ? { scale: 1.02 }
            : revealed
            ? { y: -6, scale: 1.03 }
            : undefined
        }
        aria-label={revealed ? card.name : "뒤집힌 카드"}
      >
        {/* Back face */}
        <div className="absolute inset-0 backface-hidden rounded-xl overflow-hidden">
          <img
            src="/images/common/card-back.jpg"
            alt=""
            className="w-full h-full object-cover select-none pointer-events-none"
            draggable={false}
            style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
          />
        </div>

        {/* Front face */}
        <div className="absolute inset-0 rotate-y-180 backface-hidden rounded-xl overflow-hidden bg-zinc-900">
          {!imgError && card.imageUrl ? (
            <img
              src={card.imageUrl}
              alt={card.name}
              loading="lazy"
              className="w-full h-full object-contain bg-zinc-900 select-none pointer-events-none"
              draggable={false}
              style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
              onError={() => setImgError(true)}
            />
          ) : (
            <FallbackFront card={card} />
          )}
          {highRarity && <div className="holo-overlay pointer-events-none" />}
          {revealed && (
            <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
              <div className="flex items-center justify-between">
                <RarityBadge rarity={card.rarity} size="xs" />
                <span className="text-[10px] text-white/80">
                  {card.number}
                </span>
              </div>
            </div>
          )}
        </div>
      </Wrapper>

      {highRarity && revealed && (
        <div className="pointer-events-none">
          <SparkleBurst />
        </div>
      )}
    </div>
  );
}

function FallbackFront({ card }: { card: Card }) {
  const style = RARITY_STYLE[card.rarity];
  return (
    <div
      className={clsx(
        "w-full h-full flex flex-col items-center justify-between p-3 bg-gradient-to-br select-none",
        card.rarity === "C" || card.rarity === "U"
          ? "from-zinc-700 to-zinc-900"
          : "from-indigo-700 via-fuchsia-700 to-amber-600"
      )}
    >
      <div className="w-full flex items-center justify-between">
        <span className={clsx("px-1.5 py-0.5 text-[10px] rounded", style.badge)}>
          {card.rarity}
        </span>
        <span className="text-[10px] text-white/70">#{card.number}</span>
      </div>
      <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center text-3xl">
        ?
      </div>
      <div className="w-full text-center">
        <p className="text-[11px] text-white/90 font-bold leading-tight line-clamp-2">
          {card.name}
        </p>
      </div>
    </div>
  );
}

function SparkleBurst() {
  return (
    <AnimatePresence>
      <motion.div
        key="burst"
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {Array.from({ length: 10 }).map((_, i) => {
          const angle = (i / 10) * Math.PI * 2;
          const dx = Math.cos(angle) * 50;
          const dy = Math.sin(angle) * 50;
          return (
            <span
              key={i}
              className="absolute left-1/2 top-1/2 w-1.5 h-1.5 rounded-full bg-amber-300 shadow-[0_0_6px_rgba(255,234,138,0.8)]"
              style={
                {
                  animation: `pop-up 0.9s ease-out ${i * 0.03}s both`,
                  ["--end" as string]: `translate(${dx}px, ${dy}px)`,
                } as React.CSSProperties
              }
            />
          );
        })}
      </motion.div>
    </AnimatePresence>
  );
}
