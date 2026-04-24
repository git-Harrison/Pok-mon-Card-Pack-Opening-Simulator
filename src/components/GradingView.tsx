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
import {
  PSA_DISTRIBUTION,
  PSA_ELIGIBLE_RARITIES,
  PSA_LABEL,
  isPsaEligible,
  psaTone,
} from "@/lib/psa";
import { notifyPsaFail, notifyPsaGrade } from "@/lib/discord";
import type { Card } from "@/lib/types";
import RarityBadge from "./RarityBadge";
import PsaSlab from "./PsaSlab";
import CoinIcon from "./CoinIcon";
import Portal from "./Portal";

type Phase = "idle" | "animating" | "failing" | "revealed" | "failed";

export default function GradingView() {
  const { user, setPoints } = useAuth();
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<Card | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [grade, setGrade] = useState<number | null>(null);
  const [gauge, setGauge] = useState(0);
  const [bonus, setBonus] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [caseId] = useState(() => generateCaseId());

  const refreshWallet = useCallback(async () => {
    if (!user) return;
    const w = await fetchWallet(user.id);
    setWallet(w);
  }, [user]);

  useEffect(() => {
    refreshWallet();
  }, [refreshWallet]);

  useEffect(() => {
    if (phase !== "animating") return;
    const target = grade !== null ? grade * 10 : 8;
    const steps: Array<{ v: number; t: number }> = [
      { v: 0, t: 0 },
      { v: Math.min(60, target + 20), t: 380 },
      { v: Math.max(15, target - 18), t: 760 },
      { v: Math.min(85, target + 12), t: 1180 },
      { v: Math.max(28, target - 10), t: 1600 },
      { v: Math.min(96, target + 6), t: 2060 },
      { v: target, t: 2560 },
    ];
    const timers = steps.map((s) => setTimeout(() => setGauge(s.v), s.t));
    const done = setTimeout(
      () => setPhase(grade === null ? "failing" : "revealed"),
      3300
    );
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(done);
    };
  }, [phase, grade]);

  // "failing" phase plays the shatter animation for ~1.8s before collapsing
  // to the 💔 end state.
  useEffect(() => {
    if (phase !== "failing") return;
    const t = setTimeout(() => setPhase("failed"), 1800);
    return () => clearTimeout(t);
  }, [phase]);

  const submit = useCallback(async () => {
    if (!user || !selected || phase !== "idle") return;
    if (!isPsaEligible(selected.rarity)) {
      setError("SR · MA · SAR · MUR · UR 카드만 감별을 받을 수 있어요.");
      return;
    }
    setError(null);
    const res = await submitPsaGrading(user.id, selected.id);
    if (!res.ok) {
      setError(res.error ?? "감별 접수에 실패했어요.");
      return;
    }
    if (res.failed) {
      setGrade(null);
      setGauge(0);
      setPhase("animating");
      notifyPsaFail(user.display_name, selected.id);
      return;
    }
    if (typeof res.grade !== "number") {
      setError("감별 결과가 이상해요.");
      return;
    }
    setGrade(res.grade);
    setBonus(res.bonus ?? 0);
    if (typeof res.points === "number") setPoints(res.points);
    setPhase("animating");
    notifyPsaGrade(user.display_name, selected.id, res.grade);
  }, [user, selected, phase, setPoints]);

  const reset = useCallback(async () => {
    setSelected(null);
    setGrade(null);
    setGauge(0);
    setBonus(null);
    setPhase("idle");
    await refreshWallet();
  }, [refreshWallet]);

  const tone = grade ? psaTone(grade) : null;

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-4 md:py-8 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl md:text-3xl font-black tracking-tight">
            <span className="bg-gradient-to-r from-fuchsia-300 via-violet-200 to-indigo-300 bg-clip-text text-transparent">
              PCL 감정실
            </span>
          </h1>
          <p className="text-[10px] md:text-xs text-zinc-500 tracking-[0.2em] uppercase">
            Card Authentication Lab
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
            접수 번호
          </div>
          <div className="text-xs font-mono text-fuchsia-200">{caseId}</div>
        </div>
      </div>

      {/* Lab stage */}
      <section
        className="relative mt-4 rounded-2xl border overflow-hidden"
        style={{
          borderColor: "rgba(168, 85, 247, 0.35)",
          background:
            "linear-gradient(180deg, #16102a 0%, #0a0615 100%)",
        }}
      >
        {/* Ambient glow */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(closest-side at 50% 30%, rgba(168,85,247,0.25), rgba(168,85,247,0) 65%)",
          }}
        />
        {/* Grid overlay */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.05] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(168,85,247,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(168,85,247,0.6) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />

        {/* Examiner strip */}
        <div className="relative px-4 pt-3 flex items-center gap-3">
          <div className="relative w-10 h-10 md:w-12 md:h-12 shrink-0">
            <div className="absolute inset-0 rounded-full bg-fuchsia-400/30 blur-md" />
            <motion.img
              src="/images/common/grader-alakazam.png"
              alt="감정사"
              className={clsx(
                "relative w-full h-full object-contain",
                phase === "idle" && "animate-bob",
                phase === "animating" && "animate-wiggle"
              )}
              draggable={false}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.2em] text-fuchsia-300/80">
              감정사
            </div>
            <div className="text-sm font-bold text-white">후딘 박사</div>
            <div className="text-[10px] text-zinc-400">
              {phase === "animating"
                ? "측정 중 — 잠시 기다려 주세요"
                : phase === "failing"
                ? "카드 균열 감지 — 붕괴 중"
                : phase === "revealed"
                ? "판정 완료"
                : phase === "failed"
                ? "감정 실패 — 카드 손상"
                : selected
                ? "감정 준비 완료"
                : "감정 대기 중"}
            </div>
          </div>
          <StatusDot phase={phase} />
        </div>

        {/* Pedestal */}
        <div className="relative px-4 py-6 flex justify-center">
          <Pedestal
            selected={selected}
            grade={grade}
            phase={phase}
            onPick={() => setPicking(true)}
          />
        </div>

        {/* Instrumentation */}
        {(phase === "animating" || phase === "revealed") &&
          grade !== null && (
            <div className="px-4 pb-3">
              <Gauge value={gauge} grade={grade} phase={phase} />
            </div>
          )}
        {(phase === "failing" || phase === "failed") && (
          <div className="px-4 pb-3">
            <FailBar />
          </div>
        )}

        {/* Result card (certificate) */}
        {phase === "revealed" && grade !== null && selected && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative mx-4 mb-4 rounded-xl border border-white/10 bg-black/40 p-3 text-[11px]"
          >
            <div className="flex items-center justify-between">
              <div className="text-[9px] uppercase tracking-[0.2em] text-fuchsia-300/80">
                감정 결과서
              </div>
              <div className="text-[9px] font-mono text-zinc-400">{caseId}</div>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-bold text-white truncate">
                  {selected.name}
                </div>
                <div className="text-[10px] text-zinc-400 truncate">
                  판정 등급:{" "}
                  <span className={clsx("font-bold", tone?.text)}>
                    PCL {grade} · {PSA_LABEL[grade]}
                  </span>
                </div>
              </div>
              {bonus && bonus > 0 && (
                <div className="shrink-0 inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 text-amber-200 px-2 py-0.5 font-bold">
                  <CoinIcon size="xs" />+
                  {bonus.toLocaleString("ko-KR")}p
                </div>
              )}
            </div>
          </motion.div>
        )}

        {error && (
          <div className="mx-4 mb-3 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="relative px-4 pb-4 grid grid-cols-2 gap-2">
          {phase === "idle" && (
            <>
              <button
                onClick={() => setPicking(true)}
                style={{ touchAction: "manipulation" }}
                className="h-12 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold text-sm"
              >
                {selected ? "다른 카드" : "카드 선택"}
              </button>
              <button
                onClick={submit}
                disabled={!selected}
                style={{ touchAction: "manipulation" }}
                className={clsx(
                  "h-12 rounded-xl font-bold text-sm transition",
                  selected
                    ? "bg-gradient-to-r from-fuchsia-500 to-indigo-500 text-white hover:scale-[1.02] active:scale-[0.98] shadow-[0_10px_30px_-10px_rgba(168,85,247,0.6)]"
                    : "bg-white/5 text-zinc-500 cursor-not-allowed"
                )}
              >
                감정 의뢰 접수
              </button>
            </>
          )}
          {phase === "animating" && (
            <button
              disabled
              className="col-span-2 h-12 rounded-xl bg-fuchsia-500/10 border border-fuchsia-400/40 text-fuchsia-200 text-sm font-semibold"
            >
              감정 중...
            </button>
          )}
          {phase === "failing" && (
            <button
              disabled
              className="col-span-2 h-12 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-200 text-sm font-semibold animate-pulse"
            >
              카드가 부서지고 있습니다...
            </button>
          )}
          {phase === "failed" && (
            <button
              onClick={reset}
              style={{ touchAction: "manipulation" }}
              className="col-span-2 h-12 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-200 font-semibold text-sm"
            >
              다른 카드로 다시 시도
            </button>
          )}
          {phase === "revealed" && (
            <>
              <button
                onClick={reset}
                style={{ touchAction: "manipulation" }}
                className="h-12 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white font-semibold text-sm"
              >
                다시 맡기기
              </button>
              <Link
                href="/wallet?tab=psa"
                className="h-12 rounded-xl bg-gradient-to-r from-fuchsia-500 to-indigo-500 text-white font-bold text-sm hover:scale-[1.02] active:scale-[0.98] transition inline-flex items-center justify-center"
              >
                슬랩 보관함 →
              </Link>
            </>
          )}
        </div>
      </section>

      {/* Odds strip */}
      <div className="mt-3 rounded-xl bg-white/5 border border-white/10 p-3">
        <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-400 mb-2">
          판정 확률 (보상)
        </p>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-1.5 text-[11px]">
          <div className="flex items-center justify-between rounded-md bg-rose-500/10 border border-rose-500/30 px-2 py-1">
            <span className="font-bold text-rose-200">실패</span>
            <span className="text-rose-300 tabular-nums font-semibold">70%</span>
          </div>
          {PSA_DISTRIBUTION.map((d) => (
            <div
              key={d.grade}
              className="flex items-center justify-between rounded-md bg-black/30 border border-white/5 px-2 py-1"
            >
              <span className={clsx("font-bold", psaTone(d.grade).text)}>
                PCL {d.grade}
              </span>
              <span className="text-zinc-300 tabular-nums font-semibold">
                {d.pct}%
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-zinc-500 text-center">
          감정 대상 등급:{" "}
          {PSA_ELIGIBLE_RARITIES.map((r) => (
            <span key={r} className="mx-0.5 font-bold text-zinc-300">
              {r}
            </span>
          ))}
          · 실패 시 카드 소실
        </p>
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

function StatusDot({ phase }: { phase: Phase }) {
  const tone =
    phase === "revealed"
      ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]"
      : phase === "failed"
      ? "bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.8)]"
      : phase === "animating"
      ? "bg-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.9)] animate-pulse"
      : "bg-fuchsia-400 shadow-[0_0_10px_rgba(192,132,252,0.8)]";
  return <span className={clsx("w-2 h-2 rounded-full shrink-0", tone)} />;
}

function Pedestal({
  selected,
  grade,
  phase,
  onPick,
}: {
  selected: Card | null;
  grade: number | null;
  phase: Phase;
  onPick: () => void;
}) {
  return (
    <div className="relative w-full flex justify-center" style={{ minHeight: 260 }}>
      {/* Orbital rings during animation */}
      {phase === "animating" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {Array.from({ length: 3 }).map((_, i) => (
            <span
              key={i}
              className="absolute rounded-full border"
              style={{
                borderColor: "rgba(192, 132, 252, 0.6)",
                width: `${180 + i * 40}px`,
                height: `${180 + i * 40}px`,
                animation: `ring-spin ${4 + i * 1.5}s linear infinite`,
              }}
            />
          ))}
        </div>
      )}

      {/* The card. Order matters: the "failed" end-state must win over
          the default `selected` fallback, otherwise the card reappears
          after the shatter animation finishes (we never clear `selected`
          until the user taps 다시 맡기기). */}
      {phase === "revealed" && grade !== null && selected ? (
        <motion.div
          initial={{ scale: 0.6, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 180, damping: 18 }}
          className="relative z-10"
        >
          <PsaSlab card={selected} grade={grade} size="md" highlight />
        </motion.div>
      ) : phase === "failing" && selected ? (
        <ShatteringCard card={selected} />
      ) : phase === "failed" ? (
        <div className="text-center py-6">
          <p className="text-5xl mb-2 opacity-60">💔</p>
          <p className="text-xs text-rose-300">카드가 손상되었습니다</p>
        </div>
      ) : selected ? (
        <CardOnPedestal card={selected} scanning={phase === "animating"} />
      ) : (
        <EmptyPedestal onPick={onPick} />
      )}
    </div>
  );
}

/**
 * Shatter animation played during the `failing` phase. The card shakes,
 * cracks appear, fragments fly outward, and the whole thing fades to
 * nothing — then the parent swaps to the 💔 end card.
 */
function ShatteringCard({ card }: { card: Card }) {
  const style = RARITY_STYLE[card.rarity];
  // 6 fragments radiating outward; angles are chosen to feel irregular.
  const shards = [
    { dx: -70, dy: -40, rot: -25 },
    { dx: 60, dy: -60, rot: 18 },
    { dx: -80, dy: 40, rot: 30 },
    { dx: 80, dy: 50, rot: -18 },
    { dx: -20, dy: -80, rot: -10 },
    { dx: 20, dy: 80, rot: 12 },
  ];
  return (
    <div className="relative flex flex-col items-center gap-3">
      <motion.div
        initial={{ x: 0, rotate: 0, scale: 1 }}
        animate={{
          x: [0, -4, 4, -6, 6, -3, 3, 0],
          rotate: [0, -1, 1.5, -2, 2, -0.5, 0],
          scale: [1, 1.02, 1.04, 1.06, 1.08, 1.1],
          filter: [
            "brightness(1) blur(0px)",
            "brightness(1.1) blur(0px)",
            "brightness(1.25) blur(1px)",
            "brightness(1.45) blur(2px) hue-rotate(-10deg)",
          ],
        }}
        transition={{ duration: 1.1, times: [0, 0.2, 0.4, 0.55, 0.7, 0.85, 0.95, 1], ease: "easeIn" }}
        className={clsx(
          "relative w-[170px] md:w-[200px] aspect-[5/7] rounded-2xl overflow-hidden isolate ring-2 bg-zinc-900",
          style.frame
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
        {/* Growing cracks */}
        <svg
          aria-hidden
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 100 140"
          preserveAspectRatio="none"
        >
          <motion.path
            d="M20,10 L45,40 L30,65 L55,90 L35,115 L65,130"
            stroke="rgba(255,255,255,0.85)"
            strokeWidth="0.9"
            fill="none"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.95 }}
            transition={{ duration: 0.9, delay: 0.25 }}
          />
          <motion.path
            d="M80,20 L60,45 L75,75 L50,95 L70,125"
            stroke="rgba(255,255,255,0.75)"
            strokeWidth="0.7"
            fill="none"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.9 }}
            transition={{ duration: 0.8, delay: 0.45 }}
          />
        </svg>
      </motion.div>

      {/* Flying fragments (appear near the end, fly outward) */}
      <div className="absolute inset-0 pointer-events-none">
        {shards.map((s, i) => (
          <motion.span
            key={i}
            className="absolute left-1/2 top-1/2 w-5 h-7 rounded-sm bg-rose-400/70"
            style={{ boxShadow: "0 0 12px rgba(244,63,94,0.6)" }}
            initial={{ x: 0, y: 0, opacity: 0, rotate: 0, scale: 0.6 }}
            animate={{
              x: s.dx * 2.5,
              y: s.dy * 2.5,
              opacity: [0, 1, 1, 0],
              rotate: s.rot * 4,
              scale: [0.6, 1, 0.8, 0.4],
            }}
            transition={{
              duration: 1.1,
              delay: 0.7 + i * 0.04,
              ease: [0.2, 0.7, 0.6, 1],
            }}
          />
        ))}
      </div>

      {/* Red flash */}
      <motion.div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 0.35, 0] }}
        transition={{ duration: 1.2, times: [0, 0.55, 0.7, 1] }}
        style={{
          background:
            "radial-gradient(closest-side, rgba(244,63,94,0.9), rgba(244,63,94,0) 70%)",
        }}
      />

      {/* Platform shadow */}
      <div
        className="w-[160px] h-4 rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(244,63,94,0.45), rgba(244,63,94,0) 70%)",
        }}
      />
    </div>
  );
}

