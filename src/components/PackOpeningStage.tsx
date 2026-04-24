"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, PanInfo } from "framer-motion";
import clsx from "clsx";
import type { Card } from "@/lib/types";
import { RARITY_STYLE, cardFxClass } from "@/lib/rarity";
import RarityBadge from "./RarityBadge";

type Stage = "tearing" | "single" | "grid";

interface Props {
  pack: Card[];
  packImage: string;
  setName: string;
  onClose: () => void;
}

/**
 * Fullscreen pack-opening overlay with single-card focus.
 *
 * Flow:
 *   tear → single-card stage → (optional) grid "reveal all"
 *
 * Controls:
 *   - Tap current card to flip it
 *   - Tap next arrow / swipe left to advance to the next card
 *   - "전체 공개" switches to grid mode and flips every card
 */
export default function PackOpeningStage({
  pack,
  packImage,
  setName,
  onClose,
}: Props) {
  const [stage, setStage] = useState<Stage>("tearing");
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState<boolean[]>(() =>
    pack.map(() => false)
  );
  const [flashing, setFlashing] = useState(true);
  const total = pack.length;

  // Kick off tear → single after ~1.2s
  useEffect(() => {
    const t1 = setTimeout(() => setFlashing(false), 650);
    const t2 = setTimeout(() => setStage("single"), 1200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  // Lock page scroll while overlay is up
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const currentRevealed = revealed[index];
  const allRevealed = revealed.every(Boolean);

  const flip = useCallback((i: number) => {
    setRevealed((prev) => {
      if (prev[i]) return prev;
      const next = [...prev];
      next[i] = true;
      return next;
    });
  }, []);

  const revealAll = useCallback(() => {
    setRevealed(pack.map(() => true));
    setStage("grid");
  }, [pack]);

  const goNext = useCallback(() => {
    if (!currentRevealed) flip(index);
    else setIndex((i) => Math.min(i + 1, total - 1));
  }, [currentRevealed, flip, index, total]);

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(i - 1, 0));
  }, []);

  // Swipe handlers
  const onDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      const { offset, velocity } = info;
      if (offset.x < -60 || velocity.x < -400) {
        goNext();
      } else if (offset.x > 60 || velocity.x > 400) {
        goPrev();
      }
    },
    [goNext, goPrev]
  );

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black/95 flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Top bar */}
      <div
        className="shrink-0 border-b border-white/10 bg-black/95"
        style={{
          // `env(safe-area-inset-top)` handles notches; the 16px fallback
          // gives enough breathing room so URL-bar overlap (mobile Chrome
          // / Safari) never hides the header text.
          paddingTop: "max(env(safe-area-inset-top, 0px), 16px)",
        }}
      >
        <div className="flex items-center justify-between gap-2 px-3 md:px-6 h-12">
          <div className="text-xs md:text-sm text-zinc-200 font-semibold truncate">
            {setName} · 팩 개봉
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {stage !== "tearing" && (
              <span className="text-xs text-zinc-300 tabular-nums">
                {index + 1} / {total}
              </span>
            )}
            <button
              onClick={onClose}
              aria-label="닫기"
              className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white"
              style={{ touchAction: "manipulation" }}
            >
              ✕
            </button>
          </div>
        </div>
        {stage !== "tearing" && (
          <div className="px-3 md:px-6 pb-2">
            <ProgressDots total={total} index={index} revealed={revealed} />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 relative">
        {stage === "tearing" && (
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden px-4 py-4">
            <TearStage packImage={packImage} flashing={flashing} />
          </div>
        )}
        {stage === "single" && (
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden px-4 py-4">
            <SingleCardStage
              pack={pack}
              index={index}
              revealed={revealed}
              onFlip={() => flip(index)}
              onDragEnd={onDragEnd}
              onNext={goNext}
              onPrev={goPrev}
            />
          </div>
        )}
        {stage === "grid" && (
          <div className="absolute inset-0 overflow-y-auto overflow-x-hidden">
            <GridStage pack={pack} />
          </div>
        )}
      </div>

      {/* Bottom bar */}
      {stage !== "tearing" && (
        <div
          className="shrink-0 border-t border-white/10 bg-black/60 backdrop-blur"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="max-w-3xl mx-auto px-3 md:px-6 py-3 flex flex-wrap items-center justify-center gap-2">
            {stage === "single" ? (
              <>
                <button
                  onClick={revealAll}
                  className="h-11 px-5 rounded-xl bg-gradient-to-r from-amber-400 to-rose-500 text-zinc-950 font-bold text-sm hover:scale-[1.02] active:scale-[0.98] transition"
                >
                  한번에 보기
                </button>
                {allRevealed && (
                  <button
                    onClick={onClose}
                    className="h-11 px-5 rounded-xl bg-white text-zinc-900 font-bold text-sm"
                  >
                    다음 팩 열기
                  </button>
                )}
                <Link
                  href="/wallet"
                  className="h-11 px-5 rounded-xl bg-white/10 text-white font-semibold text-sm hover:bg-white/15 inline-flex items-center"
                >
                  지갑 보기
                </Link>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setStage("single");
                    setIndex(0);
                  }}
                  className="h-11 px-5 rounded-xl bg-white/10 text-white font-semibold text-sm hover:bg-white/15"
                >
                  한 장씩 보기
                </button>
                <button
                  onClick={onClose}
                  className="h-11 px-5 rounded-xl bg-white text-zinc-900 font-bold text-sm"
                >
                  다음 팩 열기
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────

function TearStage({
  packImage,
  flashing,
}: {
  packImage: string;
  flashing: boolean;
}) {
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* Ambient glow */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(closest-side at 50% 50%, rgba(251,191,36,0.15), transparent 60%)",
        }}
      />
      {/* The pack */}
      <motion.img
        src={packImage}
        alt=""
        className="relative w-[52vw] max-w-[280px] aspect-[2/3] object-contain gacha-pulse"
        initial={{ scale: 1, rotate: 0 }}
        animate={{
          scale: [1, 1.05, 0.98, 1.02, 0.6],
          rotate: [0, -4, 3, -2, 0],
        }}
        transition={{ duration: 1.1, times: [0, 0.35, 0.55, 0.75, 1] }}
      />
      {/* Expanding ring */}
      <div className="gacha-ring" />
      {/* White flash */}
      {flashing && (
        <div
          aria-hidden
          className="absolute inset-0 bg-white gacha-flash pointer-events-none"
        />
      )}
    </div>
  );
}

function SingleCardStage({
  pack,
  index,
  revealed,
  onFlip,
  onDragEnd,
  onNext,
  onPrev,
}: {
  pack: Card[];
  index: number;
  revealed: boolean[];
  onFlip: () => void;
  onDragEnd: (e: unknown, info: PanInfo) => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  const current = pack[index];
  const isRevealed = revealed[index];
  const dir = useRef(1);
  // Track direction for slide transitions
  const [, force] = useState(0);
  useEffect(() => {
    force((n) => n + 1);
  }, [index]);

  const peek = pack.slice(index + 1, index + 3); // up to 2 peeks behind

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* Peek stack behind */}
      {peek.map((_, i) => (
        <div
          key={`peek-${index}-${i}`}
          aria-hidden
          className="absolute rounded-xl overflow-hidden ring-2 ring-white/10 bg-zinc-900 pointer-events-none"
          style={{
            width: "min(66vw, 240px)",
            aspectRatio: "5 / 7",
            transform: `translate(${(i + 1) * 6}px, ${(i + 1) * 8}px) scale(${
              1 - (i + 1) * 0.045
            })`,
            opacity: 0.5 - i * 0.2,
            zIndex: 1,
          }}
        >
          <img
            src="/images/common/card-back.jpg"
            alt=""
            className="w-full h-full object-cover select-none pointer-events-none"
            draggable={false}
          />
        </div>
      ))}

      {/* Navigation arrows (desktop) */}
      <button
        onClick={onPrev}
        disabled={index === 0}
        aria-label="이전"
        className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed z-20"
      >
        ‹
      </button>
      <button
        onClick={onNext}
        aria-label="다음"
        className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white items-center justify-center z-20"
      >
        ›
      </button>

      {/* Main card */}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={index}
          className="relative z-10"
          style={{ touchAction: "pan-y" }}
          drag="x"
          dragElastic={0.15}
          dragConstraints={{ left: 0, right: 0 }}
          onDragEnd={onDragEnd}
          initial={{
            x: dir.current > 0 ? 320 : -320,
            opacity: 0,
            rotate: dir.current > 0 ? 6 : -6,
          }}
          animate={{ x: 0, opacity: 1, rotate: 0 }}
          exit={{
            x: dir.current > 0 ? -320 : 320,
            opacity: 0,
            rotate: dir.current > 0 ? -6 : 6,
          }}
          transition={{ type: "spring", stiffness: 220, damping: 28 }}
        >
          <StageCard card={current} revealed={isRevealed} onFlip={onFlip} />
        </motion.div>
      </AnimatePresence>

      {/* Swipe hint */}
      {!isRevealed && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[11px] text-zinc-400 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 pointer-events-none">
          카드를 눌러 뒤집어 보세요
        </div>
      )}
      {isRevealed && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[11px] text-zinc-400 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 pointer-events-none">
          {index < pack.length - 1 ? "← 스와이프로 다음 카드" : "마지막 카드!"}
        </div>
      )}
    </div>
  );
}

