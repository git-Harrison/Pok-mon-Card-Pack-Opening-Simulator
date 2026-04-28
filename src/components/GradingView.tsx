"use client";

import PokeLoader, { LoadingText } from "./PokeLoader";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import clsx from "clsx";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import {
  enqueueGradingJob,
  processGradingJobChunk,
  getActiveGradingJob,
  cancelGradingJob,
  fetchWallet,
  type BulkGradingResult,
  type GradingJob,
  type WalletSnapshot,
} from "@/lib/db";

const PROGRESS_POLL_MS = 3000;
import { getCard } from "@/lib/sets";
import { isPclEligible, PCL_LABEL, pclTone } from "@/lib/pcl";
import { compareRarity } from "@/lib/rarity";
import PageBackdrop from "./PageBackdrop";
import Portal from "./Portal";

// 일괄 감별 한 번에 보낼 수 있는 최대 카드 수.
// 서버 bulk_submit_pcl_grading 의 statement_timeout 180s 안에서 안전한
// 상한. SQL 함수와 동일 값으로 동기화 필수.
const BULK_GRADING_MAX = 5000;

const OAK_SPRITE =
  "https://play.pokemonshowdown.com/sprites/trainers/oak-gen3.png";

const OAK_IDLE_LINES: Array<{ a: string; b: string }> = [
  {
    a: "어서 오게! 감별할 카드를 가져왔구먼.",
    b: "내 연구실 기계로 한 번에 등급을 매겨주지.",
  },
  {
    a: "이 기계는 카드의 미세한 결까지 읽어내지.",
    b: "흠집 하나, 모서리 하나도 놓치지 않는다네.",
  },
  {
    a: "PCL 등급은 한 번 정해지면 영원히 따라다니지.",
    b: "그러니 너무 욕심부리지 말고 신중하게.",
  },
  {
    a: "긴장은 풀게. 가져온 카드는 안전하게 다뤄주마.",
    b: "감별이 끝나면 슬랩으로 곱게 봉인해두지.",
  },
];

