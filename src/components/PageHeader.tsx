import clsx from "clsx";

/**
 * Shared page header used across all app routes. Standardizes title
 * size / subtitle length / stats row / spacing so mobile views don't
 * each invent their own padding & font ladder.
 *
 * Keep subtitles to one short sentence. Longer explainers should live
 * in a collapsible 도움말 chip, not in the header.
 */
export default function PageHeader({
  title,
  subtitle,
  icon,
  stats,
  actions,
  dense = false,
  tone = "neutral",
}: {
  title: string;
  /** One-line hook. Keep under ~60 chars Korean. */
  subtitle?: string;
  /** Leading emoji / icon character for the title. */
  icon?: string;
  /** Right-aligned compact stats (KPI pills etc.). */
  stats?: React.ReactNode;
  /** Bottom-row interactive buttons (shop, invite, bulk-sell etc.). */
  actions?: React.ReactNode;
  /** Halve the vertical padding for full-bleed immersive pages. */
  dense?: boolean;
  /** Subtle title color accent. */
  tone?: "neutral" | "amber" | "fuchsia" | "emerald";
}) {
  const titleTone =
    tone === "amber"
      ? "text-amber-100"
      : tone === "fuchsia"
      ? "bg-gradient-to-r from-fuchsia-300 via-violet-200 to-indigo-300 bg-clip-text text-transparent"
      : tone === "emerald"
      ? "text-emerald-100"
      : "text-white";

  return (
    <header
      className={clsx(
        "flex items-start justify-between gap-3 flex-wrap",
        dense ? "" : "mb-2 md:mb-5"
      )}
    >
      <div className="min-w-0 hidden md:block">
        <h1
          className={clsx(
            "text-2xl md:text-3xl font-black tracking-tight leading-tight",
            titleTone
          )}
        >
          {icon && <span className="mr-1">{icon}</span>}
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-xs md:text-sm text-zinc-400 line-clamp-2">
            {subtitle}
          </p>
        )}
      </div>
      {stats && (
        <div className="flex items-center gap-2 text-xs flex-wrap min-w-0">{stats}</div>
      )}
      {actions && (
        <div className="w-full flex items-center gap-2 flex-wrap">{actions}</div>
      )}
    </header>
  );
}
