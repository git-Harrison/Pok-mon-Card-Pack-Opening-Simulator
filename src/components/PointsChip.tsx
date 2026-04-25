"use client";

import clsx from "clsx";
import CoinIcon from "./CoinIcon";

export default function PointsChip({
  points,
  size = "md",
  highlight = false,
}: {
  points: number;
  size?: "sm" | "md";
  highlight?: boolean;
}) {
  return (
    <span
      className={clsx(
        "relative inline-flex items-center gap-1.5 rounded-full font-bold",
        "bg-gradient-to-r from-amber-400 to-yellow-500 text-zinc-950",
        size === "sm" && "px-2 py-0.5 text-xs",
        size === "md" && "px-3 py-1 text-sm",
        highlight && "shadow-[0_0_18px_rgba(251,191,36,0.55)]"
      )}
    >
      <CoinIcon size={size === "sm" ? "xs" : "sm"} />
      <span className="tabular-nums">{points.toLocaleString("ko-KR")}</span>
    </span>
  );
}
