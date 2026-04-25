"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import type { Card } from "@/lib/types";
import { RARITY_LABEL, RARITY_STYLE, isHighRarity } from "@/lib/rarity";
import { SETS } from "@/lib/sets";
import RarityBadge from "./RarityBadge";

interface Props {
  card: Card | null;
  count: number;
  onClose: () => void;
  onAfterGift?: () => void;
}

export default function CardDetailModal({
  card,
  count,
  onClose,
}: Props) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (card) {
      setImgError(false);
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      };
      window.addEventListener("keydown", onKey);
      document.body.style.overflow = "hidden";
      return () => {
        window.removeEventListener("keydown", onKey);
        document.body.style.overflow = "";
      };
    }
  }, [card, onClose]);

  return (
    <AnimatePresence>
      {card && (
        <motion.div
          key="backdrop"
          className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-md flex items-center justify-center overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          style={{
            // Breathing room on every side + respect device safe areas
            paddingTop: "max(env(safe-area-inset-top, 0px), 12px)",
            paddingBottom: "max(env(safe-area-inset-bottom, 0px), 12px)",
            paddingLeft: "12px",
            paddingRight: "12px",
          }}
        >
          {/* Modal itself caps at viewport height and scrolls internally.
              This is the battle-tested pattern used by every major app —
              backdrop centers via flex, modal respects a fixed max-height
              so it can never overflow the visible area. */}
          <motion.div
            onClick={(e) => e.stopPropagation()}
            className={clsx(
              "relative w-full md:max-w-3xl bg-zinc-950/95 border border-white/10",
              "rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            )}
            style={{
              maxHeight: "calc(100dvh - 24px)",
            }}
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.94, opacity: 0 }}
            transition={{
              type: "tween",
              ease: [0.2, 0.8, 0.2, 1],
              duration: 0.22,
            }}
          >
              {/* Sticky close */}
              <button
                onClick={onClose}
                aria-label="닫기"
                className="absolute top-2 right-2 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
                style={{ touchAction: "manipulation" }}
              >
                ✕
              </button>

              {/* Body — scrolls internally when content exceeds max-h */}
              <div className="flex-1 overflow-y-auto overscroll-contain min-h-0">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-0">
                  <div className="md:col-span-3 relative p-5 md:p-8 flex items-center justify-center bg-gradient-to-br from-zinc-900 to-black">
                    {isHighRarity(card.rarity) && (
                      <div
                        className="absolute inset-0 opacity-60 pointer-events-none"
                        style={{
                          background: `radial-gradient(closest-side, ${
                            RARITY_STYLE[card.rarity].tier >= 7
                              ? "#f59e0b"
                              : "#818cf8"
                          }55, transparent 70%)`,
                        }}
                      />
                    )}
                    <div
                      className={clsx(
                        "relative rounded-xl overflow-hidden ring-2 bg-zinc-900",
                        RARITY_STYLE[card.rarity].frame,
                        RARITY_STYLE[card.rarity].glow
                      )}
                      style={{
                        width: "min(56vw, 240px)",
                        maxHeight: "48dvh",
                        aspectRatio: "5 / 7",
                      }}
                    >
                      {isHighRarity(card.rarity) && (
                        <div className="rarity-ring" />
                      )}
                      {card.imageUrl && !imgError ? (
                        <img
                          src={card.imageUrl}
                          alt={card.name}
                          className="w-full h-full object-contain bg-zinc-900"
                          onError={() => setImgError(true)}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-700 to-amber-600 p-4 text-center">
                          <div>
                            <div className="text-xs text-white/60">
                              #{card.number}
                            </div>
                            <div className="mt-2 text-white font-bold">
                              {card.name}
                            </div>
                          </div>
                        </div>
                      )}
                      {isHighRarity(card.rarity) && (
                        <div className="holo-overlay" />
                      )}
                    </div>
                  </div>

                  <div className="md:col-span-2 p-5 md:p-6 flex flex-col gap-4">
                    <div>
                      <RarityBadge rarity={card.rarity} size="md" />
                      <h2 className="mt-3 text-xl md:text-3xl font-black text-white leading-tight">
                        {card.name}
                      </h2>
                      <p className="mt-1 text-xs text-zinc-400">
                        {SETS[card.setCode].name} · 번호 {card.number}
                      </p>
                    </div>

                    <dl className="grid grid-cols-2 gap-2 text-sm">
                      <Info label="등급" value={RARITY_LABEL[card.rarity]} />
                      <Info label="보유" value={`${count}장`} />
                    </dl>

                    <div className="mt-auto flex flex-col gap-2">
                      <Link
                        href="/wallet?tab=psa"
                        onClick={onClose}
                        style={{ touchAction: "manipulation" }}
                        className="h-12 rounded-xl bg-gradient-to-r from-amber-400 to-rose-500 text-zinc-950 font-bold text-sm hover:scale-[1.02] active:scale-[0.98] transition inline-flex items-center justify-center"
                      >
                        🎁 PCL 슬랩 선물 보내기
                      </Link>
                      <button
                        onClick={onClose}
                        style={{ touchAction: "manipulation" }}
                        className="h-11 rounded-xl bg-white/5 hover:bg-white/10 text-white font-semibold text-sm border border-white/10 transition"
                      >
                        닫기
                      </button>
                    </div>
                  </div>
                </div>
              </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
      <dt className="text-[10px] uppercase tracking-wider text-zinc-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-bold text-white">{value}</dd>
    </div>
  );
}

