"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import type { Card } from "@/lib/types";
import { RARITY_LABEL, RARITY_STYLE, isHighRarity } from "@/lib/rarity";
import { SETS } from "@/lib/sets";
import { useAuth } from "@/lib/auth";
import { createGift, fetchGiftQuota } from "@/lib/db";
import type { GiftQuota } from "@/lib/types";
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
          className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-md overflow-y-auto overscroll-contain"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          {/* Scrollable backdrop + min-h-[100dvh] flex-center is the
              reliable modal pattern across iOS Safari / Chrome / Android.
              If modal fits → centered. If taller → backdrop scrolls. */}
          <div
            className="flex items-center justify-center px-3 md:px-6"
            style={{
              minHeight: "100dvh",
              paddingTop: "max(env(safe-area-inset-top, 0px), 12px)",
              paddingBottom: "max(env(safe-area-inset-bottom, 0px), 12px)",
            }}
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              className={clsx(
                "relative w-full md:max-w-3xl bg-zinc-950/95 border border-white/10",
                "rounded-2xl shadow-2xl flex flex-col overflow-hidden"
              )}
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

              {/* Body — natural height; backdrop handles scroll */}
              <div className="flex-1">
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
                          style={{ touchAction: "manipulation" }}
                          className="h-12 rounded-xl bg-gradient-to-r from-amber-400 to-rose-500 text-zinc-950 font-bold text-sm hover:scale-[1.02] active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          친구에게 선물 보내기
                        </button>
                        <button
                          onClick={onClose}
                          style={{ touchAction: "manipulation" }}
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
          </div>
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
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [quota, setQuota] = useState<GiftQuota | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchGiftQuota(user.id).then(setQuota);
  }, [user]);

  const submit = async () => {
    if (!user || !recipient.trim() || sending) return;
    const price = Math.max(0, Math.floor(Number(priceRaw) || 0));
    setSending(true);
    setError(null);
    const trimmedMsg = message.trim();
    const res = await createGift(
      user.id,
      recipient.trim(),
      card.id,
      price,
      trimmedMsg || undefined
    );
    setSending(false);
    if (!res.ok) {
      setError(res.error ?? "선물 전송 실패");
      return;
    }
    setSuccess(true);
    setTimeout(onSuccess, 900);
  };

  const onInputFocus = () => {
    setTimeout(() => {
      formRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 300);
  };

  return (
    <div
      ref={formRef}
      className="mt-auto rounded-xl bg-white/5 border border-white/10 p-4"
    >
      <label className="block">
        <span className="text-xs text-zinc-300 mb-2 block">
          받는 사람 아이디
        </span>
        <input
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          onFocus={onInputFocus}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="예: min"
          style={{ fontSize: "16px" }}
          className="w-full h-12 px-3 rounded-lg bg-black/40 border border-white/10 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
        />
      </label>

      <label className="block mt-3">
        <span className="text-xs text-zinc-300 mb-2 block">
          받는 사람이 지불할 포인트
        </span>
        <div className="flex items-stretch gap-1.5">
          <input
            value={priceRaw}
            onChange={(e) =>
              setPriceRaw(e.target.value.replace(/[^0-9]/g, ""))
            }
            onFocus={onInputFocus}
            inputMode="numeric"
            style={{ fontSize: "16px" }}
            className="flex-1 h-12 px-3 rounded-lg bg-black/40 border border-white/10 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
            placeholder="0"
          />
          <span className="inline-flex items-center gap-1.5 px-3 rounded-lg bg-white/5 border border-white/10 text-xs text-zinc-300">
            <CoinIcon size="xs" /> 포인트
          </span>
        </div>
      </label>

      <label className="block mt-3">
        <span className="text-xs text-zinc-300 mb-2 block">
          선물 메시지 <span className="text-zinc-500">(선택)</span>
        </span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, 140))}
          onFocus={onInputFocus}
          rows={2}
          maxLength={140}
          placeholder="짧은 메시지를 남겨보세요"
          style={{ fontSize: "16px" }}
          className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-400/60 resize-none"
        />
        <div className="mt-1 text-right text-[10px] text-zinc-500 tabular-nums">
          {message.length} / 140
        </div>
      </label>

      <p className="mt-1 text-[11px] text-zinc-500 leading-snug">
        24시간 내에 수락해야 해요. 미수락 시 카드는 자동 반환.
        {quota && (
          <span className="block mt-0.5 text-zinc-400">
            오늘 선물 {quota.used}/{quota.limit} 사용 (남은 {quota.remaining}회)
          </span>
        )}
      </p>

      {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
      {success && (
        <p className="mt-2 text-xs text-emerald-300">
          선물이 전송되었습니다!
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={sending || success || !recipient.trim()}
          style={{ touchAction: "manipulation" }}
          className="flex-1 h-12 rounded-lg bg-gradient-to-r from-amber-400 to-rose-500 text-zinc-950 font-bold text-sm disabled:opacity-50 active:scale-[0.98] transition"
        >
          {sending ? "보내는 중..." : success ? "전송 완료" : "선물 보내기"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={sending}
          style={{ touchAction: "manipulation" }}
          className="flex-1 h-12 rounded-lg bg-white/10 hover:bg-white/15 text-white font-semibold text-sm"
        >
          취소
        </button>
      </div>
    </div>
  );
}
