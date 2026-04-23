import clsx from "clsx";
import { RARITY_LABEL, RARITY_STYLE } from "@/lib/rarity";
import type { Rarity } from "@/lib/types";

export default function RarityBadge({
  rarity,
  size = "sm",
}: {
  rarity: Rarity;
  size?: "xs" | "sm" | "md";
}) {
  const style = RARITY_STYLE[rarity];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded font-bold tracking-wide",
        style.badge,
        size === "xs" && "px-1.5 py-0.5 text-[10px]",
        size === "sm" && "px-2 py-0.5 text-xs",
        size === "md" && "px-2.5 py-1 text-sm"
      )}
    >
      <span>{rarity}</span>
      {size !== "xs" && (
        <span className="opacity-70 font-medium">· {RARITY_LABEL[rarity]}</span>
      )}
    </span>
  );
}
