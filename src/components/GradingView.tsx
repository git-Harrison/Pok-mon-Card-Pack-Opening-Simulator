"use client";

import PokeLoader, { LoadingText } from "./PokeLoader";
import type { CSSProperties, ReactNode } from "react";
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
    try {
      const w = await fetchWallet(user.id);
      setWallet(w);
    } catch (e) {
      // 일시 네트워크 장애는 조용히 무시 — 다음 ticker 가 회복.
      console.warn("[grading] fetchWallet threw:", e);
    }
  }, [user]);

  const refreshActiveJob = useCallback(async () => {
    if (!user) return;
    try {
      const job = await getActiveGradingJob(user.id);
      setActiveJob(job);
    } catch (e) {
      console.warn("[grading] getActiveGradingJob threw:", e);
    }
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

      {/* 풀 룸 래퍼 — 연구소 배경 + 스캔라인 + 부유 입자. 안에 hero +
          stations 가 lab equipment 처럼 배치. */}
      <LabRoom>
        {/* Lab hero — large NPC + speech bubble (기존, 유지) */}
        <LabHero busy={bulkOpen} />

        {/* 활성 잡 banner — 모달 닫고 페이지 다시 와도 진행 상황 보임 */}
        {activeJob && activeJob.status !== "completed" && (
          <ActiveJobBanner job={activeJob} onResume={() => setBulkOpen(true)} />
        )}

        {/* CRT 홀로그램 모니터 — 감별 대기 카드 수 표시 */}
        <HoloMonitor count={eligibleCount} />

        {/* Industrial lever 시작 버튼 */}
        <LabActionLever
          disabled={eligibleCount === 0}
          onPress={() => setBulkOpen(true)}
          label="감별 시작"
        />

        <p className="mt-3 text-[11px] text-fuchsia-200/60 text-center font-mono">
          감별 완료 슬랩 →{" "}
          <Link
            href="/wallet?tab=pcl"
            className="underline underline-offset-2 hover:text-fuchsia-300"
          >
            내 카드지갑 PCL 탭
          </Link>
        </p>
      </LabRoom>

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
/** 풀 룸 래퍼 — 연구소 분위기. SVG 책장/모니터/비커 + scanline +
 *  부유 입자 + 종이 텍스처. 내부 자식이 lab equipment 처럼 배치됨.
 *  기존 페이지 정적 박스 (GEM MINT / 자동 삭제 / 감별 한도) 통째로
 *  대체 — spec 의 "포켓몬 연구실 내부 같은 느낌" 충족. */
function LabRoom({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <div
      className="relative rounded-3xl overflow-hidden p-3 md:p-4 space-y-3 md:space-y-4"
      style={{
        background:
          "linear-gradient(180deg, #0a0814 0%, #110b22 50%, #0a0814 100%)",
        boxShadow:
          "inset 0 0 60px -12px rgba(168,85,247,0.18), 0 18px 40px -16px rgba(0,0,0,0.6)",
      }}
    >
      {/* 종이 그리드 텍스처 — graph paper 도트 */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-[0.08]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        }}
      />
      {/* 좌측 책장 SVG */}
      <svg
        aria-hidden
        viewBox="0 0 40 200"
        preserveAspectRatio="xMidYMid slice"
        shapeRendering="crispEdges"
        className="absolute left-0 top-0 h-full w-8 md:w-12 opacity-25 pointer-events-none"
      >
        <rect x="0" y="0" width="40" height="200" fill="#3a2410" />
        {Array.from({ length: 8 }).map((_, i) => (
          <g key={i} transform={`translate(0, ${10 + i * 24})`}>
            <rect x="2" y="0" width="36" height="3" fill="#7c4a18" />
            <rect x="4" y="3" width="6" height="14" fill="#9a3412" />
            <rect x="11" y="3" width="5" height="14" fill="#7c2d12" />
            <rect x="17" y="3" width="6" height="14" fill="#1e3a8a" />
            <rect x="24" y="3" width="5" height="14" fill="#581c87" />
            <rect x="30" y="3" width="6" height="14" fill="#831843" />
            <rect x="2" y="17" width="36" height="2" fill="#1a0e07" />
          </g>
        ))}
      </svg>
      {/* 우측 비커/실험기구 */}
      <svg
        aria-hidden
        viewBox="0 0 40 200"
        preserveAspectRatio="xMidYMid slice"
        shapeRendering="crispEdges"
        className="absolute right-0 top-0 h-full w-8 md:w-12 opacity-30 pointer-events-none"
      >
        {/* 비커 1 — 보라 액체 */}
        <rect x="6" y="20" width="14" height="22" fill="#1e1b4b" />
        <rect x="6" y="32" width="14" height="10" fill="#7c3aed" opacity="0.7" />
        <rect x="6" y="32" width="14" height="2" fill="#a855f7" />
        <rect x="4" y="18" width="18" height="2" fill="#52525b" />
        {/* 비커 2 — 핫핑크 */}
        <rect x="22" y="50" width="12" height="18" fill="#1f1b2e" />
        <rect x="22" y="58" width="12" height="10" fill="#9d174d" opacity="0.7" />
        <rect x="22" y="58" width="12" height="2" fill="#ec4899" />
        {/* 시험관 stand */}
        <rect x="6" y="100" width="3" height="20" fill="#3f3f46" />
        <rect x="13" y="100" width="3" height="20" fill="#3f3f46" />
        <rect x="20" y="100" width="3" height="20" fill="#3f3f46" />
        <rect x="6" y="100" width="3" height="6" fill="#22d3ee" opacity="0.8" />
        <rect x="13" y="100" width="3" height="10" fill="#fde68a" opacity="0.8" />
        <rect x="20" y="100" width="3" height="4" fill="#f472b6" opacity="0.8" />
        {/* 회로 패턴 */}
        <g stroke="#a855f7" strokeWidth="0.5" opacity="0.5">
          <path d="M5 140 H30 V160" fill="none" />
          <path d="M10 145 H25" fill="none" />
        </g>
        {Array.from({ length: 6 }).map((_, i) => (
          <rect key={i} x="6" y={150 + i * 6} width="2" height="2" fill="#22d3ee" opacity="0.7" />
        ))}
      </svg>
      {/* 스캔라인 — CRT 모니터 톤 */}
      {!reduce && (
        <div
          aria-hidden
          className="absolute inset-x-0 h-8 pointer-events-none opacity-40"
          style={{
            background:
              "linear-gradient(180deg, transparent 0%, rgba(168,85,247,0.45) 50%, transparent 100%)",
            animation: "lab-scanline 6s linear infinite",
            mixBlendMode: "screen",
          }}
        />
      )}
      <style>{`
        @keyframes lab-scanline { 0% { top: -10%; } 100% { top: 110%; } }
        @keyframes holo-flicker { 0%, 100% { opacity: 1; } 50% { opacity: 0.85; } }
        @keyframes holo-rgb {
          0%, 100% { text-shadow: 0 0 8px rgba(168,85,247,0.7), 1px 0 rgba(244,63,94,0.4), -1px 0 rgba(56,189,248,0.4); }
          50% { text-shadow: 0 0 14px rgba(168,85,247,0.9), 2px 0 rgba(244,63,94,0.5), -2px 0 rgba(56,189,248,0.5); }
        }
        @keyframes lever-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(168,85,247,0.55), 0 14px 32px -10px rgba(168,85,247,0.7); }
          50% { box-shadow: 0 0 0 8px rgba(168,85,247,0); 0 14px 32px -8px rgba(217,70,239,0.85); }
        }
      `}</style>
      {/* 부유 입자 — 실험실 먼지 */}
      {!reduce &&
        Array.from({ length: 6 }).map((_, i) => (
          <span
            key={i}
            aria-hidden
            className="absolute w-1 h-1 rounded-full bg-fuchsia-300/40 pointer-events-none"
            style={{
              left: `${15 + i * 12}%`,
              top: `${20 + (i * 17) % 60}%`,
              animation: `lab-scanline ${8 + i * 1.2}s linear infinite`,
              animationDelay: `${-i * 1.4}s`,
            }}
          />
        ))}
      <div className="relative">{children}</div>
    </div>
  );
}

/** CRT 홀로그램 모니터 — 감별 대기 카드 수 표시. RGB chromatic
 *  aberration + flicker 로 sci-fi 톤. */
function HoloMonitor({ count }: { count: number }) {
  const reduce = useReducedMotion();
  return (
    <section
      className="relative rounded-2xl overflow-hidden border-2 border-fuchsia-400/40"
      style={{
        background:
          "radial-gradient(ellipse at 50% 30%, rgba(168,85,247,0.18) 0%, rgba(15,10,35,0.95) 70%)",
        boxShadow:
          "inset 0 0 40px -8px rgba(168,85,247,0.5), 0 0 32px -10px rgba(168,85,247,0.6)",
      }}
    >
      {/* 모니터 베젤 — 모서리 도트 */}
      {[
        "top-1 left-1",
        "top-1 right-1",
        "bottom-1 left-1",
        "bottom-1 right-1",
      ].map((cls, i) => (
        <span
          key={i}
          aria-hidden
          className={clsx(
            "absolute w-1.5 h-1.5 rounded-sm bg-fuchsia-400/70",
            cls
          )}
        />
      ))}
      <div className="relative px-4 py-5 md:px-6 md:py-6 text-center">
        <p className="text-[9px] md:text-[10px] uppercase tracking-[0.32em] text-fuchsia-300/85 font-mono">
          ▮▮ DETECTION QUEUE ▮▮
        </p>
        <p
          className="mt-2 text-5xl md:text-6xl font-black tabular-nums text-fuchsia-100 leading-none"
          style={{
            fontFamily: "monospace",
            animation: reduce ? undefined : "holo-rgb 2.4s ease-in-out infinite",
            textShadow:
              "0 0 8px rgba(168,85,247,0.7), 1px 0 rgba(244,63,94,0.4), -1px 0 rgba(56,189,248,0.4)",
          }}
        >
          {count.toLocaleString("ko-KR")}
        </p>
        <p className="mt-2 text-[10px] md:text-[11px] text-fuchsia-200/70 font-mono">
          card{count !== 1 && "s"} pending — PCL eligible
        </p>
        {/* 횡단 데이터 라인 — 가짜 telemetry */}
        <div className="mt-3 grid grid-cols-3 gap-2 text-[8px] md:text-[9px] font-mono">
          <div className="px-1.5 py-1 rounded bg-fuchsia-500/10 border border-fuchsia-500/30 text-fuchsia-300/85">
            STATUS<br />
            <span className="text-emerald-300 font-bold">READY</span>
          </div>
          <div className="px-1.5 py-1 rounded bg-fuchsia-500/10 border border-fuchsia-500/30 text-fuchsia-300/85">
            SCAN RATE<br />
            <span className="text-cyan-300 font-bold">5K/CYCLE</span>
          </div>
          <div className="px-1.5 py-1 rounded bg-fuchsia-500/10 border border-fuchsia-500/30 text-fuchsia-300/85">
            STORAGE<br />
            <span className="text-amber-300 font-bold">PCL ≤ 20K</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Industrial lever 스타일 시작 버튼 — 빠른 lever-pulse 애니메이션 +
 *  도트 코너 인디케이터. disabled 면 dim. */
function LabActionLever({
  disabled,
  onPress,
  label,
}: {
  disabled: boolean;
  onPress: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      style={{
        touchAction: "manipulation",
        animation: disabled ? undefined : "lever-pulse 2.6s ease-in-out infinite",
      }}
      className={clsx(
        "relative w-full h-16 md:h-20 rounded-2xl text-base md:text-lg font-black",
        "inline-flex items-center justify-center gap-3 transition overflow-hidden",
        disabled
          ? "bg-white/5 text-zinc-500 border border-white/10 cursor-not-allowed"
          : "bg-gradient-to-br from-fuchsia-500 via-violet-500 to-indigo-500 text-white border-2 border-fuchsia-300/60 hover:scale-[1.01] active:scale-[0.98]"
      )}
    >
      {/* 좌우 LED 인디케이터 */}
      {!disabled && (
        <>
          <span
            aria-hidden
            className="absolute left-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.95)]"
          />
          <span
            aria-hidden
            className="absolute right-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.95)]"
          />
          {/* 좌우 그림자 회로 */}
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 w-2 bg-gradient-to-r from-fuchsia-300/30 to-transparent"
          />
          <span
            aria-hidden
            className="absolute inset-y-0 right-0 w-2 bg-gradient-to-l from-fuchsia-300/30 to-transparent"
          />
        </>
      )}
      <span aria-hidden className="text-2xl">🔬</span>
      <span className="font-mono tracking-[0.18em]">
        {disabled ? "NO CARDS" : label.toUpperCase()}
      </span>
      <span aria-hidden className="text-2xl">⚡</span>
    </button>
  );
}

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

// 감별 모달 phase 흐름:
//  greet     — 오박사 인사 (typewriter, 자동 전환 또는 사용자 클릭)
//  picking   — 카운트 + 자동삭제 옵션 + 시작 버튼
//  submitting — 스캐너 + 진행
//  done       — 결과 + reaction
type BulkPhase = "greet" | "picking" | "submitting" | "done";

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

  const [phase, setPhase] = useState<BulkPhase>("greet");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkGradingResult | null>(null);

  // PCL 자동 삭제 임계 — localStorage 에 영구 저장. 모달 닫았다가 다시
  // 열어도 마지막 선택 유지. (키/변수명은 호환 위해 옛 auto_sell 유지.)
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

  // GradingJob 응답이 최소 필드를 가졌는지 검증 — 서버 SQL 함수 변경/
  // 스키마 캐시 mismatch 로 일부 필드가 빠진 객체가 흘러올 때 렌더 단계에서
  // undefined.toLocaleString() 으로 throw 되는 걸 차단.
  const isJobShape = (x: unknown): x is GradingJob => {
    if (!x || typeof x !== "object") return false;
    const o = x as Record<string, unknown>;
    return (
      typeof o.job_id === "string" &&
      typeof o.status === "string" &&
      typeof o.cursor === "number" &&
      typeof o.total === "number"
    );
  };

  // 활성 잡 상태 → UI state 적용. 입력 GradingJob 이 검증된 상태에서만 호출.
  const applyJobState = useCallback(
    (job: GradingJob) => {
      // 음수/NaN 방어 — 서버가 비정상 값 보낼 때 progress bar 가 NaN% 되거나
      // toLocaleString 에서 throw 되지 않게.
      const safeCursor = Number.isFinite(job.cursor) ? Math.max(0, job.cursor) : 0;
      const safeTotal = Number.isFinite(job.total) ? Math.max(0, job.total) : 0;
      setBatchProgress({ done: safeCursor, total: safeTotal });
      if (job.status === "completed") {
        const aggregated: BulkGradingResult = {
          ok: true,
          success_count: job.success_count ?? 0,
          fail_count: job.fail_count ?? 0,
          skipped_count: job.skipped_count ?? 0,
          cap_skipped_count: job.cap_skipped_count ?? 0,
          auto_deleted_count: job.auto_deleted_count ?? 0,
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

  // 청크 폴링 루프 — 잡 완료/실패까지. 강화된 안정성:
  //  · processGradingJobChunk 가 throw 해도 (네트워크 끊김 / Supabase
  //    timeout / fetch abort) try/catch 로 catch 하고 짧은 backoff 후 재시도
  //  · 연속 실패 횟수 cap (5회) — 그 이상은 in-page 에러로 끝내고 사용자에게
  //    안내. 페이지 전체 풀스크린 에러로 빠지지 않음
  //  · 응답 shape 검증 — cursor/total/status 누락된 객체로 setState 안 함
  //  · 언마운트 / 명시적 취소 시 cancelledRef 로 즉시 종료
  const pollJob = useCallback(
    async (jobId: string) => {
      const MAX_TRANSIENT_ERRORS = 5;
      const TRANSIENT_BACKOFF_MS = 1500;
      let transientErrors = 0;

      while (!cancelledRef.current) {
        let res:
          | { ok: false; error: string }
          | (GradingJob & { ok: true })
          | undefined;
        try {
          res = await processGradingJobChunk(jobId, BULK_GRADING_MAX);
        } catch (e) {
          // 네트워크 / fetch reject 등 throw — 이전엔 unhandled rejection
          // 으로 떠서 노이즈 생겼음. 이제 transient 로 보고 재시도.
          transientErrors += 1;
          console.warn(
            `[grading] chunk fetch threw (try ${transientErrors}/${MAX_TRANSIENT_ERRORS}):`,
            e
          );
          if (transientErrors >= MAX_TRANSIENT_ERRORS) {
            if (!cancelledRef.current) {
              setError(
                "네트워크가 불안정해서 감별 진행을 잠시 멈췄어요. 잠시 후 다시 시도해주세요. (이미 처리된 카드는 보존)"
              );
              setPhase("picking");
              setActiveJobId(null);
            }
            return;
          }
          await new Promise((r) => setTimeout(r, TRANSIENT_BACKOFF_MS));
          continue;
        }

        // 명시적 server-side 실패 응답.
        if (!res || !("ok" in res) || !res.ok) {
          if (!cancelledRef.current) {
            setError(
              (res && "error" in res && res.error) || "잡 처리 실패."
            );
            setPhase("picking");
            setActiveJobId(null);
          }
          return;
        }

        // 응답 shape 검증 — server SQL 시그니처 변경 / postgrest 캐시 등으로
        // 비정상 객체 받았을 때 UI 가 박살나지 않게.
        if (!isJobShape(res)) {
          transientErrors += 1;
          console.warn(
            `[grading] chunk response shape invalid (try ${transientErrors}/${MAX_TRANSIENT_ERRORS}):`,
            res
          );
          if (transientErrors >= MAX_TRANSIENT_ERRORS) {
            if (!cancelledRef.current) {
              setError(
                "감별 응답 형식이 비정상이에요. 페이지를 한번 닫았다 다시 열어주세요. (이미 처리된 카드는 보존)"
              );
              setPhase("picking");
              setActiveJobId(null);
            }
            return;
          }
          await new Promise((r) => setTimeout(r, TRANSIENT_BACKOFF_MS));
          continue;
        }

        // 정상 응답 받았으면 카운터 리셋.
        transientErrors = 0;

        if (cancelledRef.current) return;
        applyJobState(res);

        if (res.status !== "processing" && res.status !== "pending") {
          return;
        }
        // 다음 청크 사이 짧은 휴식 — chunk 자체가 set-based 로 빨라져
        // (20260667) 250ms → 50ms 로 단축. 진행 막대 갱신은 setBatchProgress
        // 가 chunk 마다 호출돼 자연스레 부드러움.
        await new Promise((r) => setTimeout(r, 50));
      }
    },
    [applyJobState]
  );

  // mount 시 active 잡 확인 → 자동 재개. 모든 async 작업은 try/catch 로
  // 묶어서 일시 네트워크 장애가 페이지 단 에러로 번지지 않게.
  useEffect(() => {
    cancelledRef.current = false;
    let alive = true;
    (async () => {
      try {
        const active = await getActiveGradingJob(userId);
        if (!alive || !active) return;
        if (!isJobShape(active)) {
          // 서버 응답 비정상 — 조용히 무시 (이번 mount 사이클에선 재개 X).
          console.warn("[grading] getActiveGradingJob shape invalid:", active);
          return;
        }
        setActiveJobId(active.job_id);
        setBatchProgress({
          done: Number.isFinite(active.cursor) ? active.cursor : 0,
          total: Number.isFinite(active.total) ? active.total : 0,
        });
        setPhase("submitting");
        // pollJob 자체가 내부 try/catch — fire-and-forget OK.
        void pollJob(active.job_id);
      } catch (e) {
        // 여기까지 오면 logic bug — 콘솔만 남기고 페이지는 살려둠.
        console.warn("[grading] mount-effect failed:", e);
      }
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

    // enqueue 단계도 throw 가능 (네트워크 끊김) — try/catch 로 감싸서
    // 페이지 풀스크린 에러로 번지지 않게.
    let enq: Awaited<ReturnType<typeof enqueueGradingJob>>;
    try {
      enq = await enqueueGradingJob(userId, allCardIds, allRarities, autoSellBelow);
    } catch (e) {
      console.warn("[grading] enqueue threw:", e);
      setError("감별 시작 요청이 실패했어요. 잠시 후 다시 시도해주세요.");
      setPhase("picking");
      return;
    }
    if (!enq.ok || !enq.job_id) {
      setError(enq.error ?? "잡 등록 실패.");
      setPhase("picking");
      return;
    }
    setActiveJobId(enq.job_id);
    cancelledRef.current = false;
    void pollJob(enq.job_id);
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
          ) : phase === "greet" ? (
            <OakGreetPhase
              count={totalEligibleCount}
              onContinue={() => setPhase("picking")}
            />
          ) : (
            <>
              <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-5 space-y-4 lab-bg">
                {totalEligibleCount === 0 ? (
                  <OakDialogueEmpty />
                ) : (
                  <>
                    <OakGreeting count={totalEligibleCount} />
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

/** typewriter 효과 — text 를 한 글자씩 보여줌. 완료 시 onDone 호출. */
function Typewriter({
  text,
  speedMs = 32,
  onDone,
  className,
}: {
  text: string;
  speedMs?: number;
  onDone?: () => void;
  className?: string;
}) {
  const [shown, setShown] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) {
      setShown(text.length);
      onDone?.();
      return;
    }
    setShown(0);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= text.length) {
        clearInterval(id);
        onDone?.();
      }
    }, speedMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return <span className={className}>{text.slice(0, shown)}</span>;
}

/** greet phase — 오박사 인사 typewriter + 자동/수동 전환.
 *  카운트가 0 이면 picking 으로 즉시 (인사 후 카드 없음 안내 표시).
 *  카운트 있으면 typewriter 끝나고 1.5초 후 auto-advance, 또는 사용자
 *  클릭 시 즉시 picking. lab 배경 패턴 + 오박사 sprite. */
function OakGreetPhase({
  count,
  onContinue,
}: {
  count: number;
  onContinue: () => void;
}) {
  const reduce = useReducedMotion();
  const lines = useMemo(() => {
    if (count === 0) {
      return ["어이, 카드를 가져왔구먼... 어 비어있네?"];
    }
    if (count >= 5000) {
      return [
        "어서 오게! 트레이너!",
        "오... 어마어마하게 많이 가져왔구먼!",
        `${count.toLocaleString("ko-KR")}장... 정밀 감별기를 가동시키지!`,
      ];
    }
    return [
      "어서 오게! 트레이너!",
      `${count.toLocaleString("ko-KR")}장 가져왔구먼.`,
      "감별 준비를 도와주지.",
    ];
  }, [count]);

  const [lineIdx, setLineIdx] = useState(0);
  const [done, setDone] = useState(false);

  // 마지막 line 끝나면 1.5초 후 자동 전환.
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(onContinue, 1500);
    return () => clearTimeout(t);
  }, [done, onContinue]);

  const advanceLine = () => {
    if (lineIdx < lines.length - 1) {
      setLineIdx((i) => i + 1);
      setDone(false);
    } else {
      onContinue();
    }
  };

  return (
    <div
      className="flex-1 min-h-0 overflow-hidden flex flex-col items-center justify-center gap-4 p-6 relative cursor-pointer lab-bg"
      onClick={advanceLine}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") advanceLine();
      }}
    >
      <LabBackgroundPattern />
      <motion.img
        src={OAK_SPRITE}
        alt=""
        aria-hidden
        width={120}
        height={120}
        className="w-24 h-24 md:w-32 md:h-32 object-contain relative z-10"
        style={{ imageRendering: "pixelated" }}
        initial={reduce ? false : { y: -3 }}
        animate={reduce ? undefined : { y: [-3, 3, -3] }}
        transition={
          reduce ? undefined : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }
        }
      />
      <div className="relative max-w-md w-full">
        <div className="relative rounded-xl bg-white text-zinc-900 px-4 py-3 shadow-xl">
          <span aria-hidden className="absolute -top-1.5 left-8 w-3 h-3 rotate-45 bg-white" />
          <p className="text-fuchsia-700/80 text-[10px] uppercase tracking-[0.18em] font-black mb-1">
            오박사
          </p>
          <p className="text-[14px] md:text-[15px] font-bold leading-snug min-h-[3em]">
            💬{" "}
            <Typewriter
              key={lineIdx}
              text={lines[lineIdx]}
              speedMs={32}
              onDone={() => {
                if (lineIdx < lines.length - 1) {
                  // 다음 라인으로 자동 전환 (0.6초 호흡).
                  setTimeout(() => {
                    setLineIdx((i) => i + 1);
                    setDone(false);
                  }, 600);
                } else {
                  setDone(true);
                }
              }}
            />
          </p>
          <p className="mt-2 text-[10px] text-zinc-500 text-right">
            {done ? "잠시 후 자동 진행..." : "▼ 화면을 눌러 건너뛰기"}
          </p>
        </div>
      </div>
    </div>
  );
}

/** lab 배경 패턴 — 도트 책상/책장/화학기구 실루엣. SVG inline.
 *  parent 가 relative + lab-bg 클래스 가져야 절대 위치 작동. */
function LabBackgroundPattern() {
  return (
    <>
      <style>{`
        .lab-bg {
          background-image:
            linear-gradient(180deg, rgba(168,85,247,0.06) 0%, rgba(99,102,241,0.04) 100%),
            radial-gradient(circle at 20% 80%, rgba(168,85,247,0.15) 0%, transparent 50%),
            radial-gradient(circle at 80% 30%, rgba(56,189,248,0.10) 0%, transparent 50%);
        }
      `}</style>
      <svg
        aria-hidden
        viewBox="0 0 200 100"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full pointer-events-none opacity-30"
        shapeRendering="crispEdges"
      >
        {/* 책장 — 좌측 */}
        <rect x="2" y="20" width="14" height="60" fill="#3a2410" stroke="#1a0e07" strokeWidth="0.5" />
        <rect x="3" y="22" width="12" height="3" fill="#7c4a18" />
        <rect x="3" y="27" width="12" height="3" fill="#9a6028" />
        <rect x="3" y="32" width="12" height="3" fill="#7c4a18" />
        <rect x="3" y="37" width="12" height="3" fill="#9a6028" />
        <rect x="3" y="42" width="12" height="3" fill="#7c4a18" />
        <rect x="3" y="47" width="12" height="3" fill="#5a3a18" />
        {/* 화학 비커 — 우측 */}
        <rect x="180" y="40" width="6" height="14" fill="#1e3a8a" opacity="0.6" />
        <rect x="180" y="52" width="6" height="2" fill="#7cc4ff" opacity="0.8" />
        <rect x="188" y="45" width="4" height="9" fill="#9d174d" opacity="0.5" />
        <rect x="188" y="51" width="4" height="3" fill="#ec4899" opacity="0.7" />
        {/* 책상 라인 — 하단 */}
        <rect x="0" y="90" width="200" height="3" fill="#3a2410" opacity="0.5" />
        <rect x="0" y="93" width="200" height="1" fill="#1a0e07" opacity="0.7" />
        {/* 점 도트 — 천장 */}
        {[10, 30, 50, 70, 90, 110, 130, 150, 170, 190].map((x, i) => (
          <rect key={i} x={x} y="4" width="1" height="1" fill="#fde68a" />
        ))}
      </svg>
    </>
  );
}

/** 감별 모달 picking 단계 — 오박사 인사 + 카운트 정보 통합 카드.
 *  count 에 따라 라인 톤 변화 (작으면 친절, 많으면 놀람). */
function OakGreeting({ count }: { count: number }) {
  const reduce = useReducedMotion();
  const lines = useMemo(() => {
    if (count >= 5000) {
      return [
        "어이쿠 — 카드가 산더미군! 한 번에 다 봐주지.",
        `${count.toLocaleString("ko-KR")}장 감별 시작할까?`,
      ];
    }
    if (count >= 100) {
      return [
        "꽤 모았구먼! 자, 기계 앞으로 가져와 보게.",
        `${count.toLocaleString("ko-KR")}장 감별 시작 준비.`,
      ];
    }
    return [
      "어서 오게! 카드를 가져왔구먼.",
      `${count.toLocaleString("ko-KR")}장 감별 준비됐다네.`,
    ];
  }, [count]);

  return (
    <div className="rounded-2xl border border-fuchsia-400/30 bg-gradient-to-br from-fuchsia-500/10 via-violet-500/8 to-indigo-500/10 p-3 md:p-4">
      <div className="flex items-start gap-3">
        <motion.img
          src={OAK_SPRITE}
          alt=""
          aria-hidden
          width={56}
          height={56}
          className="shrink-0 w-14 h-14 object-contain"
          style={{ imageRendering: "pixelated" }}
          initial={reduce ? false : { y: -2 }}
          animate={reduce ? undefined : { y: [-2, 1, -2] }}
          transition={
            reduce ? undefined : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }
          }
        />
        <div className="relative flex-1 min-w-0">
          <span className="text-[10px] uppercase tracking-[0.18em] text-fuchsia-200/85 font-black">
            오박사
          </span>
          <div className="relative mt-1 rounded-xl bg-white text-zinc-900 px-3 py-2 text-[12px] md:text-[13px] font-bold leading-snug shadow-md">
            <span
              aria-hidden
              className="absolute -left-1.5 top-3 w-3 h-3 rotate-45 bg-white"
            />
            <p>💬 {lines[0]}</p>
            <p className="mt-1 text-zinc-700">{lines[1]}</p>
          </div>
          <div className="mt-2 text-[10px] text-fuchsia-200/70 leading-relaxed">
            {count > BULK_GRADING_MAX
              ? `5,000장씩 자동 분할로 처리한다네. 페이지 떠도 작업은 계속.`
              : `실패 시 카드는 사라져. 감별 확률은 단일 감별과 동일.`}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 감별할 카드 0장 — 박스 열어 모으라 안내. NPC 톤. */
function OakDialogueEmpty() {
  return (
    <div className="rounded-2xl border border-zinc-700/60 bg-zinc-900/40 p-3 md:p-4">
      <div className="flex items-start gap-3">
        <img
          src={OAK_SPRITE}
          alt=""
          aria-hidden
          width={56}
          height={56}
          className="shrink-0 w-14 h-14 object-contain opacity-80"
          style={{ imageRendering: "pixelated" }}
        />
        <div className="relative flex-1 min-w-0">
          <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-400 font-black">
            오박사
          </span>
          <div className="relative mt-1 rounded-xl bg-white text-zinc-900 px-3 py-2 text-[12px] md:text-[13px] font-bold leading-snug shadow-md">
            <span aria-hidden className="absolute -left-1.5 top-3 w-3 h-3 rotate-45 bg-white" />
            <p>💬 어, 카드가 없구먼?</p>
            <p className="mt-1 text-zinc-700">박스를 열어 카드를 모아 온 뒤 다시 들리게나.</p>
          </div>
        </div>
      </div>
    </div>
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

/** 일괄 감별 결과 — 성공 + 자동 삭제 동등 노출 (자동 삭제 옵션 활성 시).
 *
 *  배경: "PCL10 미만 삭제" 옵션을 켜면 서버가 등급 6~9 카드를 auto_deleted
 *  카운터로, PCL10 만 success 카운터로 분리한다. 사용자 시각엔 "감별이
 *  처리됐는데 성공 0 장만 크게 노출돼서 작업이 안 된 것처럼 보임" 이슈가
 *  있었음. 자동 삭제가 발생한 경우엔 success 옆에 자동 삭제도 동등 비중
 *  으로 노출, 헤드라인 / 이모지 / NPC 대사도 모드별로 분기. */
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
  const autoDeleted = result.auto_deleted_count ?? 0;
  const cleanupMode = autoDeleted > 0;

  // NPC 대사 — 자동삭제 모드 / 일반 모드 / 실패만 / 압승 등 케이스 분기.
  const total = success + fail;
  const successRate = total > 0 ? success / total : 0;
  const oakLine = (() => {
    if (cleanupMode && success === 0) {
      return `정리 완료! 미만 등급 ${autoDeleted.toLocaleString(
        "ko-KR"
      )}장 처분했다네.`;
    }
    if (cleanupMode && success > 0) {
      return `슬랩 ${success.toLocaleString(
        "ko-KR"
      )}장 + 정리 ${autoDeleted.toLocaleString("ko-KR")}장 — 깔끔하게 끝났군!`;
    }
    if (success === 0 && fail > 0) {
      return "음... 이번엔 운이 좋지 않았군. 다음에 다시 도전하게.";
    }
    if (success >= 50) {
      return `대단하군! ${success.toLocaleString("ko-KR")}장이나 성공이라니!`;
    }
    if (successRate >= 0.4) {
      return "꽤 괜찮은 결과야. 잘 해냈군.";
    }
    return "수고했네. 카드 상태가 들쭉날쭉했군 그래.";
  })();

  // 이모지 — cleanup 모드일 땐 빗자루, 성공 있으면 파티, 아무것도 없으면 검색.
  const emoji = cleanupMode ? "🧹" : success === 0 ? "🔍" : "🎉";

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto p-6 md:p-8 flex flex-col items-center justify-center text-center gap-4">
        <span aria-hidden className="text-5xl md:text-6xl">
          {emoji}
        </span>

        {/* 오박사 reaction 말풍선 */}
        <div className="relative max-w-sm mx-auto rounded-xl bg-white text-zinc-900 px-3 py-2 text-[13px] font-bold leading-snug shadow-md">
          <span aria-hidden className="absolute -top-1.5 left-6 w-3 h-3 rotate-45 bg-white" />
          <span className="text-fuchsia-700/80 text-[10px] uppercase tracking-[0.18em] block mb-0.5">
            오박사
          </span>
          💬 {oakLine}
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">
            감별 완료
          </p>
          {cleanupMode ? (
            // 자동 삭제 옵션 활성 — PCL 슬랩 + 자동 삭제 동등 비중으로 노출.
            // 이전엔 "성공 N장" 헤드라인만 크게 떠서 PCL10 (~0.3%) 만 잡힐 때
            // 사용자가 "감별이 처리 안 됐다" 고 오해하는 이슈 있었음.
            <div className="mt-2 flex items-center justify-center gap-3 md:gap-4">
              <div className="flex flex-col items-center">
                <span className="text-[9px] uppercase tracking-[0.18em] text-emerald-300/70 font-bold">
                  PCL 슬랩
                </span>
                <span className="text-2xl md:text-3xl font-black text-emerald-300 tabular-nums leading-tight">
                  {success.toLocaleString("ko-KR")}
                  <span className="text-sm text-emerald-400/60 font-bold ml-0.5">
                    장
                  </span>
                </span>
              </div>
              <span aria-hidden className="text-zinc-600 text-2xl">
                +
              </span>
              <div className="flex flex-col items-center">
                <span className="text-[9px] uppercase tracking-[0.18em] text-amber-300/70 font-bold">
                  자동 삭제
                </span>
                <span className="text-2xl md:text-3xl font-black text-amber-300 tabular-nums leading-tight">
                  {autoDeleted.toLocaleString("ko-KR")}
                  <span className="text-sm text-amber-400/60 font-bold ml-0.5">
                    장
                  </span>
                </span>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-3xl md:text-4xl font-black text-white tabular-nums">
              성공{" "}
              <span className="text-emerald-300">
                {success.toLocaleString("ko-KR")}
              </span>
              <span className="text-base text-zinc-500 font-bold"> 장</span>
            </p>
          )}
        </div>

        {cleanupMode ? (
          // cleanup 모드: 실패만 칩으로 (자동 삭제는 헤드라인에서 이미 노출).
          <div className="w-full max-w-sm mt-2">
            <SummaryChip
              label="실패"
              value={fail.toLocaleString("ko-KR")}
              tone="rose"
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 w-full max-w-sm mt-2">
            <SummaryChip
              label="실패"
              value={fail.toLocaleString("ko-KR")}
              tone="rose"
            />
            <SummaryChip
              label="자동 삭제"
              value={autoDeleted.toLocaleString("ko-KR")}
              tone="amber"
            />
          </div>
        )}

        {capSkipped > 0 && (
          <p className="mt-2 text-[12px] text-rose-300 max-w-sm leading-snug">
            ⚠️ PCL 한도(50,000장) 초과 — {capSkipped.toLocaleString("ko-KR")}
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