export default function GradingView() {
  const { user, setPoints } = useAuth();
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  // 활성 잡 — 모달 외부에서도 진행 상황 표시 (spec 3-2 백그라운드).
  // 페이지 진입 / focus 복귀 / 3 초 폴링 으로 갱신.
  const [activeJob, setActiveJob] = useState<GradingJob | null>(null);

  const refreshWallet = useCallback(async () => {
    if (!user) return;
    const w = await fetchWallet(user.id);
    setWallet(w);
  }, [user]);

  const refreshActiveJob = useCallback(async () => {
    if (!user) return;
    const job = await getActiveGradingJob(user.id);
    setActiveJob(job);
  }, [user]);

  useEffect(() => {
    refreshWallet();
    refreshActiveJob();
  }, [refreshWallet, refreshActiveJob]);

  // 페이지 노출 중일 때 3 초마다 잡 상태 갱신.
  useEffect(() => {
    if (!user) return;
    const id = setInterval(refreshActiveJob, PROGRESS_POLL_MS);
    return () => clearInterval(id);
  }, [user, refreshActiveJob]);

  // 모달 닫을 때 wallet + 잡 모두 새로고침 (감별 완료/취소 반영).
  const onCloseBulk = useCallback(() => {
    setBulkOpen(false);
    refreshWallet();
    refreshActiveJob();
  }, [refreshWallet, refreshActiveJob]);

  const eligibleCount = useMemo(() => {
    if (!wallet) return 0;
    return wallet.items
      .filter((it) => isPclEligible(it.card.rarity))
      .reduce((s, it) => s + it.count, 0);
  }, [wallet]);

  return (
    <div className="relative max-w-3xl mx-auto px-3 md:px-6 py-3 md:py-6 fade-in">
      <PageBackdrop tone="lab" />
      {/* Lab hero — large NPC + speech bubble */}
      <LabHero busy={bulkOpen} />

      {/* 활성 잡 banner — 모달 닫고 페이지 다시 와도 진행 상황 보임 */}
      {activeJob && activeJob.status !== "completed" && (
        <ActiveJobBanner job={activeJob} onResume={() => setBulkOpen(true)} />
      )}

      {/* Eligible card count */}
      <section className="mt-4 md:mt-5 rounded-2xl border border-fuchsia-400/40 bg-gradient-to-b from-fuchsia-500/10 to-indigo-500/10 px-4 py-5 md:px-6 md:py-6 text-center">
        <p className="text-[10px] md:text-[11px] uppercase tracking-[0.2em] text-fuchsia-200/80">
          감별 대기 카드
        </p>
        <p className="mt-1 text-4xl md:text-5xl font-black tabular-nums text-fuchsia-100 drop-shadow-[0_4px_12px_rgba(217,70,239,0.4)]">
          {eligibleCount.toLocaleString("ko-KR")}
          <span className="ml-1 text-base md:text-lg font-bold text-fuchsia-300/80">
            장
          </span>
        </p>
        <p className="mt-2 text-[11px] md:text-xs text-fuchsia-200/70 leading-relaxed">
          모든 등급의 카드를 감별할 수 있어요. 실패 시 카드는 사라져요.
        </p>
      </section>

      {/* Primary action */}
      <button
        type="button"
        onClick={() => setBulkOpen(true)}
        disabled={eligibleCount === 0}
        style={{ touchAction: "manipulation" }}
        className={clsx(
          "mt-4 w-full h-14 md:h-16 rounded-2xl text-base md:text-lg font-black inline-flex items-center justify-center gap-2 transition",
          eligibleCount === 0
            ? "bg-white/5 text-zinc-500 border border-white/10 cursor-not-allowed"
            : "bg-gradient-to-r from-fuchsia-500 via-violet-500 to-indigo-500 text-white shadow-[0_14px_32px_-10px_rgba(168,85,247,0.7)] hover:scale-[1.01] active:scale-[0.98]"
        )}
      >
        🔎 일괄 감별 시작
      </button>

      {/* spec: 정적 설명 박스(GEM MINT / 자동 판매 / 감별 한도) 삭제.
          NPC 대화형 몰입 UI 로 정보 전달 — 모달 안에서 다이얼로그/스캔
          애니메이션으로. */}

      <p className="mt-4 text-[11px] text-zinc-500 text-center">
        감별이 완료된 슬랩은{" "}
        <Link
          href="/wallet?tab=pcl"
          className="underline underline-offset-2 hover:text-fuchsia-300"
        >
          내 카드지갑 PCL 탭
        </Link>
        에서 확인할 수 있어요.
      </p>

      <AnimatePresence>
        {bulkOpen && wallet && user && (
          <BulkGradingModal
            wallet={wallet}
            userId={user.id}
            onClose={onCloseBulk}
            onPointsChange={setPoints}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
 * Lab hero — Oak NPC + speech bubble with idle motion / parallax
 * ──────────────────────────────────────────────────────────── */
/** 활성 잡 banner — 페이지 외부에서도 백그라운드 감별 진행 표시 + 모달
 *  복귀. 잡 status === completed 면 표시 안 함 (모달 결과 화면이 처리). */
function ActiveJobBanner({
  job,
  onResume,
}: {
  job: GradingJob;
  onResume: () => void;
}) {
  const pct =
    job.total > 0
      ? Math.min(100, Math.round((job.cursor / job.total) * 100))
      : 0;
  const isProcessing = job.status === "processing" || job.status === "pending";
  return (
    <button
      type="button"
      onClick={onResume}
      style={{ touchAction: "manipulation" }}
      className="mt-3 w-full rounded-2xl border border-fuchsia-400/50 bg-gradient-to-r from-fuchsia-500/15 via-violet-500/15 to-indigo-500/15 px-4 py-3 text-left hover:scale-[1.005] active:scale-[0.99] transition shadow-[0_8px_24px_-12px_rgba(168,85,247,0.5)]"
    >
      <div className="flex items-center gap-3">
        <span aria-hidden className="text-2xl">🔬</span>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-[0.18em] text-fuchsia-200/85 font-bold">
            {isProcessing ? "감별 진행 중" : `감별 ${job.status}`}
          </p>
          <p className="mt-0.5 text-[13px] font-bold text-white">
            {job.cursor.toLocaleString("ko-KR")} /{" "}
            {job.total.toLocaleString("ko-KR")}장 ({pct}%)
            <span className="ml-1.5 text-[11px] text-fuchsia-200/70 font-normal">
              · 성공 {job.success_count.toLocaleString("ko-KR")}장
            </span>
          </p>
        </div>
        <span className="shrink-0 text-[11px] font-bold text-fuchsia-200">
          이어보기 →
        </span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full transition-[width] duration-500 ease-out"
          style={{
            width: `${pct}%`,
            backgroundImage:
              "linear-gradient(90deg, rgba(217,70,239,0.85) 0%, rgba(99,102,241,0.85) 100%)",
          }}
        />
      </div>
    </button>
  );
}

function LabHero({ busy }: { busy: boolean }) {
  const reduce = useReducedMotion();
  const sectionRef = useRef<HTMLElement | null>(null);
  const [parallax, setParallax] = useState({ x: 0, y: 0 });

  // Mouse parallax — disabled on touch & reduced-motion
  useEffect(() => {
    if (reduce) return;
    const isTouch =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(hover: none)").matches;
    if (isTouch) return;

    const el = sectionRef.current;
    if (!el) return;

    let raf = 0;
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const cx = (e.clientX - rect.left) / rect.width - 0.5; // -0.5..0.5
      const cy = (e.clientY - rect.top) / rect.height - 0.5;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setParallax({ x: cx, y: cy });
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setParallax({ x: 0, y: 0 }));
    };
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, [reduce]);

  // Rotate idle dialog every ~6s when not busy
  const [lineIdx, setLineIdx] = useState(0);
  useEffect(() => {
    if (busy) return;
    const id = window.setInterval(() => {
      setLineIdx((i) => (i + 1) % OAK_IDLE_LINES.length);
    }, 6200);
    return () => window.clearInterval(id);
  }, [busy]);

  const line = OAK_IDLE_LINES[lineIdx];

  // Oak idle motion — breathing scale + bob
  const oakAnim = reduce
    ? undefined
    : {
        y: [0, -3, 0, 3, 0],
        scale: [1, 1.012, 1, 1.008, 1],
      };
  const shadowAnim = reduce
    ? undefined
    : {
        scaleX: [1, 0.9, 1, 0.94, 1],
        opacity: [0.55, 0.42, 0.55, 0.48, 0.55],
      };

  // Sparkle emission every ~8s from hand area (cycles repeat to limit rerenders)
  const [sparkKey, setSparkKey] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => setSparkKey((k) => k + 1), 8000);
    return () => window.clearInterval(id);
  }, [reduce]);

  return (
    <section
      ref={sectionRef}
      className="relative rounded-3xl overflow-hidden border border-fuchsia-500/30 bg-zinc-950"
    >
      <LabScene parallax={parallax} reduce={!!reduce} />

      <div className="relative px-4 pt-5 pb-6 md:px-8 md:pt-8 md:pb-10 flex items-end gap-3 md:gap-6">
        <div className="shrink-0 relative">
          {/* Floor shadow — syncs with breathing */}
          <motion.div
            aria-hidden
            className="absolute -bottom-1 left-1/2 w-32 md:w-44 h-3 rounded-full bg-black/55 blur-md"
            style={{ x: "-50%" }}
            animate={shadowAnim}
            transition={{
              duration: 4.6,
              ease: "easeInOut",
              repeat: Infinity,
            }}
          />

          {/* Oak sprite — breathing + bob */}
          <motion.img
            src={OAK_SPRITE}
            alt="감정사 오박사"
            draggable={false}
            className="relative h-40 md:h-56 w-auto object-contain pointer-events-none select-none drop-shadow-[0_8px_22px_rgba(168,85,247,0.45)]"
            style={{ imageRendering: "pixelated", transformOrigin: "50% 100%" }}
            animate={oakAnim}
            transition={{
              duration: 4.6,
              ease: "easeInOut",
              repeat: Infinity,
            }}
          />

          {/* Sparkle / scan beam emission near hand */}
          {!reduce && (
            <span
              key={sparkKey}
              aria-hidden
              className="pointer-events-none absolute"
              style={{
                left: "62%",
                top: "44%",
                width: 28,
                height: 28,
              }}
            >
              <span
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    "radial-gradient(closest-side, rgba(255,255,255,0.95), rgba(216,180,254,0.55) 45%, rgba(216,180,254,0) 75%)",
                  animation: "evo-flash 1.6s ease-out forwards",
                }}
              />
              <span
                className="absolute left-1/2 top-1/2 w-10 h-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-fuchsia-200/70"
                style={{
                  animation: "evo-ring-burst 1.4s ease-out forwards",
                }}
              />
            </span>
          )}

          <div className="mt-1 text-center">
            <span className="inline-block rounded-md bg-fuchsia-500/20 border border-fuchsia-300/40 text-fuchsia-100 text-[10px] md:text-[11px] font-bold tracking-wider px-2 py-0.5">
              감정사 · 오박사
            </span>
          </div>
        </div>

        <div className="flex-1 min-w-0 pb-2 md:pb-4">
          <motion.div
            className="relative inline-block max-w-full bg-white/95 text-zinc-900 rounded-2xl rounded-bl-none px-3 py-2 md:px-4 md:py-3 shadow-[0_8px_22px_-8px_rgba(0,0,0,0.7)]"
            initial={reduce ? false : { opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
            key={lineIdx}
          >
            <TypingLine
              text={line.a}
              className="text-[12px] md:text-sm font-bold leading-snug"
              speedMs={26}
              reduce={!!reduce}
            />
            <TypingLine
              text={line.b}
              className="mt-0.5 text-[11px] md:text-[12px] text-zinc-700 leading-snug"
              speedMs={22}
              startDelayMs={line.a.length * 26 + 120}
              reduce={!!reduce}
              showCaret
            />
            <span
              aria-hidden
              className="absolute -bottom-2 left-2 w-3 h-3 bg-white/95 rotate-45 rounded-sm"
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* Typewriter line with optional blinking caret */
function TypingLine({
  text,
  className,
  speedMs,
  startDelayMs = 0,
  reduce,
  showCaret = false,
}: {
  text: string;
  className?: string;
  speedMs: number;
  startDelayMs?: number;
  reduce: boolean;
  showCaret?: boolean;
}) {
  const [n, setN] = useState(reduce ? text.length : 0);

  useEffect(() => {
    if (reduce) {
      setN(text.length);
      return;
    }
    setN(0);
    let i = 0;
    let tickId = 0;
    const startId = window.setTimeout(() => {
      tickId = window.setInterval(() => {
        i++;
        setN(i);
        if (i >= text.length) window.clearInterval(tickId);
      }, speedMs);
    }, startDelayMs);
    return () => {
      window.clearTimeout(startId);
      window.clearInterval(tickId);
    };
  }, [text, speedMs, startDelayMs, reduce]);

  const done = n >= text.length;

  return (
    <p className={className}>
      <span>{text.slice(0, n)}</span>
      {showCaret && (
        <span
          aria-hidden
          className="inline-block w-[1px] h-[1em] align-[-0.15em] ml-[1px] bg-zinc-700"
          style={{
            animation: reduce
              ? undefined
              : done
              ? "bulk-blip 1.05s ease-in-out infinite"
              : undefined,
            opacity: done || !reduce ? 1 : 0.85,
          }}
        />
      )}
    </p>
  );
}

/* ────────────────────────────────────────────────────────────
 * Lab scene (background) — wallpaper + floor + ambient glow
 *   parallax: -0.5..0.5 mouse offset for depth
 * ──────────────────────────────────────────────────────────── */
function LabScene({
  parallax,
  reduce,
}: {
  parallax: { x: number; y: number };
  reduce: boolean;
}) {
  // Back layer drifts more than mid layer for depth
  const backShift = {
    transform: `translate3d(${parallax.x * -10}px, ${parallax.y * -6}px, 0)`,
  };
  const midShift = {
    transform: `translate3d(${parallax.x * -5}px, ${parallax.y * -3}px, 0)`,
  };

  // 2-3 dust motes — randomized once
  const dustMotes = useMemo(
    () =>
      Array.from({ length: 3 }, (_, i) => ({
        left: 18 + ((i * 31) % 70) + (i % 2 === 0 ? 5 : 0),
        delay: i * 2.7,
        dur: 9 + (i % 2) * 2,
        dx: (i % 2 === 0 ? 24 : -28) + i * 4,
        opacity: 0.45 + (i % 2) * 0.15,
      })),
    []
  );

  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Wallpaper: soft violet/indigo wash with horizontal panel banding */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, #2a1d52 0%, #1c1438 45%, #110a26 100%)",
          ...backShift,
        }}
      />
      <div
        className="absolute inset-x-0 top-0 h-3/5 opacity-40"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 60px)",
          ...backShift,
        }}
      />
      {/* Bookshelves on the back wall */}
      <div className="absolute inset-x-0 top-[18%] h-[28%] opacity-70" style={backShift}>
        <div
          className="absolute inset-x-3 top-0 h-full rounded-md"
          style={{
            background:
              "repeating-linear-gradient(90deg, rgba(120,80,60,0.55) 0 18px, rgba(80,55,40,0.6) 18px 22px), repeating-linear-gradient(0deg, rgba(0,0,0,0) 0 28px, rgba(0,0,0,0.45) 28px 30px)",
            boxShadow: "inset 0 0 24px rgba(0,0,0,0.55)",
          }}
        />
      </div>
      {/* Pokeball decorations on the shelves */}
      <div className="absolute inset-0" style={backShift}>
        {[15, 38, 62, 85].map((left) => (
          <span
            key={left}
            className="absolute w-3 h-3 rounded-full"
            style={{
              top: "26%",
              left: `${left}%`,
              background:
                "linear-gradient(180deg, #f87171 0 50%, #f8fafc 50% 100%)",
              border: "1px solid rgba(0,0,0,0.6)",
              boxShadow: "0 1px 2px rgba(0,0,0,0.6)",
            }}
          />
        ))}
      </div>
      {/* Ambient ceiling lights */}
      <div
        className="absolute inset-x-0 top-0 h-1/3"
        style={{
          background:
            "radial-gradient(60% 80% at 30% 0%, rgba(125,211,252,0.16), transparent 70%), radial-gradient(60% 80% at 75% 0%, rgba(192,132,252,0.22), transparent 70%)",
          ...midShift,
        }}
      />
      {/* Stage glow — gentle hue shift violet ↔ indigo */}
      <motion.div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(closest-side at 28% 78%, rgba(168,85,247,0.32), transparent 65%)",
        }}
        animate={
          reduce
            ? undefined
            : {
                background: [
                  "radial-gradient(closest-side at 28% 78%, rgba(168,85,247,0.32), transparent 65%)",
                  "radial-gradient(closest-side at 28% 78%, rgba(99,102,241,0.34), transparent 65%)",
                  "radial-gradient(closest-side at 28% 78%, rgba(168,85,247,0.32), transparent 65%)",
                ],
              }
        }
        transition={{ duration: 12, ease: "easeInOut", repeat: Infinity }}
      />
      {/* Floating dust motes */}
      {!reduce &&
        dustMotes.map((d, i) => (
          <span
            key={i}
            className="lab-dust"
            style={
              {
                left: `${d.left}%`,
                bottom: "8%",
                "--dur": `${d.dur}s`,
                "--delay": `${d.delay}s`,
                "--dx": `${d.dx}px`,
                "--dy": "-160px",
                "--dust-opacity": d.opacity,
              } as CSSProperties
            }
          />
        ))}
      {/* Floor: tiled perspective */}
      <div
        className="absolute inset-x-0 bottom-0 h-2/5"
        style={{
          background:
            "linear-gradient(180deg, rgba(15,10,30,0) 0%, rgba(15,10,30,0.55) 50%, rgba(7,5,16,0.95) 100%)",
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-2/5 opacity-50"
        style={{
          backgroundImage:
            "linear-gradient(rgba(168,85,247,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(168,85,247,0.32) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          transform: "perspective(520px) rotateX(58deg)",
          transformOrigin: "50% 100%",
          maskImage:
            "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.85) 30%, rgba(0,0,0,1) 100%)",
          WebkitMaskImage:
            "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.85) 30%, rgba(0,0,0,1) 100%)",
        }}
      />
      {/* Right-side server rack */}
      <div className="absolute right-0 bottom-0 w-[22%] h-3/5" style={midShift}>
        <div
          className="absolute right-3 bottom-2 w-14 h-32 md:h-44 rounded-md"
          style={{
            background:
              "linear-gradient(180deg, rgba(30,20,60,0.95), rgba(15,10,35,0.95))",
            border: "1px solid rgba(192,132,252,0.4)",
            boxShadow: "inset 0 0 16px rgba(192,132,252,0.18)",
          }}
        />
        {[0, 1, 2, 3].map((i) => {
          // Phase-offset LED pulses for a natural look
          const delay = (i * 0.43) % 1.7;
          return (
            <motion.span
              key={i}
              className="absolute right-5 w-10 h-1.5 rounded-sm"
              style={{
                bottom: `${18 + i * 26}px`,
                background:
                  "linear-gradient(90deg, rgba(34,211,238,0.85), rgba(168,85,247,0.7))",
                boxShadow: "0 0 8px rgba(34,211,238,0.5)",
              }}
              animate={
                reduce
                  ? undefined
                  : {
                      opacity: [0.55, 1, 0.7, 0.95, 0.55],
                    }
              }
              transition={{
                duration: 2.6 + (i % 2) * 0.5,
                ease: "easeInOut",
                repeat: Infinity,
                delay,
              }}
            />
          );
        })}
      </div>
      {/* Left workstation */}
      <div className="absolute left-0 bottom-0 w-1/4 h-1/2" style={midShift}>
        <motion.div
          className="absolute left-3 bottom-10 w-16 h-12 md:w-20 md:h-14 rounded-md"
          style={{
            background:
              "linear-gradient(180deg, rgba(125,211,252,0.65), rgba(99,102,241,0.5))",
            border: "1px solid rgba(56,189,248,0.45)",
            boxShadow:
              "inset 0 0 12px rgba(56,189,248,0.55), 0 0 18px rgba(56,189,248,0.35)",
          }}
          animate={
            reduce
              ? undefined
              : {
                  opacity: [0.92, 1, 0.86, 0.98, 0.92],
                }
          }
          transition={{
            duration: 5.2,
            ease: "easeInOut",
            repeat: Infinity,
          }}
        />
        <div
          className="absolute left-5 bottom-2 w-12 h-6 rounded-sm"
          style={{
            background: "rgba(40,30,70,0.9)",
            border: "1px solid rgba(168,85,247,0.3)",
          }}
        />
      </div>
    </div>
  );
}

