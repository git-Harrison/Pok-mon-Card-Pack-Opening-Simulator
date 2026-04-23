"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import type { Card } from "@/lib/types";
import { RARITY_LABEL, RARITY_STYLE, isHighRarity } from "@/lib/rarity";
import { SETS } from "@/lib/sets";
import { useAuth } from "@/lib/auth";
import { giftCard } from "@/lib/db";
import RarityBadge from "./RarityBadge";

interface Props {
  card: Card | null;
  count: number;
  onClose: () => void;
  onAfterGift?: () => void;
}

export default function CardDetailModal({ card, count, onClose, onAfterGift }: Props) {
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
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-start md:items-center justify-center p-3 md:p-6 overflow-y-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            layoutId={`card-${card.id}`}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-3xl my-auto bg-zinc-950/90 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
          >
            <button
              onClick={onClose}
              aria-label="닫기"
              className="absolute top-2 right-2 z-10 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
            >
              ✕
            </button>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-0">
              {/* Card image */}
              <div className="md:col-span-3 relative p-5 md:p-8 flex items-center justify-center bg-gradient-to-br from-zinc-900 to-black min-h-[360px]">
                {isHighRarity(card.rarity) && (
                  <div
                    className="absolute inset-0 opacity-60"
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
                    "relative w-full max-w-[280px] aspect-[5/7] rounded-xl overflow-hidden ring-2",
                    RARITY_STYLE[card.rarity].frame,
                    RARITY_STYLE[card.rarity].glow
                  )}
                >
                  {isHighRarity(card.rarity) && <div className="rarity-ring" />}
                  {card.imageUrl && !imgError ? (
                    <img
                      src={card.imageUrl}
                      alt={card.name}
                      className="w-full h-full object-cover"
                      onError={() => setImgError(true)}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-700 to-amber-600 p-4 text-center">
                      <div>
                        <div className="text-xs text-white/60">#{card.number}</div>
                        <div className="mt-2 text-white font-bold">
                          {card.name}
                        </div>
                      </div>
                    </div>
                  )}
                  {isHighRarity(card.rarity) && <div className="holo-overlay" />}
                </div>
              </div>

              {/* Meta panel */}
              <div className="md:col-span-2 p-5 md:p-6 flex flex-col gap-4">
                <div>
                  <RarityBadge rarity={card.rarity} size="md" />
                  <h2 className="mt-3 text-2xl md:text-3xl font-black text-white leading-tight">
                    {card.name}
                  </h2>
                  <p className="mt-1 text-xs text-zinc-400">
                    {SETS[card.setCode].name} · 번호 {card.number}
                  </p>
                </div>

                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <Info label="등급" value={RARITY_LABEL[card.rarity]} />
                  <Info label="보유 장수" value={`${count}장`} />
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
                      className="h-11 rounded-xl bg-gradient-to-r from-amber-400 to-rose-500 text-zinc-950 font-bold text-sm hover:scale-[1.02] active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      🎁 카드 선물하기
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
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const submit = async () => {
    if (!user || !recipient.trim() || sending) return;
    setSending(true);
    setError(null);
    const res = await giftCard(user.id, recipient.trim(), card.id);
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
        placeholder="예: min"
        className="w-full h-11 px-3 rounded-lg bg-black/40 border border-white/10 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
      />
      {error && (
        <p className="mt-2 text-xs text-rose-400">{error}</p>
      )}
      {success && (
        <p className="mt-2 text-xs text-emerald-300">
          🎉 선물이 전송되었습니다!
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          onClick={submit}
          disabled={sending || success || !recipient.trim()}
          className="flex-1 h-10 rounded-lg bg-gradient-to-r from-amber-400 to-rose-500 text-zinc-950 font-bold text-sm disabled:opacity-50"
        >
          {sending ? "보내는 중..." : success ? "전송 완료" : "보내기"}
        </button>
        <button
          onClick={onCancel}
          disabled={sending}
          className="flex-1 h-10 rounded-lg bg-white/10 hover:bg-white/15 text-white font-semibold text-sm"
        >
          취소
        </button>
      </div>
    </div>
  );
}
