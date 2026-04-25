"use client";

import PokeLoader, { LoadingText } from "./PokeLoader";
import Link from "next/link";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { useAuth } from "@/lib/auth";
import {
  bulkSubmitPsaGrading,
  fetchWallet,
  submitPsaGrading,
  type BulkGradingResult,
  type WalletSnapshot,
} from "@/lib/db";
import { getCard } from "@/lib/sets";
import { RARITY_STYLE, compareRarity } from "@/lib/rarity";
import {
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
import NpcDialog, { type NpcMood } from "./NpcDialog";

type Phase = "idle" | "animating" | "failing" | "revealed" | "failed";

export default function GradingView() {
  const { user, setPoints } = useAuth();
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [selected, setSelected] = useState<Card | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [grade, setGrade] = useState<number | null>(null);
  const [gauge, setGauge] = useState(0);
  const [bonus, setBonus] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [caseId] = useState(() => generateCaseId());
  const [revealKey, setRevealKey] = useState(0);

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
    const done = setTimeout(() => {
      if (grade === null) {
        setPhase("failing");
      } else {
        setRevealKey((k) => k + 1);
        setPhase("revealed");
      }
    }, 3300);
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
      setError("감별 가능한 카드가 아니에요.");
      return;
    }
    setError(null);
    const res = await submitPsaGrading(user.id, selected.id, selected.rarity);
    // Server has already decremented (success) or burned (failure)
    // the card — refresh the local wallet immediately so the picker
    // reflects reality before the user reopens it.
    if (res.ok) void refreshWallet();
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
    <div className="max-w-2xl mx-auto px-3 md:px-6 py-3 md:py-6 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0 flex-1 hidden md:block">
          <h1 className="text-lg md:text-3xl font-black tracking-tight">
            <span className="bg-gradient-to-r from-fuchsia-300 via-violet-200 to-indigo-300 bg-clip-text text-transparent">
              PCL 감정실
            </span>
          </h1>
          <p className="text-[9px] md:text-xs text-zinc-500 tracking-[0.2em] uppercase">
            Card Authentication Lab
          </p>
        </div>
        <div className="flex items-center gap-2 min-w-0 ml-auto">
          <div className="text-right min-w-0">
            <div className="text-[9px] md:text-[10px] text-zinc-500 uppercase tracking-wider">
              접수 번호
            </div>
            <div className="text-[10px] md:text-xs font-mono text-fuchsia-200 truncate">
              {caseId}
            </div>
          </div>
        </div>
      </div>

      {/* Lab stage */}
      <section
        className="relative mt-3 rounded-2xl border overflow-hidden"
        style={{
          borderColor: "rgba(168, 85, 247, 0.35)",
          background:
            "linear-gradient(180deg, #1a1235 0%, #0a0716 60%, #050309 100%)",
        }}
      >
        <LabBackdrop phase={phase} />

        {/* Reveal stage flash + ring burst (sits above backdrop, below content) */}
        <AnimatePresence>
          {phase === "revealed" && (
            <RevealOverlay key={revealKey} grade={grade} />
          )}
        </AnimatePresence>

        {/* Examiner NPC + assistant pixie + status */}
        <div className="relative px-4 pt-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <NpcDialog
              src="/images/common/grader-alakazam.png"
              alt="감정사 후딘 박사"
              text={graderLine(phase, selected, grade)}
              mood={graderMood(phase)}
              accent="fuchsia"
              nameplate={{ role: "감정사", name: "후딘 박사" }}
              sizeClass="w-14 h-14 md:w-16 md:h-16"
            />
          </div>
          <AssistantPixie phase={phase} />
          <StatusDot phase={phase} />
        </div>

        {/* Pedestal */}
        <div className="relative px-4 py-3 md:py-6 flex justify-center">
          <Pedestal
            selected={selected}
            grade={grade}
            phase={phase}
            onPick={() => setBulkOpen(true)}
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
        <div className="relative px-3 md:px-4 pb-3 md:pb-4 grid grid-cols-2 gap-2">
          {phase === "idle" && (
            <>
              <button
                onClick={() => setBulkOpen(true)}
                style={{ touchAction: "manipulation" }}
                className="col-span-2 h-12 rounded-xl bg-gradient-to-r from-fuchsia-500 to-indigo-500 text-white font-bold text-sm hover:scale-[1.02] active:scale-[0.98] transition shadow-[0_10px_30px_-10px_rgba(168,85,247,0.6)]"
              >
                🔎 감별 카드 선택
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

      <AnimatePresence>
        {bulkOpen && wallet && user && (
          <BulkGradingModal
            wallet={wallet}
            userId={user.id}
            username={user.display_name}
            onClose={() => {
              setBulkOpen(false);
              refreshWallet();
            }}
            onPointsChange={setPoints}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─────────────── sub-components ─────────────── */

/**
 * CSS-painted Pokemon lab backdrop. We tried Pokemon Showdown's
 * gen6bgs/bg-laboratory.png but it returns 404, so we paint the lab
 * in CSS: perspective floor grid, two glowing monitors, machinery
 * silhouettes on the sides, ambient violet/cyan lighting, and a
 * gentle floating dust layer.
 */
function LabBackdrop({ phase }: { phase: Phase }) {
  const accent =
    phase === "failing" || phase === "failed"
      ? "rgba(244,63,94,0.35)"
      : phase === "revealed"
      ? "rgba(216,180,254,0.45)"
      : "rgba(168,85,247,0.32)";

  const dust = useMemo(
    () =>
      Array.from({ length: 16 }).map((_, i) => ({
        left: `${(i * 53) % 100}%`,
        bottom: `${(i * 17) % 60}px`,
        dx: `${((i * 19) % 60) - 30}px`,
        dy: `-${120 + (i * 13) % 80}px`,
        dur: `${7 + (i % 5) * 1.4}s`,
        delay: `${(i * 0.6) % 8}s`,
        opacity: i % 3 === 0 ? 0.7 : 0.4,
      })),
    []
  );

  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Ceiling lights — soft violet/cyan wash */}
      <div
        className="absolute inset-x-0 top-0 h-1/2"
        style={{
          background:
            "radial-gradient(60% 80% at 30% 0%, rgba(56,189,248,0.18), transparent 70%), radial-gradient(60% 80% at 75% 0%, rgba(192,132,252,0.22), transparent 70%)",
        }}
      />

      {/* Stage glow over pedestal */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(closest-side at 50% 60%, ${accent}, transparent 60%)`,
          transition: "background 0.6s ease",
        }}
      />

      {/* Perspective floor */}
      <div
        className="absolute inset-x-0 bottom-0 h-2/5"
        style={{
          background:
            "linear-gradient(180deg, rgba(15,10,30,0) 0%, rgba(15,10,30,0.6) 60%, rgba(7,5,16,0.95) 100%)",
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-2/5 opacity-60"
        style={{
          backgroundImage:
            "linear-gradient(rgba(168,85,247,0.45) 1px, transparent 1px), linear-gradient(90deg, rgba(168,85,247,0.35) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          transform: "perspective(420px) rotateX(58deg)",
          transformOrigin: "50% 100%",
          maskImage:
            "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.85) 30%, rgba(0,0,0,1) 100%)",
          WebkitMaskImage:
            "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.85) 30%, rgba(0,0,0,1) 100%)",
          animation: "lab-grid-pan 4.6s linear infinite",
        }}
      />

      {/* Side machinery silhouettes — left bank of consoles */}
      <div className="absolute left-0 bottom-0 w-1/4 h-1/2">
        <div
          className="absolute left-2 bottom-8 w-16 h-20 rounded-md monitor-flicker"
          style={{
            background:
              "linear-gradient(180deg, rgba(56,189,248,0.55), rgba(168,85,247,0.35))",
            boxShadow:
              "inset 0 0 12px rgba(56,189,248,0.55), 0 0 18px rgba(56,189,248,0.35)",
            border: "1px solid rgba(56,189,248,0.45)",
          }}
        />
        <div
          className="absolute left-3 bottom-2 w-20 h-6 rounded-sm"
          style={{
            background:
              "linear-gradient(180deg, rgba(40,30,70,0.9), rgba(20,15,40,0.95))",
            border: "1px solid rgba(168,85,247,0.3)",
          }}
        />
        <div
          className="absolute left-4 bottom-4 w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]"
          style={{ animation: "dot-pulse 2.2s ease-in-out infinite" }}
        />
      </div>

      {/* Right bank — taller server rack */}
      <div className="absolute right-0 bottom-0 w-1/4 h-3/5">
        <div
          className="absolute right-2 bottom-2 w-14 h-32 rounded-md"
          style={{
            background:
              "linear-gradient(180deg, rgba(30,20,60,0.95), rgba(15,10,35,0.95))",
            border: "1px solid rgba(192,132,252,0.4)",
            boxShadow: "inset 0 0 16px rgba(192,132,252,0.18)",
          }}
        />
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="absolute right-3 w-12 h-1 rounded-sm bg-fuchsia-400/60"
            style={{
              bottom: `${10 + i * 24}px`,
              boxShadow: "0 0 6px rgba(217,70,239,0.7)",
              animation: `dot-pulse ${1.4 + i * 0.3}s ease-in-out infinite`,
              animationDelay: `${i * 0.18}s`,
            }}
          />
        ))}
      </div>

      {/* Floating dust motes */}
      {dust.map((d, i) => (
        <span
          key={i}
          className="lab-dust"
          style={
            {
              left: d.left,
              bottom: d.bottom,
              "--dx": d.dx,
              "--dy": d.dy,
              "--dur": d.dur,
              "--delay": d.delay,
              "--dust-opacity": d.opacity,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/**
 * Evolution-style reveal sequence: white flash + expanding ring burst,
 * plus confetti for high grades. Mounts on phase=revealed, animates
 * once, then unmounts.
 */
function RevealOverlay({ grade }: { grade: number | null }) {
  const isHype = grade !== null && grade >= 9;
  const tone = grade !== null ? psaTone(grade) : null;

  const confetti = useMemo(() => {
    if (!isHype) return [];
    return Array.from({ length: 18 }).map((_, i) => {
      const angle = (i / 18) * Math.PI * 2;
      const dist = 90 + Math.random() * 60;
      return {
        cx: `${Math.cos(angle) * dist}px`,
        cy: `${Math.sin(angle) * dist - 20}px`,
        cr: `${Math.random() * 360}deg`,
        cdur: `${1.1 + Math.random() * 0.8}s`,
        cdelay: `${0.1 + Math.random() * 0.3}s`,
        hue: ["#fde68a", "#fbbf24", "#f9a8d4", "#c4b5fd", "#67e8f9"][i % 5],
      };
    });
  }, [isHype]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 pointer-events-none z-20"
    >
      {/* White burn-in flash */}
      <div className="absolute inset-0 evo-flash" />
      {/* Expanding ring */}
      <span className="evo-ring-burst" />
      {isHype && (
        <span
          className="evo-ring-burst"
          style={{
            animationDelay: "0.18s",
            borderColor:
              grade === 10 ? "rgba(251,191,36,0.95)" : "rgba(226,232,240,0.9)",
          }}
        />
      )}
      {/* Grade impact text */}
      {grade !== null && (
        <div
          className={clsx(
            "grade-impact absolute left-1/2 top-1/2 text-3xl md:text-5xl font-black tracking-tight drop-shadow-[0_4px_18px_rgba(0,0,0,0.6)]",
            tone?.text
          )}
          style={{
            textShadow:
              "0 0 18px rgba(255,255,255,0.5), 0 0 38px rgba(216,180,254,0.55)",
          }}
        >
          PCL {grade}
        </div>
      )}
      {/* Confetti */}
      {confetti.map((c, i) => (
        <span
          key={i}
          className="confetti-burst absolute left-1/2 top-1/2 w-2 h-3 rounded-sm"
          style={
            {
              background: c.hue,
              boxShadow: `0 0 8px ${c.hue}`,
              "--cx": c.cx,
              "--cy": c.cy,
              "--cr": c.cr,
              "--cdur": c.cdur,
              "--cdelay": c.cdelay,
            } as CSSProperties
          }
        />
      ))}
    </motion.div>
  );
}

/** Tiny robot/pixie helper that reacts to the phase. */
function AssistantPixie({ phase }: { phase: Phase }) {
  const tone =
    phase === "failing" || phase === "failed"
      ? "from-rose-400 to-rose-600 shadow-[0_0_12px_rgba(244,63,94,0.7)]"
      : phase === "animating"
      ? "from-amber-300 to-amber-500 shadow-[0_0_14px_rgba(251,191,36,0.85)]"
      : phase === "revealed"
      ? "from-emerald-300 to-emerald-500 shadow-[0_0_14px_rgba(52,211,153,0.85)]"
      : "from-fuchsia-300 to-fuchsia-500 shadow-[0_0_12px_rgba(217,70,239,0.7)]";
  const eye =
    phase === "failing" || phase === "failed" ? "•_•" : phase === "revealed" ? "^_^" : "·_·";
  return (
    <motion.div
      animate={
        phase === "animating"
          ? { y: [0, -3, 0], rotate: [-3, 3, -3] }
          : phase === "revealed"
          ? { y: [0, -6, 0] }
          : phase === "failing" || phase === "failed"
          ? { y: [0, 1, 0] }
          : { y: [0, -2, 0] }
      }
      transition={{
        duration: phase === "animating" ? 0.7 : 2.4,
        repeat: Infinity,
        ease: "easeInOut",
      }}
      className={clsx(
        "hidden md:flex shrink-0 w-9 h-9 rounded-full bg-gradient-to-br items-center justify-center text-[9px] font-black text-zinc-900",
        tone
      )}
      aria-hidden
      title="연구 보조 픽시"
    >
      <span className="leading-none -mt-0.5">{eye}</span>
    </motion.div>
  );
}

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
    <div className="relative w-full flex justify-center" style={{ minHeight: 200 }}>
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
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center"
        >
          <p className="text-6xl leading-none opacity-70 drop-shadow-[0_0_12px_rgba(244,63,94,0.45)]">
            💔
          </p>
          <p className="text-xs text-rose-300">카드가 손상되었습니다</p>
        </motion.div>
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
          "relative w-[140px] md:w-[200px] aspect-[5/7] rounded-2xl overflow-hidden isolate ring-2 bg-zinc-900",
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
  // Particle stream: 7 sparkles rising from card during scanning
  const particles = useMemo(
    () =>
      Array.from({ length: 7 }).map((_, i) => ({
        left: `${10 + (i * 13) % 80}%`,
        x: `${((i * 23) % 24) - 12}px`,
        dur: `${1.4 + (i % 4) * 0.3}s`,
        delay: `${(i * 0.18) % 1.2}s`,
      })),
    []
  );
  return (
    <div className="relative flex flex-col items-center gap-3">
      <div className={clsx("relative", scanning && "pokeball-wobble")}>
        <motion.div
          animate={scanning ? { y: [-2, -6, -2] } : { y: 0 }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          className={clsx(
            "relative w-[140px] md:w-[200px] aspect-[5/7] rounded-2xl overflow-hidden isolate ring-2 bg-zinc-900",
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
            <>
              {/* Vertical scan line */}
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
              {/* Diagonal sweeping beam */}
              <div
                aria-hidden
                className="absolute inset-y-0 w-1/3 scan-beam pointer-events-none"
                style={{
                  background:
                    "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.55) 50%, transparent 100%)",
                  mixBlendMode: "screen",
                }}
              />
            </>
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
      </div>
      {/* Particle stream during scan */}
      {scanning && (
        <div className="absolute inset-0 pointer-events-none">
          {particles.map((p, i) => (
            <span
              key={i}
              className="particle-rise absolute bottom-12 w-1.5 h-1.5 rounded-full"
              style={
                {
                  left: p.left,
                  background:
                    "radial-gradient(closest-side, rgba(255,255,255,0.95), rgba(216,180,254,0.5) 60%, rgba(216,180,254,0) 80%)",
                  boxShadow: "0 0 8px rgba(216,180,254,0.95)",
                  "--x": p.x,
                  "--dur": p.dur,
                  "--delay": p.delay,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}
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
        className="relative w-[130px] md:w-[180px] aspect-[5/7] rounded-2xl border-2 border-dashed border-fuchsia-400/40 bg-fuchsia-500/5 text-fuchsia-200 hover:text-white hover:border-fuchsia-300/60 transition flex flex-col items-center justify-center gap-2 group overflow-hidden"
      >
        {/* Hovering hologram ring */}
        <span
          aria-hidden
          className="absolute inset-3 rounded-xl border border-fuchsia-300/30"
          style={{ animation: "ring-spin 12s linear infinite" }}
        />
        <span className="relative text-3xl group-hover:scale-110 transition">＋</span>
        <span className="relative text-xs font-semibold">감정 대상 카드 놓기</span>
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

/** Map the grading state machine to an NPC mood. */
function graderMood(phase: Phase): NpcMood {
  if (phase === "animating") return "working";
  if (phase === "failing") return "shocked";
  if (phase === "failed") return "sad";
  if (phase === "revealed") return "excited";
  return "idle";
}

/** Pick a short reactive line per state. */
function graderLine(phase: Phase, selected: Card | null, grade: number | null): string {
  if (phase === "animating") return "측정 중… 카드 표면을 스캔하고 있어요.";
  if (phase === "failing") return "이런! 카드에 균열이 퍼지고 있어요…";
  if (phase === "failed") return "감정에 실패했어요. 카드가 손상됐습니다.";
  if (phase === "revealed" && grade !== null) {
    if (grade === 10) return "놀라워요! 완벽한 GEM MINT 판정입니다!";
    if (grade === 9) return "훌륭해요! MINT 등급을 받으셨네요.";
    if (grade === 8) return "안정적인 NM-MT 등급이에요.";
    return `결과: PCL ${grade}등급입니다.`;
  }
  if (selected) return "언제든 준비되면 감정을 시작할게요.";
  return "감정할 카드를 골라주세요.";
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
                모든 등급의 카드를 감별할 수 있어요.
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

/* ─────────────── Bulk grading ─────────────── */

type BulkPhase = "picking" | "submitting" | "done";

function BulkGradingModal({
  wallet,
  userId,
  username,
  onClose,
  onPointsChange,
}: {
  wallet: WalletSnapshot;
  userId: string;
  username: string;
  onClose: () => void;
  onPointsChange: (points: number) => void;
}) {
  const eligible = useMemo(() => {
    return wallet.items
      .filter((it) => isPsaEligible(it.card.rarity))
      .sort((a, b) => compareRarity(a.card.rarity, b.card.rarity));
  }, [wallet]);

  const [phase, setPhase] = useState<BulkPhase>("picking");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkGradingResult | null>(null);
  const [autoSellBelow, setAutoSellBelow] = useState<number | null>(null);

  const totalEligibleCount = useMemo(
    () => eligible.reduce((s, it) => s + it.count, 0),
    [eligible]
  );

  const submit = useCallback(async () => {
    if (totalEligibleCount === 0 || phase !== "picking") return;
    setError(null);
    setPhase("submitting");
    const cardIds: string[] = [];
    const rarities: string[] = [];
    for (const it of eligible) {
      for (let i = 0; i < it.count; i++) {
        cardIds.push(it.card.id);
        rarities.push(it.card.rarity);
      }
    }
    const res = await bulkSubmitPsaGrading(
      userId,
      cardIds,
      rarities,
      autoSellBelow
    );
    if (!res.ok) {
      setError(res.error ?? "일괄 감별에 실패했어요.");
      setPhase("picking");
      return;
    }
    if (typeof res.points === "number") onPointsChange(res.points);
    // Discord brag for hits. Failures don't notify individually here to
    // avoid spamming the channel on bulk submissions.
    for (const r of res.results ?? []) {
      if (r.ok && !r.failed && typeof r.grade === "number") {
        notifyPsaGrade(username, r.card_id, r.grade);
      }
    }
    setResult(res);
    setPhase("done");
  }, [
    totalEligibleCount,
    phase,
    userId,
    username,
    onPointsChange,
    autoSellBelow,
    eligible,
  ]);

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
            <h3 className="text-sm font-bold text-white">
              {phase === "done" ? "일괄 감별 결과" : "일괄 감별 · 여러 장 한번에"}
            </h3>
            <button
              onClick={onClose}
              aria-label="닫기"
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
              style={{ touchAction: "manipulation" }}
            >
              ✕
            </button>
          </div>

          {phase === "done" && result ? (
            <BulkResults result={result} onClose={onClose} />
          ) : phase === "submitting" ? (
            <BulkSubmittingScreen count={totalEligibleCount} />
          ) : (
            <>
              <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-5 space-y-4">
                {totalEligibleCount === 0 ? (
                  <div className="py-10 text-center text-sm text-zinc-400">
                    <p>감별 가능한 카드가 없어요.</p>
                    <p className="mt-1 text-[11px]">
                      박스를 열어 카드를 모은 뒤 다시 시도해 주세요.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="rounded-2xl border border-fuchsia-400/40 bg-fuchsia-500/10 p-4 text-center">
                      <p className="text-[11px] uppercase tracking-wider text-fuchsia-200/80">
                        지갑에서 감별 가능한 카드
                      </p>
                      <p className="mt-1 text-3xl md:text-4xl font-black tabular-nums text-fuchsia-100">
                        {totalEligibleCount.toLocaleString("ko-KR")}
                        <span className="text-base font-bold text-fuchsia-300/80"> 장</span>
                      </p>
                      <p className="mt-2 text-[11px] text-fuchsia-200/80 leading-relaxed">
                        제출 시 <b>모든 감별 가능 카드</b>를 일괄로 의뢰해요.
                        실패 시 카드는 사라져요. (감별 확률은 단일 감별과 동일)
                      </p>
                    </div>
                    <AutoSellThresholdPicker
                      value={autoSellBelow}
                      disabled={false}
                      onChange={setAutoSellBelow}
                    />
                  </>
                )}
              </div>

              {error && (
                <div className="mx-4 mb-2 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2 shrink-0">
                  {error}
                </div>
              )}

              <div className="shrink-0 border-t border-white/10 p-3 bg-black/40">
                <button
                  type="button"
                  onClick={submit}
                  disabled={totalEligibleCount === 0}
                  className={clsx(
                    "w-full h-12 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-2 transition",
                    totalEligibleCount > 0
                      ? "bg-gradient-to-r from-fuchsia-500 to-indigo-500 text-white hover:scale-[1.01] active:scale-[0.98] shadow-[0_10px_30px_-10px_rgba(168,85,247,0.6)]"
                      : "bg-white/5 text-zinc-500 cursor-not-allowed border border-white/10"
                  )}
                  style={{ touchAction: "manipulation" }}
                >
                  🔎 {totalEligibleCount.toLocaleString("ko-KR")}장 일괄 감별
                </button>
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </Portal>
  );
}

function AutoSellThresholdPicker({
  value,
  disabled,
  onChange,
}: {
  value: number | null;
  disabled: boolean;
  onChange: (v: number | null) => void;
}) {
  const enabled = value !== null;
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={enabled}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked ? 9 : null)}
          className="w-4 h-4 rounded accent-amber-400"
          style={{ touchAction: "manipulation" }}
        />
        <span className="text-xs font-semibold text-zinc-200">
          PCL 자동 판매
        </span>
        <span className="text-[10px] text-zinc-500">
          선택한 등급 미만은 슬랩 저장 없이 즉시 환산
        </span>
      </label>
      {enabled && (
        <div className="mt-2 flex items-center gap-1.5">
          {[7, 8, 9, 10].map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => onChange(g)}
              disabled={disabled}
              className={clsx(
                "h-7 px-2.5 rounded-md text-[11px] font-bold border transition",
                value === g
                  ? "bg-amber-400 text-zinc-950 border-amber-400"
                  : "bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10"
              )}
              style={{ touchAction: "manipulation" }}
            >
              {g} 미만
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BulkPickRow({
  card,
  owned,
  selected,
  onBump,
}: {
  card: Card;
  owned: number;
  selected: number;
  onBump: (delta: number) => void;
}) {
  return (
    <div
      className={clsx(
        "flex items-center gap-3 rounded-lg p-2 border transition",
        selected > 0
          ? "bg-fuchsia-500/10 border-fuchsia-400/40"
          : "bg-white/5 border-white/10"
      )}
    >
      <div
        className={clsx(
          "relative w-10 aspect-[5/7] rounded shrink-0 overflow-hidden ring-1",
          RARITY_STYLE[card.rarity].frame
        )}
      >
        {card.imageUrl ? (
          <img
            src={card.imageUrl}
            alt=""
            loading="lazy"
            draggable={false}
            className="w-full h-full object-contain bg-zinc-900 pointer-events-none"
          />
        ) : null}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <RarityBadge rarity={card.rarity} size="xs" />
          <p className="text-[12px] text-white font-semibold truncate">
            {card.name}
          </p>
        </div>
        <p className="text-[10px] text-zinc-500 tabular-nums mt-0.5">
          보유 {owned}장
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => onBump(-1)}
          disabled={selected === 0}
          aria-label="하나 빼기"
          className={clsx(
            "w-8 h-8 rounded-md text-base font-bold leading-none flex items-center justify-center transition",
            selected === 0
              ? "bg-white/5 text-zinc-600 cursor-not-allowed"
              : "bg-white/10 hover:bg-white/15 text-white"
          )}
          style={{ touchAction: "manipulation" }}
        >
          −
        </button>
        <span className="w-8 text-center text-sm font-bold tabular-nums text-white">
          {selected}
        </span>
        <button
          type="button"
          onClick={() => onBump(1)}
          disabled={selected >= owned}
          aria-label="하나 더하기"
          className={clsx(
            "w-8 h-8 rounded-md text-base font-bold leading-none flex items-center justify-center transition",
            selected >= owned
              ? "bg-white/5 text-zinc-600 cursor-not-allowed"
              : "bg-fuchsia-500/30 hover:bg-fuchsia-500/45 text-white"
          )}
          style={{ touchAction: "manipulation" }}
        >
          +
        </button>
      </div>
    </div>
  );
}

/**
 * Themed loading screen rendered inside the bulk-grading modal while
 * the server processes the batch. Even though the request returns
 * quickly we use cinematic visuals (spinning pokeball, evolution
 * flashes, pulsing progress bar) so the user feels something is
 * happening.
 */
function BulkSubmittingScreen({ count }: { count: number }) {
  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-6 p-8 relative overflow-hidden">
      {/* Ambient glow */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(closest-side at 50% 45%, rgba(168,85,247,0.35), transparent 65%)",
        }}
      />
      {/* Periodic evolution-flash blips (3 staggered) */}
      {[0, 0.8, 1.6].map((d, i) => (
        <span
          key={i}
          aria-hidden
          className="bulk-blip absolute inset-0 pointer-events-none"
          style={
            {
              background:
                "radial-gradient(closest-side at 50% 45%, rgba(255,255,255,0.55), rgba(255,255,255,0) 60%)",
              "--bdelay": `${d}s`,
            } as CSSProperties
          }
        />
      ))}

      <div className="relative">
        <PokeLoader size="lg" />
        {/* Halo */}
        <span
          aria-hidden
          className="absolute -inset-6 rounded-full border border-fuchsia-300/30"
          style={{ animation: "ring-spin 4s linear infinite" }}
        />
        <span
          aria-hidden
          className="absolute -inset-12 rounded-full border border-fuchsia-300/15"
          style={{ animation: "ring-spin 8s linear infinite reverse" }}
        />
      </div>

      <div className="relative text-center">
        <p className="text-base md:text-lg font-bold text-white">
          <LoadingText
            text={`${count.toLocaleString("ko-KR")}장 일괄 감별 중`}
          />
        </p>
        <p className="mt-1 text-[11px] text-fuchsia-200/80">
          후딘 박사가 카드를 한 장씩 살펴보고 있어요
        </p>
      </div>

      {/* Pulsing progress bar */}
      <div className="relative w-full max-w-xs h-2 rounded-full overflow-hidden bg-white/5 ring-1 ring-fuchsia-400/20">
        <div
          className="absolute inset-0 bulk-progress-pulse"
          style={{
            backgroundImage:
              "linear-gradient(90deg, rgba(217,70,239,0.15) 0%, rgba(217,70,239,0.85) 35%, rgba(255,255,255,0.95) 50%, rgba(99,102,241,0.85) 65%, rgba(99,102,241,0.15) 100%)",
          }}
        />
      </div>
    </div>
  );
}

function BulkResults({
  result,
  onClose,
}: {
  result: BulkGradingResult;
  onClose: () => void;
}) {
  const rows = result.results ?? [];
  const success = result.success_count ?? 0;
  const fail = result.fail_count ?? 0;
  const skipped = result.skipped_count ?? 0;
  const capSkipped = result.cap_skipped_count ?? 0;
  const bonus = result.bonus ?? 0;
  const autoSoldCount = result.auto_sold_count ?? 0;
  const autoSoldEarned = result.auto_sold_earned ?? 0;

  // Group by grade for quick scanning.
  const gradeBreakdown = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of rows) {
      if (r.ok && !r.failed && typeof r.grade === "number") {
        m.set(r.grade, (m.get(r.grade) ?? 0) + 1);
      }
    }
    return Array.from(m.entries()).sort((a, b) => b[0] - a[0]);
  }, [rows]);

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Summary */}
      <div className="shrink-0 p-4 border-b border-white/10 bg-black/30">
        <div className="grid grid-cols-3 gap-2 text-center">
          <SummaryChip label="성공" value={`${success}`} tone="emerald" />
          <SummaryChip label="실패" value={`${fail}`} tone="rose" />
          <SummaryChip
            label="보너스"
            value={`+${bonus.toLocaleString("ko-KR")}p`}
            tone="amber"
          />
        </div>
        {gradeBreakdown.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
            {gradeBreakdown.map(([g, n]) => {
              const tone = psaTone(g);
              return (
                <span
                  key={g}
                  className={clsx(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-bold tabular-nums",
                    tone.text
                  )}
                  style={{ borderColor: "rgba(255,255,255,0.12)" }}
                >
                  PCL {g} · {n}장
                </span>
              );
            })}
          </div>
        )}
        {capSkipped > 0 && (
          <p className="mt-2 text-[11px] text-rose-300 text-center font-bold">
            ⚠️ PCL 한도(10,000장) 초과 — {capSkipped}장은 보유 한도에 막혀 감별 못 받았어요. 카드는 안전하게 지갑에 남아있어요.
          </p>
        )}
        {skipped > 0 && (
          <p className="mt-2 text-[10px] text-zinc-500 text-center">
            보유하지 않은 카드 {skipped}장은 건너뛰었어요.
          </p>
        )}
        {autoSoldCount > 0 && (
          <p className="mt-2 text-[10px] text-emerald-300 text-center">
            자동 판매 {autoSoldCount}장 · +
            {autoSoldEarned.toLocaleString("ko-KR")}p
          </p>
        )}
      </div>

      {/* Per-card list */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 md:p-4 space-y-1.5">
        {rows.map((r, i) => (
          <BulkResultRow key={`${r.card_id}-${i}`} row={r} />
        ))}
      </div>

      <div className="shrink-0 border-t border-white/10 p-3 bg-black/40">
        <button
          type="button"
          onClick={onClose}
          className="w-full h-12 rounded-xl bg-white text-zinc-900 font-bold text-sm"
          style={{ touchAction: "manipulation" }}
        >
          확인
        </button>
      </div>
    </div>
  );
}

function BulkResultRow({
  row,
}: {
  row: NonNullable<BulkGradingResult["results"]>[number];
}) {
  const card = getCard(row.card_id);
  const isGraded = row.ok && !row.failed && typeof row.grade === "number";
  const tone = isGraded ? psaTone(row.grade as number) : null;
  return (
    <div
      className={clsx(
        "flex items-center gap-3 rounded-lg p-2 border",
        row.failed
          ? "bg-rose-500/5 border-rose-500/25"
          : isGraded
          ? "bg-white/5 border-white/10"
          : "bg-white/3 border-white/10 opacity-70"
      )}
    >
      <div
        className={clsx(
          "relative w-10 aspect-[5/7] rounded shrink-0 overflow-hidden ring-1",
          card ? RARITY_STYLE[card.rarity].frame : "ring-white/10"
        )}
      >
        {card?.imageUrl ? (
          <img
            src={card.imageUrl}
            alt=""
            loading="lazy"
            draggable={false}
            className={clsx(
              "w-full h-full object-contain bg-zinc-900 pointer-events-none",
              row.failed && "grayscale opacity-50"
            )}
          />
        ) : null}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-white font-semibold truncate">
          {card?.name ?? row.card_id}
        </p>
        <p className="text-[10px] text-zinc-500 truncate mt-0.5">
          {row.failed
            ? "감별 실패 · 카드 소실"
            : isGraded
            ? `${PSA_LABEL[row.grade as number] ?? ""}${
                row.bonus ? ` · +${row.bonus.toLocaleString("ko-KR")}p` : ""
              }`
            : row.error === "not_owned"
            ? "보유하지 않아 건너뜀"
            : "건너뜀"}
        </p>
      </div>
      <div className="shrink-0">
        {row.failed ? (
          <span className="text-rose-300 text-lg">💔</span>
        ) : isGraded ? (
          <span
            className={clsx(
              "inline-flex items-center justify-center w-11 h-9 rounded-md font-black tabular-nums",
              tone?.banner
            )}
          >
            {row.grade}
          </span>
        ) : (
          <span className="text-[10px] text-zinc-500">—</span>
        )}
      </div>
    </div>
  );
}

function SummaryChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "rose" | "amber";
}) {
  const classes =
    tone === "emerald"
      ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-200"
      : tone === "rose"
      ? "bg-rose-500/10 border-rose-500/40 text-rose-200"
      : "bg-amber-400/10 border-amber-400/40 text-amber-200";
  return (
    <div className={clsx("rounded-lg border px-2 py-1.5", classes)}>
      <div className="text-[9px] uppercase tracking-[0.18em] opacity-80">
        {label}
      </div>
      <div className="text-sm font-black tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