function CardOnPedestal({
  card,
  scanning,
}: {
  card: Card;
  scanning: boolean;
}) {
  const style = RARITY_STYLE[card.rarity];
  return (
    <div className="relative flex flex-col items-center gap-3">
      <motion.div
        animate={scanning ? { y: [-2, -8, -2] } : { y: 0 }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        className={clsx(
          "relative w-[170px] md:w-[200px] aspect-[5/7] rounded-2xl overflow-hidden isolate ring-2 bg-zinc-900",
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
            className="absolute left-0 right-0 h-8 pointer-events-none"
            style={{
              top: 0,
              background:
                "linear-gradient(180deg, rgba(216,180,254,0) 0%, rgba(168,85,247,0.85) 50%, rgba(216,180,254,0) 100%)",
              animation: "scan-line 1.2s linear infinite",
            }}
          />
        )}
        {!scanning && (
          <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent">
            <div className="flex items-center justify-between text-[11px]">
              <RarityBadge rarity={card.rarity} size="xs" />
              <span className="text-white/80">#{card.number}</span>
            </div>
          </div>
        )}
      </motion.div>
      {/* Platform shadow */}
      <div
        className="w-[160px] h-4 rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(168,85,247,0.5), rgba(168,85,247,0) 70%)",
        }}
      />
    </div>
  );
}

