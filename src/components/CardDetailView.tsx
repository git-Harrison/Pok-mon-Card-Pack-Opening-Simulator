"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { fetchWallet } from "@/lib/db";
import { getCard, SETS } from "@/lib/sets";
import { RARITY_LABEL, RARITY_STYLE, cardFxClass } from "@/lib/rarity";
import RarityBadge from "./RarityBadge";

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

  const fx = cardFxClass(card.rarity);
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
            {fx && (
              <div
                className="absolute inset-0 opacity-40 pointer-events-none"
                style={{
                  background: `radial-gradient(closest-side, ${
                    card.rarity === "MUR" ? "#f59e0b" : "#c084fc"
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
              {fx && <div className={fx} />}
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

            <div className="mt-auto flex flex-col gap-2">
              <Link
                href="/wallet?tab=psa"
                style={{ touchAction: "manipulation" }}
                className="h-12 rounded-xl bg-gradient-to-r from-amber-400 to-rose-500 text-zinc-950 font-bold text-sm hover:scale-[1.02] active:scale-[0.98] transition inline-flex items-center justify-center"
              >
                🎁 PCL 슬랩 선물 보내기
              </Link>
              <p className="text-[11px] text-zinc-500 leading-snug text-center">
                선물은 PCL 6 이상 감별 슬랩만 보낼 수 있어요. PCL 탭에서
                골라 보내세요.
              </p>
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