function StageCard({
  card,
  revealed,
  onFlip,
}: {
  card: Card;
  revealed: boolean;
  onFlip: () => void;
}) {
  const style = RARITY_STYLE[card.rarity];
  const fx = cardFxClass(card.rarity);
  return (
    <div
      className="relative rounded-2xl overflow-hidden isolate"
      style={{
        width: "min(66vw, 260px)",
        height: "calc(min(66vw, 260px) * 1.4)",
        maxHeight: "58dvh",
      }}
    >
      <button
        type="button"
        onClick={onFlip}
        style={{ touchAction: "manipulation" }}
        className={clsx(
          "relative w-full h-full perspective-1200 cursor-pointer select-none",
          !revealed && "stack-breathe"
        )}
      >
        <motion.div
          className={clsx(
            "relative preserve-3d w-full h-full rounded-2xl ring-2",
            revealed ? style.frame : "ring-white/15",
            revealed && style.glow
          )}
          initial={false}
          animate={{ rotateY: revealed ? 180 : 0 }}
          transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
        >
          {/* Back */}
          <div className="absolute inset-0 backface-hidden rounded-2xl overflow-hidden">
            <img
              src="/images/common/card-back.jpg"
              alt=""
              className="w-full h-full object-cover select-none pointer-events-none"
              draggable={false}
              style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
            />
          </div>
          {/* Front */}
          <div className="absolute inset-0 rotate-y-180 backface-hidden rounded-2xl overflow-hidden bg-zinc-900">
            {card.imageUrl ? (
              <img
                src={card.imageUrl}
                alt={card.name}
                loading="eager"
                className="w-full h-full object-contain bg-zinc-900 select-none pointer-events-none"
                draggable={false}
                style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-700 to-amber-600 p-4 text-center select-none">
                <div>
                  <div className="text-xs text-white/60">#{card.number}</div>
                  <div className="mt-2 text-white font-bold">{card.name}</div>
                </div>
              </div>
            )}
            {fx && revealed && <div className={fx} />}
          </div>
        </motion.div>
      </button>

      {/* Rarity banner shows after flip */}
      <AnimatePresence>
        {revealed && (
          <motion.div
            key="banner"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-2"
          >
            <RarityBadge rarity={card.rarity} size="sm" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function GridStage({ pack }: { pack: Card[] }) {
  return (
    <div className="w-full px-4 md:px-6 py-4 md:py-6">
      <div
        className="grid gap-4 md:gap-6 mx-auto"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          maxWidth: "640px",
        }}
      >
        {pack.map((card, i) => (
          <MiniCard key={i} card={card} />
        ))}
      </div>
    </div>
  );
}

function MiniCard({ card }: { card: Card }) {
  const style = RARITY_STYLE[card.rarity];
  const fx = cardFxClass(card.rarity);
  return (
    <div
      className={clsx(
        "relative w-full aspect-[5/7] rounded-lg overflow-hidden isolate ring-2 bg-zinc-900",
        style.frame,
        style.glow
      )}
    >
      {card.imageUrl ? (
        <img
          src={card.imageUrl}
          alt={card.name}
          loading="lazy"
          draggable={false}
          className="w-full h-full object-contain bg-zinc-900 select-none pointer-events-none"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-700 to-amber-600 p-2 text-center text-white text-[10px] select-none">
          {card.name}
        </div>
      )}
      {fx && <div className={fx} />}
      <div className="absolute left-1.5 bottom-1.5 pointer-events-none z-[3]">
        <RarityBadge rarity={card.rarity} size="xs" />
      </div>
    </div>
  );
}

function ProgressDots({
  total,
  index,
  revealed,
}: {
  total: number;
  index: number;
  revealed: boolean[];
}) {
  return (
    <div className="flex items-center justify-center gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={clsx(
            "h-1 rounded-full transition-all",
            i === index
              ? "w-6 bg-amber-300"
              : revealed[i]
              ? "w-2 bg-white/50"
              : "w-2 bg-white/15"
          )}
        />
      ))}
    </div>
  );
}
