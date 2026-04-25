"use client";

import { motion, useReducedMotion } from "framer-motion";
import SetCard from "@/components/SetCard";
import { SET_ORDER, SETS } from "@/lib/sets";

export default function HomeView() {
  const reduce = useReducedMotion();

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 md:py-10 fade-in">
      <section className="text-center max-w-3xl mx-auto">
        <motion.div
          className="flex items-center justify-center gap-2 flex-wrap mb-2"
          initial={reduce ? false : { opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: "easeOut" }}
        >
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-white/5 border border-white/10 text-zinc-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_2px_rgba(52,211,153,0.8)]" />
            포켓몬 TCG 시뮬레이터
          </span>
        </motion.div>
        <motion.h1
          className="mt-2 text-xl sm:text-2xl md:text-4xl font-black tracking-tight text-white leading-[1.2]"
          initial={reduce ? false : { opacity: 0, y: 8, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.4, ease: "easeOut", delay: 0.05 }}
        >
          <span className="text-amber-400">까고</span>,{" "}
          <span className="text-fuchsia-300">감별</span>하고,{" "}
          <br className="hidden md:block" />
          <span className="text-cyan-300">전시</span>하고,{" "}
          <span className="text-rose-400">싸우자</span>
        </motion.h1>
      </section>

      <section className="mt-10 md:mt-14">
        <motion.h2
          className="text-base md:text-xl font-bold text-white mb-4 md:mb-5"
          initial={reduce ? false : { opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, ease: "easeOut", delay: 0.12 }}
        >
          팩 선택
        </motion.h2>
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6"
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: {
              transition: { staggerChildren: reduce ? 0 : 0.07, delayChildren: 0.15 },
            },
          }}
        >
          {SET_ORDER.map((code) => (
            <motion.div
              key={code}
              variants={{
                hidden: reduce
                  ? { opacity: 1, y: 0 }
                  : { opacity: 0, y: 14, scale: 0.98 },
                show: {
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  transition: { duration: 0.35, ease: [0.2, 0.8, 0.2, 1] },
                },
              }}
            >
              <SetCard set={SETS[code]} />
            </motion.div>
          ))}
        </motion.div>
      </section>

      <footer className="mt-10 text-center text-[11px] text-zinc-500 py-5 px-4">
        © {new Date().getFullYear()} Pokémon TCG Sim · 카드 이미지 저작권은
        The Pokémon Company / 포켓몬 코리아에 있습니다.
      </footer>
    </div>
  );
}
