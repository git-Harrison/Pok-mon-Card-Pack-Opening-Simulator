"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import Portal from "./Portal";

/**
 * Page-level "도움말" affordance.
 *
 * Pattern across the app:
 *   <HelpButton title="박스 개봉" sections={[...]} />
 *
 * Renders a small chip (mobile-friendly — does not take a full row) and
 * opens a modal with the page's explainer content. Pages should put
 * their long-form copy here and keep their own headers terse so the
 * mobile layout doesn't carry redundant explanation paragraphs.
 */

export interface HelpSection {
  /** Short section title (8–16 chars Korean works best). */
  heading: string;
  /** Body — JSX so the call site can use lists, badges, code, etc. */
  body: React.ReactNode;
  /** Optional emoji prefix for the heading. */
  icon?: string;
}

export default function HelpButton({
  title,
  sections,
  size = "md",
  className,
}: {
  /** Modal title — usually the page name. */
  title: string;
  sections: HelpSection[];
  size?: "sm" | "md";
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  // Lock body scroll while open so the modal doesn't fight scroll on
  // mobile.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ESC to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="도움말"
        className={clsx(
          "inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 active:bg-white/15 text-zinc-200 font-semibold transition",
          size === "sm" ? "h-7 px-2.5 text-[10px]" : "h-8 px-3 text-[11px]",
          className
        )}
        style={{ touchAction: "manipulation" }}
      >
        <span aria-hidden>❓</span>
        <span>도움말</span>
      </button>

      <AnimatePresence>
        {open && (
          <Portal>
            <motion.div
              key="backdrop"
              className="fixed inset-0 z-[180] bg-black/85 backdrop-blur-md flex items-end md:items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              style={{
                paddingTop: "max(env(safe-area-inset-top, 0px), 12px)",
                paddingBottom: "max(env(safe-area-inset-bottom, 0px), 12px)",
                paddingLeft: 12,
                paddingRight: 12,
              }}
            >
              <motion.div
                className="relative w-full max-w-md bg-zinc-950 border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
                style={{ maxHeight: "calc(100dvh - 24px)" }}
                initial={{ y: 32, opacity: 0, scale: 0.97 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 32, opacity: 0, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 220, damping: 24 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="shrink-0 flex items-center justify-between gap-3 px-4 h-12 border-b border-white/10 bg-gradient-to-r from-amber-500/10 via-fuchsia-500/10 to-indigo-500/10">
                  <h2 className="text-sm font-bold text-white inline-flex items-center gap-1.5">
                    <span aria-hidden>📖</span>
                    {title} · 도움말
                  </h2>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="닫기"
                    className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white inline-flex items-center justify-center"
                    style={{ touchAction: "manipulation" }}
                  >
                    ✕
                  </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
                  {sections.map((s, i) => (
                    <section key={i}>
                      <h3 className="text-[11px] uppercase tracking-[0.18em] font-bold text-amber-300 mb-1.5">
                        {s.icon && <span className="mr-1">{s.icon}</span>}
                        {s.heading}
                      </h3>
                      <div className="text-[12.5px] leading-relaxed text-zinc-200 [&_b]:text-white [&_ul]:mt-1 [&_ul]:space-y-0.5 [&_li]:list-disc [&_li]:ml-5 [&_p+p]:mt-2">
                        {s.body}
                      </div>
                    </section>
                  ))}
                </div>

                <div className="shrink-0 border-t border-white/10 p-3 bg-black/40">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="w-full h-11 rounded-xl bg-white text-zinc-900 font-bold text-sm active:scale-[0.98]"
                    style={{ touchAction: "manipulation" }}
                  >
                    확인
                  </button>
                </div>
              </motion.div>
            </motion.div>
          </Portal>
        )}
      </AnimatePresence>
    </>
  );
}