function Tip({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-2 text-center">
      <div className="text-base md:text-lg leading-none">{icon}</div>
      <div className="mt-1 text-[11px] font-bold text-zinc-100">{title}</div>
      <div className="mt-0.5 text-[10px] text-zinc-400 leading-tight">
        {children}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
 * Bulk grading modal — DO NOT TOUCH (preserved verbatim)
 * ──────────────────────────────────────────────────────────── */

type BulkPhase = "picking" | "submitting" | "done";

function BulkGradingModal({
  wallet,
  userId,
  onClose,
  onPointsChange,
}: {
  wallet: WalletSnapshot;
  userId: string;
  onClose: () => void;
  onPointsChange: (points: number) => void;
}) {
  const eligible = useMemo(() => {
    return wallet.items
      .filter((it) => isPclEligible(it.card.rarity))
      .sort((a, b) => compareRarity(a.card.rarity, b.card.rarity));
  }, [wallet]);

  const [phase, setPhase] = useState<BulkPhase>("picking");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkGradingResult | null>(null);

  // PCL 자동 판매 임계 — localStorage 에 영구 저장. 모달 닫았다가 다시
  // 열어도 마지막 선택 유지. (이전엔 매번 null 로 초기화돼 풀려있었음.)
  const AUTO_SELL_KEY = "pcl_auto_sell_below";
  const [autoSellBelow, setAutoSellBelow] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(AUTO_SELL_KEY);
      if (raw === null) return null;
      const v = parseInt(raw, 10);
      return [7, 8, 9, 10].includes(v) ? v : null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (autoSellBelow === null) window.localStorage.removeItem(AUTO_SELL_KEY);
      else window.localStorage.setItem(AUTO_SELL_KEY, String(autoSellBelow));
    } catch {
      // noop — quota / private mode
    }
  }, [autoSellBelow]);

  const totalEligibleCount = useMemo(
    () => eligible.reduce((s, it) => s + it.count, 0),
    [eligible]
  );

  // 한 번에 보낼 수 있는 카드 수 한도. 서버 statement_timeout 안에서
  // 안전하게 처리되는 상한 — 같은 값이 SQL 함수에도 박혀있어야 함.
  // 클라가 5,000 단위로 자동 분할 호출 → 사용자는 한 번 클릭만.
  // (totalEligibleCount > BULK_GRADING_MAX 이어도 모두 처리)
  const submitCount = totalEligibleCount;

  // 진행 표시 — 백엔드 잡의 cursor / total.
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });

  // 활성 잡 ID. 페이지 이탈/복귀 시에도 진행 유지를 위해 server-side
  // grading_jobs 테이블에 영속. 모달 mount 시 active 잡 있으면 즉시
  // 폴링 재개.
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  // 활성 잡 상태 → UI state 적용.
  const applyJobState = useCallback(
    (job: GradingJob) => {
      setBatchProgress({ done: job.cursor, total: job.total });
      if (job.status === "completed") {
        const aggregated: BulkGradingResult = {
          ok: true,
          success_count: job.success_count,
          fail_count: job.fail_count,
          skipped_count: job.skipped_count,
          cap_skipped_count: job.cap_skipped_count,
          auto_deleted_count: job.auto_deleted_count,
        };
        setResult(aggregated);
        setActiveJobId(null);
        setPhase("done");
      } else if (job.status === "failed" || job.status === "cancelled") {
        setError(
          job.error_message ??
            (job.status === "cancelled"
              ? "감별이 취소됐어요."
              : "감별 중 오류가 발생했어요.")
        );
        setActiveJobId(null);
        setPhase("picking");
      }
    },
    []
  );

  // 청크 폴링 루프 — 1초 간격, 잡 완료/실패까지.
  const pollJob = useCallback(
    async (jobId: string) => {
      while (!cancelledRef.current) {
        const res = await processGradingJobChunk(jobId, BULK_GRADING_MAX);
        if (!("ok" in res) || !res.ok) {
          setError(("error" in res && res.error) || "잡 처리 실패.");
          setPhase("picking");
          setActiveJobId(null);
          return;
        }
        applyJobState(res as unknown as GradingJob);
        if (res.status !== "processing" && res.status !== "pending") {
          return;
        }
        // 다음 청크 사이 짧은 휴식 — DB 부하 분산 + UI 진행 표시 부드럽게.
        await new Promise((r) => setTimeout(r, 250));
      }
    },
    [applyJobState]
  );

  // mount 시 active 잡 확인 → 자동 재개.
  useEffect(() => {
    cancelledRef.current = false;
    let alive = true;
    (async () => {
      const active = await getActiveGradingJob(userId);
      if (!alive || !active) return;
      setActiveJobId(active.job_id);
      setBatchProgress({ done: active.cursor, total: active.total });
      setPhase("submitting");
      pollJob(active.job_id);
    })();
    return () => {
      alive = false;
      cancelledRef.current = true;
    };
  }, [userId, pollJob]);

  const submit = useCallback(async () => {
    if (totalEligibleCount === 0 || phase !== "picking") return;
    setError(null);
    setPhase("submitting");

    // 평탄 배열 빌드.
    const allCardIds: string[] = [];
    const allRarities: string[] = [];
    for (const it of eligible) {
      for (let i = 0; i < it.count; i++) {
        allCardIds.push(it.card.id);
        allRarities.push(it.card.rarity);
      }
    }
    const total = allCardIds.length;
    setBatchProgress({ done: 0, total });

    const enq = await enqueueGradingJob(userId, allCardIds, allRarities, autoSellBelow);
    if (!enq.ok || !enq.job_id) {
      setError(enq.error ?? "잡 등록 실패.");
      setPhase("picking");
      return;
    }
    setActiveJobId(enq.job_id);
    cancelledRef.current = false;
    pollJob(enq.job_id);
    void onPointsChange; // 잡 완료 시 부모가 wallet refresh 로 갱신.
  }, [
    totalEligibleCount,
    phase,
    userId,
    onPointsChange,
    autoSellBelow,
    eligible,
    pollJob,
  ]);

  // 사용자 명시적 취소 (모달 X 버튼 또는 닫기).
  const handleCancel = useCallback(async () => {
    if (activeJobId) {
      cancelledRef.current = true;
      await cancelGradingJob(activeJobId, userId);
    }
    onClose();
  }, [activeJobId, userId, onClose]);

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
              {phase === "done"
                ? "일괄 감별 결과"
                : phase === "submitting"
                ? "오박사가 감별 중..."
                : "일괄 감별 · 여러 장 한번에"}
            </h3>
            <button
              onClick={phase === "submitting" ? handleCancel : onClose}
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
            <BulkSubmittingScreen
              count={submitCount}
              progress={batchProgress}
              onCancel={handleCancel}
            />
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
                      {totalEligibleCount > BULK_GRADING_MAX ? (
                        <p className="mt-2 text-[11px] text-fuchsia-200/85 leading-relaxed">
                          한 번 클릭으로 <b>전체</b> 일괄 감별 — 서버 안전
                          한도 <b>{BULK_GRADING_MAX.toLocaleString("ko-KR")}장</b>씩
                          자동 분할 호출 후 마지막에 합산 결과만 보여줘요.
                          실패 시 해당 batch 카드는 사라져요.
                        </p>
                      ) : (
                        <p className="mt-2 text-[11px] text-fuchsia-200/80 leading-relaxed">
                          제출 시 <b>모든 감별 가능 카드</b>를 일괄로 의뢰해요.
                          실패 시 카드는 사라져요. (감별 확률은 단일 감별과 동일)
                        </p>
                      )}
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
                  🔎 {submitCount.toLocaleString("ko-KR")}장 일괄 감별
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
          PCL 자동 삭제
        </span>
        <span className="text-[10px] text-zinc-500">
          선택한 등급 미만은 슬랩 저장 없이 즉시 삭제
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

