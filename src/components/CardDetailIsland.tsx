"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { fetchWallet } from "@/lib/db";

/**
 * Wallet-count card for the card detail page.
 *
 * Lives inside the parent `<dl>` so it must render a `<div>` with
 * `<dt>/<dd>` semantics matching the sibling 등급 cell. The fetched
 * count requires auth (useAuth) so this is necessarily client-side.
 * SSR initially shows the "..." placeholder, so the layout is stable
 * before hydration.
 */
export function CardWalletCount({ cardId }: { cardId: string }) {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

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

  return (
    <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
      <dt className="text-[10px] uppercase tracking-wider text-zinc-400">
        보유
      </dt>
      <dd className="mt-0.5 text-sm font-bold text-white">
        {loaded ? `${count}장` : "..."}
      </dd>
    </div>
  );
}

/**
 * Action buttons for the card detail page (gift / share / back).
 *
 * Share uses navigator.share + clipboard, and the back button uses
 * router.back() — both client-only APIs.
 */
export function CardActions({
  cardId,
  cardName,
  cardRarity,
}: {
  cardId: string;
  cardName: string;
  cardRarity: string;
}) {
  const router = useRouter();
  const [shareState, setShareState] = useState<"idle" | "copied" | "shared">(
    "idle"
  );

  const handleShare = useCallback(async () => {
    if (typeof window === "undefined") return;
    const origin = window.location.origin;
    const url = `${origin}/card/${encodeURIComponent(cardId)}`;
    const title = `${cardName} (${cardRarity})`;

    // Try image-file share first (mobile native picker attaches the art).
    // We proxy via /api/card-image so fetch() doesn't trip Pokellector CORS.
    try {
      const res = await fetch(
        `${origin}/api/card-image/${encodeURIComponent(cardId)}`
      );
      if (res.ok) {
        const blob = await res.blob();
        const mime = blob.type || "image/png";
        const ext = mime.split("/")[1]?.split(";")[0] ?? "png";
        const filename = `${cardId}.${ext}`;
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
  }, [cardId, cardName, cardRarity]);

  return (
    <div className="mt-auto flex flex-col gap-2">
      <Link
        href="/wallet?tab=pcl"
        style={{ touchAction: "manipulation" }}
        className="h-12 rounded-xl bg-gradient-to-r from-amber-400 to-rose-500 text-zinc-950 font-bold text-sm hover:scale-[1.02] active:scale-[0.98] transition inline-flex items-center justify-center"
      >
        🎁 PCL 슬랩 선물 보내기
      </Link>
      <p className="text-[11px] text-zinc-500 leading-snug text-center">
        선물은 PCL 6 이상 감별 슬랩만 보낼 수 있어요. PCL 탭에서 골라 보내세요.
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
  );
}

/** Tiny back-button island for the top bar — needs router.back(). */
export function BackButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.back()}
      className="inline-flex items-center gap-1 text-sm text-zinc-300 hover:text-white"
      style={{ touchAction: "manipulation" }}
    >
      <span aria-hidden>←</span>
      <span>뒤로</span>
    </button>
  );
}
