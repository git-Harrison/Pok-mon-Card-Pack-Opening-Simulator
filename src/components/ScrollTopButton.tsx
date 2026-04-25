"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const SHOW_AFTER = 320;

export default function ScrollTopButton() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setShow(window.scrollY > SHOW_AFTER);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.button
          key="scroll-top"
          type="button"
          onClick={() =>
            window.scrollTo({ top: 0, behavior: "smooth" })
          }
          aria-label="맨 위로"
          initial={{ opacity: 0, y: 12, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.9 }}
          transition={{ duration: 0.18 }}
          style={{ touchAction: "manipulation" }}
          className="fixed right-4 z-[120] bottom-[calc(4rem+12px+env(safe-area-inset-bottom,0px))] md:bottom-6 w-12 h-12 rounded-full bg-zinc-900/90 backdrop-blur border border-white/15 text-white text-lg font-black shadow-[0_10px_28px_-8px_rgba(0,0,0,0.7)] hover:bg-zinc-800 hover:border-amber-400/50 active:scale-95 transition flex items-center justify-center"
        >
          <span aria-hidden>▲</span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