// 감별 중 NPC 대화 — 30초 주기 cycling. 과학자 페르소나.
const SCAN_LINES: string[] = [
  "흠... 모서리 정렬이 아주 깔끔하군.",
  "이 카드는 표면 광택이 살아있어. 좋아.",
  "스캔 빔 통과 — 인쇄 품질 확인 중.",
  "센터링 측정 중... 0.05mm 이내 양호.",
  "긁힘 감지... 미세하지만 등급에 영향이 있을지도.",
  "놀랍군. 이 정도 보존 상태는 흔치 않아!",
  "다음 카드 들여보내게.",
  "기계가 한 장씩 꼼꼼히 보고 있다네.",
  "잠시만, 이 색감... 한 번 더 봐야겠어.",
  "거의 다 됐다네. 조금만 기다려주게.",
];

function BulkSubmittingScreen({
  count,
  progress,
  onCancel,
}: {
  count: number;
  progress: { done: number; total: number };
  onCancel: () => void;
}) {
  // 진행 표시 — 잡 cursor / total 기반.
  const showSplit = progress.total > BULK_GRADING_MAX;
  const pct =
    progress.total > 0
      ? Math.min(100, Math.round((progress.done / progress.total) * 100))
      : 0;

  // NPC 대사 cycling — 4초 주기.
  const [lineIdx, setLineIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setLineIdx((i) => (i + 1) % SCAN_LINES.length),
      4000
    );
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex-1 min-h-0 flex flex-col p-4 md:p-6 gap-4 relative overflow-hidden">
      {/* lab background */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(closest-side at 50% 30%, rgba(168,85,247,0.35), transparent 70%), radial-gradient(closest-side at 50% 110%, rgba(56,189,248,0.18), transparent 60%)",
        }}
      />
      {[0, 0.8, 1.6].map((d, i) => (
        <span
          key={i}
          aria-hidden
          className="bulk-blip absolute inset-0 pointer-events-none"
          style={
            {
              background:
                "radial-gradient(closest-side at 50% 35%, rgba(255,255,255,0.45), rgba(255,255,255,0) 60%)",
              "--bdelay": `${d}s`,
            } as CSSProperties
          }
        />
      ))}

      {/* 스캐너 — 가짜 슬랩 카드 + 가로 레이저 sweep */}
      <div className="relative w-full max-w-[200px] mx-auto aspect-[5/7] rounded-xl border border-fuchsia-400/40 bg-gradient-to-b from-zinc-900 to-zinc-950 overflow-hidden shadow-[0_20px_44px_-20px_rgba(217,70,239,0.6)]">
        {/* fake card grid */}
        <div className="absolute inset-2 rounded-md ring-1 ring-white/10 bg-[linear-gradient(135deg,rgba(168,85,247,0.18)_0%,rgba(99,102,241,0.12)_50%,rgba(56,189,248,0.18)_100%)]">
          <span aria-hidden className="absolute inset-3 rounded ring-1 ring-white/5" />
          <div className="absolute inset-x-3 top-3 h-12 rounded ring-1 ring-white/5 bg-white/[0.04]" />
          <div className="absolute inset-x-3 bottom-3 h-3 rounded bg-white/5" />
        </div>
        {/* laser sweep — vertical scan line */}
        <span
          aria-hidden
          className="absolute inset-x-0 h-1 bg-gradient-to-b from-fuchsia-300/0 via-fuchsia-300 to-fuchsia-300/0 shadow-[0_0_20px_rgba(217,70,239,0.95)]"
          style={{
            animation: "scan-y 1.6s linear infinite",
          }}
        />
        {/* corner brackets */}
        {[
          "top-1 left-1",
          "top-1 right-1 rotate-90",
          "bottom-1 left-1 -rotate-90",
          "bottom-1 right-1 rotate-180",
        ].map((cls, i) => (
          <span
            key={i}
            aria-hidden
            className={clsx("absolute w-3 h-3 border-l-2 border-t-2 border-fuchsia-300/80", cls)}
          />
        ))}
        <style>{`@keyframes scan-y { 0% { top: 0%; opacity: 0; } 8% { opacity: 1 } 92% { opacity: 1 } 100% { top: calc(100% - 4px); opacity: 0; } }`}</style>
      </div>

      {/* NPC 대화 박스 — Pokemon-style 흰 박스 + 화살표 */}
      <div className="relative mx-auto w-full max-w-md">
        <div className="relative rounded-xl bg-white text-zinc-900 px-3 py-2.5 text-[13px] font-bold leading-snug shadow-lg">
          <span aria-hidden className="absolute -top-1 left-6 w-3 h-3 rotate-45 bg-white" />
          <span className="text-fuchsia-700/80 text-[10px] uppercase tracking-[0.18em] block mb-0.5">
            오박사
          </span>
          <span key={lineIdx} className="block animate-fade-in">
            💬 {SCAN_LINES[lineIdx]}
          </span>
        </div>
      </div>

      {/* 진행 텍스트 + 게이지 */}
      <div className="relative text-center">
        <p className="text-base md:text-lg font-bold text-white">
          <LoadingText text={`${count.toLocaleString("ko-KR")}장 감별 중`} />
        </p>
        {showSplit && (
          <p className="mt-1 text-[11px] text-amber-200/85 font-bold tabular-nums">
            진행 {progress.done.toLocaleString("ko-KR")} /{" "}
            {progress.total.toLocaleString("ko-KR")} ({pct}%)
          </p>
        )}
      </div>

      <div className="relative w-full max-w-md mx-auto h-2 rounded-full overflow-hidden bg-white/5 ring-1 ring-fuchsia-400/20">
        {showSplit ? (
          <div
            className="absolute inset-y-0 left-0 transition-[width] duration-500 ease-out"
            style={{
              width: `${pct}%`,
              backgroundImage:
                "linear-gradient(90deg, rgba(217,70,239,0.85) 0%, rgba(255,255,255,0.95) 50%, rgba(99,102,241,0.85) 100%)",
            }}
          />
        ) : (
          <div
            className="absolute inset-0 bulk-progress-pulse"
            style={{
              backgroundImage:
                "linear-gradient(90deg, rgba(217,70,239,0.15) 0%, rgba(217,70,239,0.85) 35%, rgba(255,255,255,0.95) 50%, rgba(99,102,241,0.85) 65%, rgba(99,102,241,0.15) 100%)",
            }}
          />
        )}
      </div>

      {/* 안내 — 백그라운드 진행 */}
      <p className="relative text-[11px] text-zinc-400 text-center leading-relaxed max-w-md mx-auto">
        페이지를 닫거나 다른 화면으로 이동해도 감별은 계속 진행돼요. 다시
        돌아오면 진행 상황을 이어서 볼 수 있어요.
      </p>

      {/* 취소 버튼 — 이미 처리된 카드는 유지, 잔여만 중단 */}
      <button
        type="button"
        onClick={onCancel}
        className="relative mx-auto h-9 px-4 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 text-xs font-bold"
        style={{ touchAction: "manipulation" }}
      >
        감별 중단 + 닫기
      </button>
    </div>
  );
}

