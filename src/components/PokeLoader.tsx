"use client";

import clsx from "clsx";
import Portal from "./Portal";

const SIZE_MAP = {
  sm: "w-7 h-7",
  md: "w-12 h-12",
  lg: "w-20 h-20",
} as const;

export default function PokeLoader({
  size = "md",
  label,
  className,
}: {
  size?: keyof typeof SIZE_MAP;
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "inline-flex flex-col items-center justify-center gap-2",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <div
        className={clsx(
          "relative animate-pokeball-spin drop-shadow-[0_4px_12px_rgba(239,68,68,0.45)]",
          SIZE_MAP[size]
        )}
      >
        <div className="absolute inset-0 rounded-full overflow-hidden ring-2 ring-black/80">
          <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-rose-400 via-red-500 to-red-700" />
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-b from-zinc-100 via-zinc-200 to-zinc-300" />
          <div
            aria-hidden
            className="absolute left-1/4 top-[6%] w-2/5 h-1/4 rounded-full bg-white/30 blur-sm"
          />
        </div>
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[14%] bg-black/85" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1/3 aspect-square rounded-full bg-white border-[2px] border-black/85 shadow-[inset_0_-2px_4px_rgba(0,0,0,0.25)]" />
      </div>
      {label && (
        <span className="text-[11px] font-semibold text-zinc-300 tracking-wide">
          {label}
        </span>
      )}
    </div>
  );
}

export function CenteredPokeLoader({
  label = "불러오는 중...",
}: {
  label?: string;
}) {
  return (
    <Portal>
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-none"
        style={{
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
        aria-live="polite"
      >
        <div className="flex flex-col items-center gap-3">
          <PokeLoader size="lg" />
          <p className="text-xs font-semibold text-zinc-200 tracking-wide drop-shadow">
            {label}
          </p>
        </div>
      </div>
    </Portal>
  );
}
