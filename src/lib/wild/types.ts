/** 18 main-series Pokemon types. Korean labels are the client-visible
 *  canonical form; English keys are used internally only for the
 *  effectiveness chart. */

export type WildType =
  | "노말"
  | "불꽃"
  | "물"
  | "풀"
  | "전기"
  | "얼음"
  | "격투"
  | "독"
  | "땅"
  | "비행"
  | "에스퍼"
  | "벌레"
  | "바위"
  | "고스트"
  | "드래곤"
  | "악"
  | "강철"
  | "페어리";

/** Tailwind tint per type, used on type badges + sprite glow halos. */
export const TYPE_STYLE: Record<
  WildType,
  { badge: string; glow: string; ring: string }
> = {
  노말:   { badge: "bg-zinc-500 text-white",     glow: "shadow-[0_0_22px_rgba(161,161,170,0.5)]",  ring: "ring-zinc-400/50" },
  불꽃:   { badge: "bg-orange-600 text-white",   glow: "shadow-[0_0_22px_rgba(234,88,12,0.55)]",   ring: "ring-orange-400/60" },
  물:     { badge: "bg-sky-600 text-white",      glow: "shadow-[0_0_22px_rgba(2,132,199,0.55)]",   ring: "ring-sky-400/60" },
  풀:     { badge: "bg-emerald-600 text-white",  glow: "shadow-[0_0_22px_rgba(5,150,105,0.55)]",   ring: "ring-emerald-400/60" },
  전기:   { badge: "bg-yellow-500 text-zinc-900",glow: "shadow-[0_0_22px_rgba(234,179,8,0.6)]",    ring: "ring-yellow-300/70" },
  얼음:   { badge: "bg-cyan-400 text-zinc-900",  glow: "shadow-[0_0_22px_rgba(34,211,238,0.6)]",   ring: "ring-cyan-300/60" },
  격투:   { badge: "bg-red-700 text-white",      glow: "shadow-[0_0_22px_rgba(185,28,28,0.55)]",   ring: "ring-red-500/60" },
  독:     { badge: "bg-purple-600 text-white",   glow: "shadow-[0_0_22px_rgba(147,51,234,0.55)]",  ring: "ring-purple-400/60" },
  땅:     { badge: "bg-amber-700 text-white",    glow: "shadow-[0_0_22px_rgba(180,83,9,0.55)]",    ring: "ring-amber-500/60" },
  비행:   { badge: "bg-indigo-400 text-white",   glow: "shadow-[0_0_22px_rgba(129,140,248,0.55)]", ring: "ring-indigo-300/60" },
  에스퍼: { badge: "bg-pink-500 text-white",     glow: "shadow-[0_0_22px_rgba(236,72,153,0.6)]",   ring: "ring-pink-400/60" },
  벌레:   { badge: "bg-lime-600 text-white",     glow: "shadow-[0_0_22px_rgba(101,163,13,0.55)]",  ring: "ring-lime-400/60" },
  바위:   { badge: "bg-stone-600 text-white",    glow: "shadow-[0_0_22px_rgba(120,113,108,0.55)]", ring: "ring-stone-400/60" },
  고스트: { badge: "bg-violet-700 text-white",   glow: "shadow-[0_0_22px_rgba(109,40,217,0.55)]",  ring: "ring-violet-400/60" },
  드래곤: { badge: "bg-indigo-700 text-white",   glow: "shadow-[0_0_22px_rgba(67,56,202,0.55)]",   ring: "ring-indigo-500/70" },
  악:     { badge: "bg-zinc-800 text-white",     glow: "shadow-[0_0_22px_rgba(39,39,42,0.8)]",     ring: "ring-zinc-600/70" },
  강철:   { badge: "bg-slate-500 text-white",    glow: "shadow-[0_0_22px_rgba(100,116,139,0.55)]", ring: "ring-slate-300/60" },
  페어리: { badge: "bg-pink-400 text-zinc-900",  glow: "shadow-[0_0_22px_rgba(244,114,182,0.55)]", ring: "ring-pink-300/60" },
};
