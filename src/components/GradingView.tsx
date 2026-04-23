"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { useAuth } from "@/lib/auth";
import {
  fetchWallet,
  submitPsaGrading,
  type WalletSnapshot,
} from "@/lib/db";
import { RARITY_STYLE, compareRarity } from "@/lib/rarity";
import { PSA_DISTRIBUTION, PSA_LABEL, psaTone } from "@/lib/psa";
import type { Card } from "@/lib/types";
import RarityBadge from "./RarityBadge";
import PsaSlab from "./PsaSlab";

type Phase = "idle" | "animating" | "revealed";

export default function GradingView() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<Card | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [grade, setGrade] = useState<number | null>(null);
  const [gauge, setGauge] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const refreshWallet = useCallback(async () => {
    if (!user) return;
    const w = await fetchWallet(user.id);
    setWallet(w);
  }, [user]);

  useEffect(() => {
    refreshWallet();
  }, [refreshWallet]);

  // Gauge animation driven by the known target grade.
  useEffect(() => {
    if (phase !== "animating" || grade === null) return;
    const target = grade * 10; // 1-10 → 10-100%
    const steps: Array<{ v: number; t: number }> = [
      { v: 0, t: 0 },
      { v: Math.min(60, target + 20), t: 380 },
      { v: Math.max(15, target - 18), t: 760 },
      { v: Math.min(85, target + 12), t: 1180 },
      { v: Math.max(28, target - 10), t: 1600 },
      { v: Math.min(96, target + 6), t: 2060 },
      { v: target, t: 2560 },
    ];
    const timers = steps.map((s) =>
      setTimeout(() => setGauge(s.v), s.t)
    );
    const done = setTimeout(() => setPhase("revealed"), 3300);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(done);
    };
  }, [phase, grade]);

  const submit = useCallback(async () => {
    if (!user || !selected || phase !== "idle") return;
    setError(null);
    const res = await submitPsaGrading(user.id, selected.id);
    if (!res.ok || typeof res.grade !== "number") {
      setError(res.error ?? "등급 감별에 실패했어요.");
      return;
    }
    setGrade(res.grade);
    setPhase("animating");
  }, [user, selected, phase]);

  const reset = useCallback(async () => {
    setSelected(null);
    setGrade(null);
    setGauge(0);
    setPhase("idle");
    await refreshWallet();
  }, [refreshWallet]);

  const tone = grade ? psaTone(grade) : null;

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-10 fade-in">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-4xl font-black text-white tracking-tight">
            PSA 등급 감별
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            보유 카드를 감별사에게 맡기고 1~10 등급을 받아보세요. 제출한 카드는
            감별사가 평가한 뒤 슬랩에 봉인되어 <Link className="underline text-white" href="/wallet">카드지갑</Link>의
            감별 탭에 저장됩니다.
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-[1fr_1.1fr] gap-4 md:gap-6 items-stretch">
        {/* Grader column */}
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-fuchsia-500/10 via-indigo-500/5 to-transparent p-5 md:p-6 flex flex-col items-center md:items-start gap-4">
          <div className="relative w-40 h-40 md:w-48 md:h-48 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-gradient-to-b from-fuchsia-400/30 to-transparent blur-2xl" />
            {/* Psychic "scan" beam while animating */}
            <AnimatePresence>
              {phase === "animating" && (
                <motion.div
                  aria-hidden
                  className="absolute inset-0 pointer-events-none"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {Array.from({ length: 8 }).map((_, i) => (
                    <span
                      key={i}
                      className="absolute left-1/2 top-1/2 block w-[220px] h-[2px] -translate-x-1/2 origin-left bg-gradient-to-r from-fuchsia-400/0 via-fuchsia-300/80 to-fuchsia-400/0"
                      style={{
                        transform: `rotate(${i * 45}deg) translateX(0)`,
                        animation: `beam-pulse 1.1s ease-in-out ${i * 0.08}s infinite`,
                      }}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
            <motion.img
              src="/images/common/grader-alakazam.png"
              alt="PSA 감별사 후딘"
              className={clsx(
                "relative w-full h-full object-contain drop-shadow-2xl",
                phase === "idle" && "animate-bob",
                phase === "animating" && "animate-wiggle"
              )}
              draggable={false}
            />
          </div>
          <div className="speech-bubble relative w-full rounded-2xl bg-zinc-900/95 border border-white/10 p-4 text-sm leading-relaxed">
            {phase === "animating" ? (
              <p className="text-zinc-200">
                사이코파워로 카드 상태를 측정 중...
              </p>
            ) : phase === "revealed" && grade !== null ? (
              <p className={clsx("font-semibold", tone?.text)}>
                PSA {grade} ({PSA_LABEL[grade]}) 판정! 수고했군.
              </p>
            ) : selected ? (
              <p className="text-zinc-200">
                <span className="font-semibold text-white">{selected.name}</span>
                의 상태를 감정하겠네. 준비됐나?
              </p>
            ) : (
              <p className="text-zinc-300">
                카드를 한 장 골라오게. 내가 PSA 등급을 매겨주지.
              </p>
            )}
          </div>

          <OddsTable />
        </section>

        {/* Card + gauge column */}
        <section className="relative rounded-3xl border border-white/10 bg-zinc-900/60 p-5 md:p-6 flex flex-col">
          <div className="flex-1 min-h-[320px] md:min-h-[420px] flex items-center justify-center">
            {phase === "revealed" && selected && grade !== null ? (
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 180, damping: 18 }}
              >
                <PsaSlab card={selected} grade={grade} size="lg" highlight />
              </motion.div>
            ) : selected ? (
              <CardPreview card={selected} scanning={phase === "animating"} />
            ) : (
              <EmptySlot onPick={() => setPicking(true)} />
            )}
          </div>

          {(phase === "animating" || phase === "revealed") && grade !== null && (
            <Gauge value={gauge} grade={grade} phase={phase} />
          )}

          {error && (
            <p className="mt-3 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2 md:gap-3">
            {phase === "idle" && (
              <>
                <button
                  onClick={() => setPicking(true)}
                  className="h-12 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white font-semibold text-sm"
                >
                  {selected ? "다른 카드 선택" : "카드 선택"}
                </button>
                <button
                  onClick={submit}
                  disabled={!selected}
                  className={clsx(
                    "h-12 rounded-xl font-bold text-sm transition",
                    selected
                      ? "bg-gradient-to-r from-fuchsia-500 to-indigo-500 text-white hover:scale-[1.02] active:scale-[0.98] shadow-[0_10px_30px_-10px_rgba(168,85,247,0.6)]"
                      : "bg-white/5 text-zinc-500 cursor-not-allowed"
                  )}
                >
                  PSA 등급 맡기기
                </button>
              </>
            )}
            {phase === "animating" && (
              <button
                disabled
                className="col-span-2 h-12 rounded-xl bg-white/5 text-zinc-400 text-sm font-semibold"
              >
                감정 중...
              </button>
            )}
            {phase === "revealed" && (
              <>
                <button
                  onClick={reset}
                  className="h-12 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white font-semibold text-sm"
                >
                  다시 맡기기
                </button>
                <Link
                  href="/wallet?tab=psa"
                  className="h-12 rounded-xl bg-gradient-to-r from-fuchsia-500 to-indigo-500 text-white font-bold text-sm hover:scale-[1.02] active:scale-[0.98] transition inline-flex items-center justify-center"
                >
                  감별 탭 보기
                </Link>
              </>
            )}
          </div>
        </section>
      </div>

      <AnimatePresence>
        {picking && wallet && (
          <CardPicker
            wallet={wallet}
            onPick={(c) => {
              setSelected(c);
              setPicking(false);
            }}
            onClose={() => setPicking(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─────────────── sub-components ─────────────── */

function EmptySlot({ onPick }: { onPick: () => void }) {
  return (
    <button
      onClick={onPick}
      className="relative w-[180px] md:w-[220px] aspect-[5/7] rounded-2xl border-2 border-dashed border-white/20 bg-white/5 text-zinc-400 hover:text-white hover:border-white/40 transition flex flex-col items-center justify-center gap-2"
    >
      <span className="text-4xl">＋</span>
      <span className="text-xs font-semibold">카드 선택하기</span>
    </button>
  );
}

function CardPreview({ card, scanning }: { card: Card; scanning: boolean }) {
  const style = RARITY_STYLE[card.rarity];
  return (
    <div
      className={clsx(
        "relative w-[200px] md:w-[240px] aspect-[5/7] rounded-2xl overflow-hidden isolate ring-2 bg-zinc-900",
        style.frame,
        style.glow
      )}
    >
      {card.imageUrl ? (
        <img
          src={card.imageUrl}
          alt={card.name}
          className="w-full h-full object-contain bg-zinc-900 select-none pointer-events-none"
          draggable={false}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-700 to-amber-600 text-white p-4 text-center">
          {card.name}
        </div>
      )}
      {scanning && (
        <div
          aria-hidden
          className="absolute left-0 right-0 h-6 pointer-events-none"
          style={{
            top: 0,
            background:
              "linear-gradient(180deg, rgba(216,180,254,0) 0%, rgba(168,85,247,0.8) 50%, rgba(216,180,254,0) 100%)",
            animation: "scan-line 1.2s linear infinite",
          }}
        />
      )}
      {!scanning && (
        <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
          <div className="flex items-center justify-between text-[11px]">
            <RarityBadge rarity={card.rarity} size="xs" />
            <span className="text-white/80">{card.number}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Gauge({
  value,
  grade,
  phase,
}: {
  value: number;
  grade: number;
  phase: Phase;
}) {
  const tone = psaTone(grade);
  return (
    <div className="mt-4 pt-4 border-t border-white/5">
      <div className="flex items-end justify-between mb-2">
        <span className="text-[11px] uppercase tracking-wider text-zinc-400">
          감정 게이지
        </span>
        <span
          className={clsx(
            "text-xl md:text-2xl font-black tabular-nums",
            phase === "revealed" ? tone.text : "text-white"
          )}
        >
          {phase === "revealed" ? `PSA ${grade}` : `${Math.round(value)}%`}
        </span>
      </div>
      <div className="relative h-3 rounded-full bg-white/5 overflow-hidden ring-1 ring-white/10">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-rose-500 via-amber-400 via-emerald-400 to-amber-300 transition-[width] duration-[420ms] ease-[cubic-bezier(0.3,0.8,0.25,1)]"
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
        {/* tick marks */}
        {Array.from({ length: 9 }).map((_, i) => (
          <span
            key={i}
            className="absolute top-0 bottom-0 w-px bg-black/40"
            style={{ left: `${(i + 1) * 10}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-zinc-500 tabular-nums">
        <span>1</span>
        <span>5</span>
        <span className="text-amber-300 font-bold">10</span>
      </div>
    </div>
  );
}

function OddsTable() {
  return (
    <details className="w-full text-xs">
      <summary className="cursor-pointer text-zinc-400 hover:text-zinc-200 select-none">
        등급 확률 보기
      </summary>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-zinc-300 font-mono">
        {PSA_DISTRIBUTION.map((d) => (
          <li key={d.grade} className="flex items-center justify-between">
            <span className={clsx("font-bold", psaTone(d.grade).text)}>
              PSA {d.grade}
            </span>
            <span className="text-zinc-400">{d.pct}%</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function CardPicker({
  wallet,
  onPick,
  onClose,
}: {
  wallet: WalletSnapshot;
  onPick: (c: Card) => void;
  onClose: () => void;
}) {
  const items = useMemo(() => {
    return [...wallet.items].sort((a, b) =>
      compareRarity(a.card.rarity, b.card.rarity)
    );
  }, [wallet]);

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md p-3 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="relative w-full max-w-2xl max-h-[calc(100dvh-1.5rem)] bg-zinc-950 border border-white/10 rounded-2xl flex flex-col"
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.94, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between h-12 px-4 border-b border-white/10 shrink-0">
          <h3 className="text-sm font-bold text-white">감별 받을 카드 선택</h3>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-3 md:p-4">
          {items.length === 0 ? (
            <p className="py-10 text-center text-sm text-zinc-400">
              감별할 카드가 없어요. 먼저 팩을 열어보세요.
            </p>
          ) : (
            <div
              className="grid gap-3 md:gap-4"
              style={{
                gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
              }}
            >
              {items.map(({ card, count }) => (
                <button
                  key={card.id}
                  onClick={() => onPick(card)}
                  className="relative flex flex-col items-center gap-1.5 p-1.5 rounded-xl hover:bg-white/5 transition text-left"
                >
                  <div
                    className={clsx(
                      "relative w-full aspect-[5/7] rounded-lg overflow-hidden ring-2 bg-zinc-900",
                      RARITY_STYLE[card.rarity].frame
                    )}
                  >
                    {card.imageUrl ? (
                      <img
                        src={card.imageUrl}
                        alt={card.name}
                        loading="lazy"
                        draggable={false}
                        className="w-full h-full object-contain bg-zinc-900 pointer-events-none"
                      />
                    ) : null}
                    {count > 1 && (
                      <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] font-bold">
                        ×{count}
                      </span>
                    )}
                  </div>
                  <div className="w-full">
                    <RarityBadge rarity={card.rarity} size="xs" />
                    <p className="mt-1 text-[11px] text-zinc-300 leading-tight line-clamp-2">
                      {card.name}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
