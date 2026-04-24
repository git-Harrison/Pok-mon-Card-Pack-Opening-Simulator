"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth";
import {
  createGift,
  fetchGiftQuota,
  fetchWallet,
} from "@/lib/db";
import { getCard, SETS } from "@/lib/sets";
import { RARITY_LABEL, RARITY_STYLE, isHighRarity } from "@/lib/rarity";
import type { Card, GiftQuota } from "@/lib/types";
import RarityBadge from "./RarityBadge";
import CoinIcon from "./CoinIcon";

/**
 * Full-page card detail view (route-based replacement for the modal).
 * No fixed positioning, no backdrop, no portal — just a normal page so
 * there's zero CSS-conflict risk with the app shell.
 */
export default function CardDetailView({ cardId }: { cardId: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const card = getCard(cardId);
  const [count, setCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "copied" | "shared">(
    "idle"
  );

  const handleShare = useCallback(async () => {
    if (typeof window === "undefined" || !card) return;
    const origin = window.location.origin;
    const url = `${origin}/card/${encodeURIComponent(card.id)}`;
    const title = `${card.name} (${card.rarity})`;

    // Try image-file share first (mobile native picker attaches the art).
    // We proxy via /api/card-image so fetch() doesn't trip Pokellector CORS.
    try {
      const res = await fetch(
        `${origin}/api/card-image/${encodeURIComponent(card.id)}`
      );
      if (res.ok) {
        const blob = await res.blob();
        const mime = blob.type || "image/png";
        const ext = mime.split("/")[1]?.split(";")[0] ?? "png";
        const filename = `${card.id}.${ext}`;
        const file = new File([blob], filename, { type: mime });
        const nav = navigator as Navigator & {
          canShare?: (data: ShareData) => boolean;
        };
        if (
          typeof nav.share === "function" &&
          typeof nav.canShare === "function" &&
          nav.canShare({ files: [file] })
        ) {
          await nav.share({ files: [file], title, text: title });
          setShareState("shared");
          setTimeout(() => setShareState("idle"), 2500);
          return;
        }
      }
    } catch {
      // fall through to URL / clipboard
    }

    // No file-share support — share the URL instead.
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text: title, url });
        setShareState("shared");
        setTimeout(() => setShareState("idle"), 2500);
        return;
      } catch {
        // user canceled or error; fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareState("copied");
      setTimeout(() => setShareState("idle"), 2500);
    } catch {
      window.prompt("카드 링크를 복사하세요", url);
    }
  }, [card]);

  useEffect(() => {
    if (!user) return;
    let canceled = false;
    fetchWallet(user.id).then((w) => {
      if (canceled) return;
      const item = w.items.find((it) => it.card.id === cardId);
      setCount(item?.count ?? 0);
      setLoaded(true);
    });
    return () => {
      canceled = true;
    };
  }, [user, cardId]);

  if (!card) {
    return (
      <div className="max-w-xl mx-auto px-4 py-10 text-center">
        <p className="text-sm text-zinc-400">카드를 찾을 수 없어요.</p>
        <Link
          href="/wallet"
          className="mt-4 inline-flex h-11 px-5 rounded-xl bg-white/10 text-white font-semibold text-sm hover:bg-white/15"
        >
          지갑으로 돌아가기
        </Link>
      </div>
    );
  }

  const hot = isHighRarity(card.rarity);
  const style = RARITY_STYLE[card.rarity];

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-4 md:py-8 fade-in">
      {/* Back bar */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 text-sm text-zinc-300 hover:text-white"
          style={{ touchAction: "manipulation" }}
        >
          <span aria-hidden>←</span>
          <span>뒤로</span>
        </button>
        <Link
          href="/wallet"
          className="text-xs text-zinc-400 hover:text-white"
        >
          지갑으로
        </Link>
      </div>

      <div className="rounded-3xl overflow-hidden border border-white/10 bg-zinc-950/90">
        <div className="grid grid-cols-1 md:grid-cols-5">
          {/* Card image */}
          <div className="md:col-span-3 relative p-5 md:p-8 flex items-center justify-center bg-gradient-to-br from-zinc-900 to-black min-h-[320px]">
            {hot && (
              <div
                className="absolute inset-0 opacity-60 pointer-events-none"
                style={{
                  background: `radial-gradient(closest-side, ${
                    style.tier >= 7 ? "#f59e0b" : "#818cf8"
                  }55, transparent 70%)`,
                }}
              />
            )}
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{
                type: "spring",
                stiffness: 220,
                damping: 22,
              }}
              className={clsx(
                "relative rounded-xl overflow-hidden ring-2 bg-zinc-900",
                style.frame,
                style.glow
              )}
              style={{
                width: "min(70vw, 280px)",
                aspectRatio: "5 / 7",
              }}
            >
              {hot && <div className="rarity-ring" />}
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
                    <div className="text-xs text-white/60">#{card.number}</div>
                    <div className="mt-2 text-white font-bold">{card.name}</div>
                  </div>
                </div>
              )}
              {hot && <div className="holo-overlay" />}
            </motion.div>
          </div>

          {/* Meta + actions */}
          <div className="md:col-span-2 p-5 md:p-6 flex flex-col gap-4">
            <div>
              <RarityBadge rarity={card.rarity} size="md" />
              <h1 className="mt-3 text-2xl md:text-3xl font-black text-white leading-tight">
                {card.name}
              </h1>
              <p className="mt-1 text-xs text-zinc-400">
                {SETS[card.setCode].name} · 번호 {card.number}
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-2 text-sm">
              <Info label="등급" value={RARITY_LABEL[card.rarity]} />
              <Info label="보유" value={loaded ? `${count}장` : "..."} />
            </dl>

            {giftOpen ? (
              <GiftForm
                card={card}
                ownedCount={count}
                onCancel={() => setGiftOpen(false)}
                onSuccess={() => {
                  setGiftOpen(false);
                  router.push("/wallet");
                }}
              />
            ) : (
              <div className="mt-auto flex flex-col gap-2">
                <button
                  onClick={() => setGiftOpen(true)}
                  disabled={!loaded || count <= 0}
                  style={{ touchAction: "manipulation" }}
                  className="h-12 rounded-xl bg-gradient-to-r from-amber-400 to-rose-500 text-zinc-950 font-bold text-sm hover:scale-[1.02] active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  친구에게 선물 보내기
                </button>
                <button
                  onClick={handleShare}
                  style={{ touchAction: "manipulation" }}
                  className="h-11 rounded-xl bg-gradient-to-r from-fuchsia-500 to-indigo-500 text-white font-bold text-sm hover:scale-[1.02] active:scale-[0.98] transition inline-flex items-center justify-center gap-1.5"
                >
                  🔗{" "}
                  {shareState === "copied"
                    ? "링크 복사됨!"
                    : shareState === "shared"
                    ? "공유 완료!"
                    : "카드 공유하기"}
                </button>
                <button
                  onClick={() => router.back()}
                  style={{ touchAction: "manipulation" }}
                  className="h-11 rounded-xl bg-white/5 hover:bg-white/10 text-white font-semibold text-sm border border-white/10"
                >
                  뒤로
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
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
  ownedCount,
  onCancel,
  onSuccess,
}: {
  card: Card;
  ownedCount: number;
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

  const submit = useCallback(async () => {
    if (!user || !recipient.trim() || sending) return;
    if (ownedCount <= 0) {
      setError("카드가 없어요.");
      return;
    }
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
  }, [user, recipient, sending, ownedCount, priceRaw, message, card.id, onSuccess]);

  const onInputFocus = () => {
    setTimeout(() => {
      formRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 300);
  };

  return (
    <div ref={formRef} className="mt-auto rounded-xl bg-white/5 border border-white/10 p-4">
      <label className="block">
        <span className="text-xs text-zinc-300 mb-2 block">
          받는 사람 닉네임
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
            onChange={(e) => setPriceRaw(e.target.value.replace(/[^0-9]/g, ""))}
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
