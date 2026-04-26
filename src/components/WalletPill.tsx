"use client";

/**
 * Header wallet points pill.
 *
 * Visual:
 *  - Gold gradient w/ inner glow + animated CoinIcon (slow rotate on hover,
 *    shine sweep across the pill)
 *  - Numbers under 1M are shown in full (`123,456p`); 1M+ are abbreviated
 *    (`12.3Mp`) with the full value in `title`
 *  - On very narrow viewports the icon is hidden so the number always fits
 *
 * Behavior:
 *  - Animated count-up via framer-motion's `animate(from, to, …)` on delta
 *    changes (NOT on initial mount). Respects `useReducedMotion`.
 *  - `<Link href="/wallet">` with `active:scale-[0.97]` press feedback
 *  - Skeleton (pulsing placeholder) shown while `points` is `null`
 */

import Link from "next/link";
import { memo, useEffect, useRef, useState } from "react";
import { animate, motion, useReducedMotion } from "framer-motion";
import clsx from "clsx";
import CoinIcon from "./CoinIcon";
import { formatKoreanPoints } from "@/lib/format";
import { useIsMobile } from "@/lib/useIsMobile";

function PulseSkeleton({ size }: { size: "sm" | "md" }) {
  return (
    <span
      aria-hidden
      className={clsx(
        "relative inline-flex items-center gap-1.5 rounded-full font-bold overflow-hidden",
        "bg-white/10 ring-1 ring-white/10",
        size === "sm" && "h-7 w-[88px] px-2",
        size === "md" && "h-8 w-[104px] px-3"
      )}
    >
      <span className="absolute inset-0 animate-pulse bg-gradient-to-r from-white/0 via-white/10 to-white/0" />
    </span>
  );
}

function WalletPillImpl({
  points,
  size = "sm",
}: {
  points: number | null | undefined;
  size?: "sm" | "md";
}) {
  const reduce = useReducedMotion();
  const isMobile = useIsMobile();
  // 모바일 + 모션 감소 환경에서는 헤더 코인의 12초 무한 회전을 끈다.
  // 모든 페이지의 navbar 에 항상 보이는 요소라 mobile GPU 합성기에 지속
  // 부하를 주는데 비해 시각적 가치는 작음.
  const animateCoin = !reduce && !isMobile;
  const [display, setDisplay] = useState<number>(points ?? 0);
  const prevRef = useRef<number | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (points == null) return;
    // First time we see a real value → snap, no animation
    if (!mountedRef.current) {
      mountedRef.current = true;
      prevRef.current = points;
      setDisplay(points);
      return;
    }
    const from = prevRef.current ?? points;
    if (from === points) return;
    prevRef.current = points;

    if (reduce) {
      setDisplay(points);
      return;
    }

    const controls = animate(from, points, {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [points, reduce]);

  if (points == null) return <PulseSkeleton size={size} />;

  const fullLabel = `${points.toLocaleString("ko-KR")}p`;
  const numText = formatKoreanPoints(display);

  return (
    <Link
      href="/wallet"
      title={fullLabel}
      aria-label={`내 지갑 잔액 ${fullLabel}`}
      className={clsx(
        "group relative inline-flex items-center gap-1.5 rounded-full font-extrabold",
        "text-zinc-950 select-none overflow-hidden isolate",
        // gold gradient + inner glow
        "bg-gradient-to-b from-amber-200 via-amber-400 to-yellow-500",
        "ring-1 ring-amber-900/30",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.55),inset_0_-1px_0_rgba(120,53,15,0.25),0_0_14px_rgba(251,191,36,0.35)]",
        "transition-transform active:scale-[0.97]",
        "hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.6),inset_0_-1px_0_rgba(120,53,15,0.3),0_0_22px_rgba(251,191,36,0.55)]",
        size === "sm" && "px-2 py-0.5 text-xs h-7",
        size === "md" && "px-3 py-1 text-sm h-8"
      )}
    >
      {/* Shine sweep on hover */}
      {!reduce && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/70 to-transparent skew-x-[-20deg] opacity-0 group-hover:opacity-100"
          initial={false}
          animate={{ x: ["0%", "300%"] }}
          transition={{
            duration: 1.6,
            ease: "easeInOut",
            repeat: Infinity,
            repeatDelay: 1.4,
          }}
        />
      )}

      <motion.span
        aria-hidden
        className={clsx(
          // Hide the coin on very narrow viewports so the number always fits
          "inline-flex shrink-0",
          "[@media(max-width:359px)]:hidden"
        )}
        initial={false}
        animate={animateCoin ? { rotate: [0, 360] } : undefined}
        transition={
          animateCoin
            ? {
                duration: 12,
                ease: "linear",
                repeat: Infinity,
              }
            : undefined
        }
        style={{ transformStyle: "preserve-3d" }}
      >
        <CoinIcon size={size === "sm" ? "xs" : "sm"} />
      </motion.span>

      <span className="tabular-nums leading-none relative z-[1]">
        {numText}
      </span>
    </Link>
  );
}

// memo 로 감싸서 navbar 가 다른 사유(라우트 변경, gift badge 변경 등)로
// 리렌더돼도 points / size 가 동일하면 WalletPill 은 스킵. 안에 framer-motion
// 무한 회전이 있어서 매 리렌더마다 motion 인스턴스가 재초기화되던 비용 제거.
const WalletPill = memo(WalletPillImpl);
export default WalletPill;
