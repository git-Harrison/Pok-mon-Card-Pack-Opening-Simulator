"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import type { Card } from "@/lib/types";
import { RARITY_LABEL, RARITY_STYLE, isHighRarity } from "@/lib/rarity";
import { SETS } from "@/lib/sets";
import { useAuth } from "@/lib/auth";
import { createGift } from "@/lib/db";
import RarityBadge from "./RarityBadge";
import CoinIcon from "./CoinIcon";

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
  onAfterGift,
}: Props) {
  const [giftOpen, setGiftOpen] = useState(false);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (card) {
      setGiftOpen(false);
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
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md p-3 md:p-6 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            layoutId={`card-${card.id}`}
            onClick={(e) => e.stopPropagation()}
            className={clsx(
              "relative w-full md:max-w-3xl bg-zinc-950/95 border border-white/10",
              "rounded-2xl shadow-2xl",
              // `dvh` shrinks when mobile browser URL bar shows, guaranteeing
              // the modal always fits inside the visible viewport. `p-3` on
              // the backdrop already reserves ~24px of margin all around.
              "flex flex-col overflow-hidden",
              "max-h-[calc(100dvh-1.5rem)] md:max-h-[90vh]"
            )}
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
          >
            {/* Sticky close */}
            <button
              onClick={onClose}
              aria-label="닫기"
              className="absolute top-2 right-2 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
            >
              ✕
            </button>

            {/* Scrollable body */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
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
                      // Bounded by both viewport height and column width
                      width: "min(62vw, 260px)",
                      maxHeight: "55dvh",
                      aspectRatio: "5 / 7",
                    }}
                  >
                    {isHighRarity(card.rarity) && <div className="rarity-ring" />}
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
                    {isHighRarity(card.rarity) && <div className="holo-overlay" />}
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

                  {giftOpen ? (
                    <GiftForm
                      card={card}
                      onCancel={() => setGiftOpen(false)}
                      onSuccess={() => {
                        setGiftOpen(false);
                        onAfterGift?.();
                        onClose();
                      }}
                    />
                  ) : (
                    <div className="mt-auto flex flex-col gap-2">
                      <button
                        onClick={() => setGiftOpen(true)}
                        disabled={count <= 0}
                        className="h-12 rounded-xl bg-gradient-to-r from-amber-400 to-rose-500 text-zinc-950 font-bold text-sm hover:scale-[1.02] active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        친구에게 선물 보내기
                      </button>
                      <button
                        onClick={onClose}
                        className="h-11 rounded-xl bg-white/5 hover:bg-white/10 text-white font-semibold text-sm border border-white/10 transition"
                      >
                        닫기
                      </button>
                    </div>
                  )}
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

function GiftForm({
  card,
  onCancel,
  onSuccess,
}: {
  card: Card;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const { user } = useAuth();
  const [recipient, setRecipient] = useState("");
  const [priceRaw, setPriceRaw] = useState("0");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const submit = async () => {
    if (!user || !recipient.trim() || sending) return;
    const price = Math.max(0, Math.floor(Number(priceRaw) || 0));
    setSending(true);
    setError(null);
    const res = await createGift(user.id, recipient.trim(), card.id, price);
    setSending(false);
    if (!res.ok) {
      setError(res.error ?? "선물 전송 실패");
      return;
    }
    setSuccess(true);
    setTimeout(onSuccess, 900);
  };

  return (
    <div className="mt-auto rounded-xl bg-white/5 border border-white/10 p-4">
      <p className="text-xs text-zinc-300 mb-2">받는 사람 아이디</p>
      <input
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
        autoFocus
        autoComplete="off"
        placeholder="예: min"
        className="w-full h-11 px-3 rounded-lg bg-black/40 border border-white/10 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
      />

      <p className="text-xs text-zinc-300 mt-3 mb-2">
        받는 사람이 지불할 포인트
      </p>
      <div className="flex items-stretch gap-1.5">
        <input
          value={priceRaw}
          onChange={(e) => setPriceRaw(e.target.value.replace(/[^0-9]/g, ""))}
          inputMode="numeric"
          className="flex-1 h-11 px-3 rounded-lg bg-black/40 border border-white/10 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
          placeholder="0"
        />
        <span className="inline-flex items-center gap-1.5 px-3 rounded-lg bg-white/5 border border-white/10 text-xs text-zinc-300">
          <CoinIcon size="xs" /> 포인트
        </span>
      </div>
      <p className="mt-2 text-[11px] text-zinc-500 leading-snug">
        받는 사람이 24시간 내에 수락해야 해요. 수락 시 카드는 친구에게, 포인트는
        나에게 전달됩니다. 미수락 시 카드는 자동으로 돌아옵니다.
      </p>

      {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
      {success && (
        <p className="mt-2 text-xs text-emerald-300">
          선물이 전송되었습니다!
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          onClick={submit}
          disabled={sending || success || !recipient.trim()}
          className="flex-1 h-11 rounded-lg bg-gradient-to-r from-amber-400 to-rose-500 text-zinc-950 font-bold text-sm disabled:opacity-50"
        >
          {sending ? "보내는 중..." : success ? "전송 완료" : "선물 보내기"}
        </button>
        <button
          onClick={onCancel}
          disabled={sending}
          className="flex-1 h-11 rounded-lg bg-white/10 hover:bg-white/15 text-white font-semibold text-sm"
        >
          취소
        </button>
      </div>
    </div>
  );
}
