"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import type { Card, SetInfo } from "@/lib/types";
import { drawBox } from "@/lib/pack-draw";
import { recordPackPull } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import PackOpeningStage from "./PackOpeningStage";

type Phase = "sealed" | "opening" | "grid" | "opening-pack";

export default function SetView({ set }: { set: SetInfo }) {
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>("sealed");
  const [packs, setPacks] = useState<Card[][]>([]);
  const [openedMask, setOpenedMask] = useState<boolean[]>([]);
  const [activePack, setActivePack] = useState<number | null>(null);

  const openBox = useCallback(() => {
    setPhase("opening");
    const drawn = drawBox(set);
    setPacks(drawn);
    setOpenedMask(new Array(drawn.length).fill(false));
    setTimeout(() => setPhase("grid"), 1100);
  }, [set]);

  const choosePack = useCallback(
    (index: number) => {
      if (openedMask[index]) return;
      setActivePack(index);
      setPhase("opening-pack");
      if (user) {
        recordPackPull(
          user.id,
          set.code,
          packs[index].map((c) => c.id)
        ).catch((e) => console.error("recordPackPull failed", e));
      }
      setOpenedMask((prev) => {
        const next = [...prev];
        next[index] = true;
        return next;
      });
    },
    [openedMask, packs, set, user]
  );

  const backToGrid = useCallback(() => {
    setActivePack(null);
    setPhase("grid");
  }, []);

  const resetBox = useCallback(() => {
    setPhase("sealed");
    setPacks([]);
    setOpenedMask([]);
    setActivePack(null);
  }, []);

  const openedCount = useMemo(
    () => openedMask.filter(Boolean).length,
    [openedMask]
  );

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-12">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <Link href="/" className="text-xs text-zinc-400 hover:text-white">
            ← 팩 선택으로
          </Link>
          <h1 className="mt-2 text-2xl md:text-4xl font-black text-white tracking-tight">
            {set.name}
          </h1>
          <p className="text-xs md:text-sm text-zinc-400 mt-1">{set.subtitle}</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Stat label="박스당" value={`${set.packsPerBox}팩`} />
          <Stat label="팩당" value={`${set.cardsPerPack}장`} />
          <Stat
            label="개봉"
            value={`${openedCount} / ${set.packsPerBox}`}
            highlight
          />
        </div>
      </div>

      <AnimatePresence mode="wait">
        {phase === "sealed" && (
          <SealedBox key="sealed" set={set} onOpen={openBox} />
        )}
        {phase === "opening" && <BoxOpening key="opening" set={set} />}
        {(phase === "grid" || phase === "opening-pack") && (
          <motion.div
            key="grid"
            className="mt-8 md:mt-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <PackGrid
              set={set}
              openedMask={openedMask}
              onChoose={choosePack}
              disabled={phase !== "grid"}
            />
            <div className="mt-6 md:mt-8 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-zinc-400">
                팩 하나를 눌러 개봉하세요.
              </p>
              {openedCount >= set.packsPerBox && (
                <button
                  onClick={resetBox}
                  className="h-11 px-5 rounded-xl bg-white text-zinc-900 font-semibold text-sm hover:bg-zinc-100 transition"
                >
                  새 박스 열기
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {phase === "opening-pack" && activePack !== null && (
          <PackOpeningStage
            key="overlay"
            pack={packs[activePack]}
            packImage={set.packImage}
            setName={set.name}
            onClose={backToGrid}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={clsx(
        "rounded-lg px-3 py-1.5 border",
        highlight
          ? "bg-amber-400/10 border-amber-400/40 text-amber-200"
          : "bg-white/5 border-white/10 text-zinc-200"
      )}
    >
      <div className="text-[10px] uppercase tracking-wider text-zinc-400">
        {label}
      </div>
      <div className="text-sm font-bold">{value}</div>
    </div>
  );
}

function SealedBox({ set, onOpen }: { set: SetInfo; onOpen: () => void }) {
  return (
    <motion.div
      key="sealed"
      className="mt-8 md:mt-14 flex flex-col items-center gap-5 md:gap-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
    >
      <motion.div
        className="relative w-full max-w-[320px] md:max-w-[420px] aspect-[4/3]"
        whileHover={{ rotate: 1.5, y: -4 }}
        transition={{ type: "spring", stiffness: 150, damping: 16 }}
      >
        <div
          className="absolute inset-0 blur-3xl rounded-full opacity-60"
          style={{
            background: `radial-gradient(closest-side, ${set.primaryColor}88, transparent 70%)`,
          }}
        />
        <img
          src={set.boxImage}
          alt={`${set.name} 박스`}
          className="relative w-full h-full object-contain drop-shadow-2xl animate-bob"
        />
      </motion.div>
      <button
        onClick={onOpen}
        className="h-12 md:h-14 px-6 md:px-8 rounded-xl bg-gradient-to-r from-amber-400 to-rose-500 text-zinc-950 font-bold text-sm md:text-base shadow-[0_12px_40px_-10px_rgba(251,113,133,0.8)] hover:scale-[1.03] active:scale-[0.98] transition inline-flex items-center gap-2"
      >
        📦 박스 열기
      </button>
    </motion.div>
  );
}

function BoxOpening({ set }: { set: SetInfo }) {
  return (
    <motion.div
      key="opening"
      className="mt-12 md:mt-16 flex flex-col items-center gap-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="relative w-full max-w-[320px] md:max-w-[420px] aspect-[4/3]">
        <motion.img
          src={set.boxImage}
          alt={set.name}
          className="absolute inset-0 w-full h-full object-contain"
          initial={{ scale: 1, rotate: 0 }}
          animate={{ scale: [1, 1.05, 1.12], rotate: [0, -2, 2, 0] }}
          transition={{ duration: 0.9, times: [0, 0.5, 1] }}
        />
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 1, times: [0, 0.6, 1] }}
          style={{
            background: `radial-gradient(closest-side, white, transparent 60%)`,
            mixBlendMode: "screen",
          }}
        />
      </div>
      <p className="text-sm text-zinc-400">박스를 여는 중...</p>
    </motion.div>
  );
}

function PackGrid({
  set,
  openedMask,
  onChoose,
  disabled,
}: {
  set: SetInfo;
  openedMask: boolean[];
  onChoose: (i: number) => void;
  disabled: boolean;
}) {
  return (
    <motion.div
      className="grid gap-2.5 md:gap-4"
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(96px, 1fr))`,
      }}
    >
      {openedMask.map((opened, i) => (
        <motion.button
          key={i}
          type="button"
          disabled={opened || disabled}
          onClick={() => onChoose(i)}
          initial={{ opacity: 0, y: 20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: i * 0.03, type: "spring", stiffness: 220 }}
          whileHover={!opened && !disabled ? { y: -6, scale: 1.04 } : {}}
          whileTap={!opened && !disabled ? { scale: 0.95 } : {}}
          className={clsx(
            "relative rounded-xl overflow-hidden border transition-all",
            opened
              ? "opacity-30 grayscale cursor-not-allowed border-white/5"
              : "border-white/10 hover:border-white/30 cursor-pointer"
          )}
        >
          <div className="relative aspect-[2/3]">
            <img
              src={set.packImage}
              alt={`${set.name} 팩 ${i + 1}`}
              className="w-full h-full object-contain bg-zinc-900"
            />
            {!opened && <div className="pack-shine absolute inset-0" />}
          </div>
          <div className="absolute top-1 left-1 text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white">
            #{String(i + 1).padStart(2, "0")}
          </div>
          {opened && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[10px] md:text-xs px-2 py-0.5 rounded bg-emerald-600 text-white font-semibold">
                개봉 완료
              </span>
            </div>
          )}
        </motion.button>
      ))}
    </motion.div>
  );
}