function EmptyPedestal({ onPick }: { onPick: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={onPick}
        style={{ touchAction: "manipulation" }}
        className="relative w-[160px] md:w-[180px] aspect-[5/7] rounded-2xl border-2 border-dashed border-fuchsia-400/40 bg-fuchsia-500/5 text-fuchsia-200 hover:text-white hover:border-fuchsia-300/60 transition flex flex-col items-center justify-center gap-2"
      >
        <span className="text-3xl">＋</span>
        <span className="text-xs font-semibold">감정 대상 카드 놓기</span>
      </button>
      <div
        className="w-[140px] h-4 rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(168,85,247,0.4), rgba(168,85,247,0) 70%)",
        }}
      />
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
    <div className="rounded-lg bg-black/30 border border-fuchsia-400/20 p-2.5">
      <div className="flex items-end justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-[0.2em] text-fuchsia-300/80">
          상태 분석 게이지
        </span>
        <span
          className={clsx(
            "text-base md:text-xl font-black tabular-nums",
            phase === "revealed" ? tone.text : "text-white"
          )}
        >
          {phase === "revealed" ? `PCL ${grade}` : `${Math.round(value)}%`}
        </span>
      </div>
      <div className="relative h-2.5 rounded-full bg-white/5 overflow-hidden ring-1 ring-white/10">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-rose-500 via-amber-400 via-emerald-400 to-amber-300 transition-[width] duration-[420ms] ease-[cubic-bezier(0.3,0.8,0.25,1)]"
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
        {Array.from({ length: 9 }).map((_, i) => (
          <span
            key={i}
            className="absolute top-0 bottom-0 w-px bg-black/40"
            style={{ left: `${(i + 1) * 10}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function FailBar() {
  return (
    <div className="rounded-lg bg-black/30 border border-rose-500/30 p-2.5">
      <div className="flex items-end justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-[0.2em] text-rose-300/80">
          감정 실패
        </span>
        <span className="text-sm font-black text-rose-300">카드 소실</span>
      </div>
      <div className="relative h-2.5 rounded-full bg-white/5 overflow-hidden ring-1 ring-rose-500/30">
        <div className="absolute inset-y-0 left-0 w-full rounded-full bg-gradient-to-r from-rose-700 to-rose-500 opacity-60" />
      </div>
    </div>
  );
}

function generateCaseId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++)
    s += chars[Math.floor(Math.random() * chars.length)];
  return `PCL-${s}`;
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
    return wallet.items
      .filter((it) => isPsaEligible(it.card.rarity))
      .sort((a, b) => compareRarity(a.card.rarity, b.card.rarity));
  }, [wallet]);

  return (
    <Portal>
      <motion.div
        className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-center justify-center overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          paddingTop: "max(env(safe-area-inset-top, 0px), 12px)",
          paddingBottom: "max(env(safe-area-inset-bottom, 0px), 12px)",
          paddingLeft: "12px",
          paddingRight: "12px",
        }}
      >
        <motion.div
          className="relative w-full max-w-2xl bg-zinc-950 border border-white/10 rounded-2xl flex flex-col overflow-hidden"
          style={{ maxHeight: "calc(100dvh - 24px)" }}
          initial={{ scale: 0.94, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.94, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between h-12 px-4 border-b border-white/10 shrink-0">
            <h3 className="text-sm font-bold text-white">감정 대상 카드 선택</h3>
            <button
              onClick={onClose}
              aria-label="닫기"
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
              style={{ touchAction: "manipulation" }}
            >
              ✕
            </button>
          </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-3 md:p-4">
          {items.length === 0 ? (
            <div className="py-10 text-center text-sm text-zinc-400">
              <p>감정 대상 카드가 없어요.</p>
              <p className="mt-1 text-[11px]">
                SR · MA · SAR · MUR · UR 카드만 맡길 수 있습니다.
              </p>
            </div>
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
                  style={{ touchAction: "manipulation" }}
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
    </Portal>
  );
}
