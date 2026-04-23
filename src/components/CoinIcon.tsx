import clsx from "clsx";

/**
 * Platform-consistent coin icon used anywhere "points" appear.
 * Drawn with CSS only so it renders identically on every OS/browser
 * (emoji fallbacks vary wildly across Windows / iOS / Android / macOS).
 */
export default function CoinIcon({
  size = "sm",
  className,
}: {
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeCls = {
    xs: "w-3 h-3 text-[7px]",
    sm: "w-[15px] h-[15px] text-[9px]",
    md: "w-5 h-5 text-[11px]",
    lg: "w-6 h-6 text-[13px]",
  }[size];
  return (
    <span
      aria-hidden
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-black select-none leading-none",
        "bg-gradient-to-br from-amber-100 via-amber-300 to-amber-600",
        "text-amber-950 ring-1 ring-amber-900/40",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.6),inset_0_-1px_0_rgba(120,53,15,0.3)]",
        sizeCls,
        className
      )}
    >
      P
    </span>
  );
}