/** 일괄 감별 결과 — 성공 개수 위주 단순 표시 (spec 3-1).
 *  서버가 더 이상 per-card results 배열을 반환하지 않음 → 합산 카운트
 *  4종 + 안내 문구만. 자동판매 폐기 → 자동삭제 카운트로 라벨 변경. */
function BulkResults({
  result,
  onClose,
}: {
  result: BulkGradingResult;
  onClose: () => void;
}) {
  const success = result.success_count ?? 0;
  const fail = result.fail_count ?? 0;
  const skipped = result.skipped_count ?? 0;
  const capSkipped = result.cap_skipped_count ?? 0;
  // 신규 키 우선, 구 키 fallback (마이그레이션 timing 보호).
  const autoDeleted =
    result.auto_deleted_count ?? result.auto_sold_count ?? 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto p-6 md:p-8 flex flex-col items-center justify-center text-center gap-4">
        <span aria-hidden className="text-5xl md:text-6xl">🎉</span>
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">
            감별 완료
          </p>
          <p className="mt-2 text-3xl md:text-4xl font-black text-white tabular-nums">
            성공 <span className="text-emerald-300">{success.toLocaleString("ko-KR")}</span>
            <span className="text-base text-zinc-500 font-bold"> 장</span>
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 w-full max-w-sm mt-2">
          <SummaryChip label="실패" value={fail.toLocaleString("ko-KR")} tone="rose" />
          <SummaryChip label="자동 삭제" value={autoDeleted.toLocaleString("ko-KR")} tone="amber" />
        </div>

        {capSkipped > 0 && (
          <p className="mt-2 text-[12px] text-rose-300 max-w-sm leading-snug">
            ⚠️ PCL 한도(20,000장) 초과 — {capSkipped.toLocaleString("ko-KR")}
            장은 보유 한도에 막혀 감별 못 받았어요. 카드는 지갑에 남아있어요.
          </p>
        )}
        {skipped > 0 && (
          <p className="text-[11px] text-zinc-500">
            건너뜀 {skipped.toLocaleString("ko-KR")}장 (보유 부족 / 미매칭)
          </p>
        )}
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
