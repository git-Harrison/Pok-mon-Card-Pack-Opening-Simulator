"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { WildType } from "@/lib/wild/types";
import { TYPE_STYLE } from "@/lib/wild/types";
import Portal from "./Portal";
import { lockBodyScroll } from "@/lib/useBodyScrollLock";

export type NpcTone =
  | "greeting"   // 그냥 인사 — 가벼운 분위기
  | "taunt"      // 전투력 부족 도발 — 화남
  | "prebattle"  // 도전 수락 — 긴장
  | "victory"    // 도전자 승리 — 관장 패배 인정
  | "defeat";    // 도전자 패배 — 관장 가벼운 도발

const TONE_STYLE: Record<
  NpcTone,
  {
    label: string;
    badge: string;
    primaryClass: string;
    primaryDefault: string;
    closeLabel: string;
    spriteAnim: "bob" | "shake" | "pump" | "sad" | "pulse";
  }
> = {
  greeting: {
    label: "인사",
    badge: "bg-emerald-500/20 text-emerald-200 border border-emerald-500/40",
    primaryClass:
      "bg-gradient-to-r from-emerald-500 to-teal-500 text-zinc-950 font-bold",
    primaryDefault: "안녕히 계세요",
    closeLabel: "닫기",
    spriteAnim: "bob",
  },
  taunt: {
    label: "도발",
    badge: "bg-rose-500/20 text-rose-200 border border-rose-500/40",
    primaryClass: "bg-white/10 border border-white/15 text-white font-bold",
    primaryDefault: "물러난다",
    closeLabel: "닫기",
    spriteAnim: "shake",
  },
  prebattle: {
    label: "도전 수락",
    badge: "bg-amber-500/20 text-amber-200 border border-amber-500/40",
    primaryClass:
      "bg-gradient-to-r from-rose-500 to-amber-500 text-zinc-950 font-black",
    primaryDefault: "정정당당히 받아주마!",
    closeLabel: "물러나기",
    spriteAnim: "pump",
  },
  victory: {
    label: "체육관 정복",
    badge: "bg-amber-500/20 text-amber-200 border border-amber-500/40",
    primaryClass:
      "bg-gradient-to-r from-amber-500 to-orange-500 text-zinc-950 font-black",
    primaryDefault: "체육관을 차지한다!",
    closeLabel: "닫기",
    spriteAnim: "sad",
  },
  defeat: {
    label: "패배",
    badge: "bg-rose-500/20 text-rose-200 border border-rose-500/40",
    primaryClass: "bg-white/10 border border-white/15 text-white font-bold",
    primaryDefault: "다시 강해져서 오겠다",
    closeLabel: "닫기",
    spriteAnim: "pulse",
  },
};

interface Props {
  type: WildType;
  leaderName: string;
  gymName: string;
  tone: NpcTone;
  line: string;
  onClose: () => void;
  /** Optional primary CTA. typewriter 끝나기 전엔 자동 disabled. */
  onPrimary?: () => void;
  primaryLabel?: string;
  /** Auto-close 시간 — 지정 시 typewriter 후 N ms 뒤 자동 onClose. */
  autoCloseMs?: number;
  /** sprite/말풍선 아래 추가 컨텐츠 — 점수/보상 표시 등. */
  children?: React.ReactNode;
}

export default function NpcDialogModal({
  type,
  leaderName,
  gymName,
  tone,
  line,
  onClose,
  onPrimary,
  primaryLabel,
  autoCloseMs,
  children,
}: Props) {
  const reduce = useReducedMotion();
  const ts = TONE_STYLE[tone];
  const typeStyle = TYPE_STYLE[type];

  // ── Typewriter ────────────────────────────────────────────
  const [shown, setShown] = useState(0);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (reduce) {
      setShown(line.length);
      setDone(true);
      return;
    }
    setShown(0);
    setDone(false);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= line.length) {
        clearInterval(id);
        setDone(true);
      }
    }, 32);
    return () => clearInterval(id);
  }, [line, reduce]);

  // ── Auto close ────────────────────────────────────────────
  useEffect(() => {
    if (!done || !autoCloseMs) return;
    const id = setTimeout(onClose, autoCloseMs);
    return () => clearTimeout(id);
  }, [done, autoCloseMs, onClose]);

  // ── ESC + body lock ───────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const releaseLock = lockBodyScroll();
    return () => {
      window.removeEventListener("keydown", onKey);
      releaseLock();
    };
  }, [onClose]);

  // sprite 모션 — tone별
  const spriteAnim = (() => {
    if (reduce) return undefined;
    switch (ts.spriteAnim) {
      case "bob":   return { y: [0, -2, 0] };
      case "shake": return { x: [0, -2, 2, -2, 0] };
      case "pump":  return { y: [0, -3, 0], scale: [1, 1.05, 1] };
      case "sad":   return { y: [0, 1.5, 0], rotate: [0, -2, 0] };
      case "pulse": return { scale: [1, 0.96, 1] };
    }
  })();
  const spriteAnimDuration =
    ts.spriteAnim === "shake" ? 0.32 :
    ts.spriteAnim === "pump"  ? 1.0 :
    ts.spriteAnim === "pulse" ? 1.4 :
    1.6;

  // 글자 클릭 시 즉시 완료 (UX — 빨리 보고 싶은 경우)
  const skipTyping = () => {
    if (!done) {
      setShown(line.length);
      setDone(true);
    }
  };

  return (
    <Portal>
      <motion.div
        className="fixed inset-0 z-[140] bg-black/85 backdrop-blur-sm flex items-center justify-center px-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className={clsx(
            "relative w-full max-w-sm rounded-2xl overflow-hidden",
            "bg-gradient-to-br from-zinc-900 to-zinc-950 border border-white/10"
          )}
          onClick={(e) => e.stopPropagation()}
          initial={reduce ? false : { y: 16, opacity: 0, scale: 0.96 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { y: 16, opacity: 0 }}
          transition={{ duration: 0.32, ease: "easeOut" }}
        >
          {/* type halo */}
          <span
            aria-hidden
            className={clsx(
              "absolute inset-0 opacity-25 pointer-events-none",
              typeStyle?.glow
            )}
          />

          {/* tone-specific decorative layer */}
          <ToneFx tone={tone} reduce={reduce ?? false} />

          {/* Header */}
          <div className="relative px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span
                className={clsx(
                  "px-1.5 py-0.5 rounded-full text-[10px] font-black tracking-wide uppercase",
                  ts.badge
                )}
              >
                {ts.label}
              </span>
              <span className="text-[10px] text-zinc-400 truncate">
                ▍{gymName}
              </span>
            </div>
            <p className="mt-0.5 text-base font-black text-white truncate">
              관장 {leaderName}
            </p>
          </div>

          {/* Body — sprite + bubble */}
          <div className="relative p-4 flex items-start gap-3" onClick={skipTyping}>
            <motion.div
              className="shrink-0"
              animate={spriteAnim}
              transition={{
                duration: spriteAnimDuration,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <NpcMoodSprite type={type} tone={tone} />
            </motion.div>
            <div className="min-w-0 flex-1">
              <div className="relative rounded-xl bg-white text-zinc-900 px-3 py-2.5 text-[13px] font-bold leading-snug min-h-[3rem]">
                <span>{line.slice(0, shown)}</span>
                {!done && (
                  <span className="inline-block ml-0.5 w-[2px] h-[14px] bg-zinc-700 align-middle animate-pulse" />
                )}
                {/* 말풍선 꼬리 */}
                <span
                  aria-hidden
                  className="absolute top-3 -left-1.5 w-0 h-0 border-y-[6px] border-y-transparent border-r-[7px] border-r-white"
                />
              </div>
              {children && <div className="mt-2">{children}</div>}
            </div>
          </div>

          {/* CTA */}
          <div className="border-t border-white/10 p-3 grid grid-cols-1 gap-2">
            {onPrimary && (
              <button
                type="button"
                onClick={() => done && onPrimary()}
                disabled={!done}
                style={{ touchAction: "manipulation" }}
                className={clsx(
                  "w-full h-11 rounded-xl text-sm active:scale-[0.98] transition-opacity",
                  done
                    ? ts.primaryClass
                    : "bg-white/5 border border-white/10 text-zinc-500 cursor-wait opacity-70"
                )}
              >
                {primaryLabel ?? ts.primaryDefault}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              style={{ touchAction: "manipulation" }}
              className="w-full h-11 rounded-xl bg-white/5 border border-white/10 text-white/80 text-sm font-bold active:scale-[0.98]"
            >
              {ts.closeLabel}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </Portal>
  );
}

/* ─────────────── Mood sprite ─────────────── */
/** 기존 NpcSprite + tone 별 표정/액션 변형. */
function NpcMoodSprite({ type, tone }: { type: WildType; tone: NpcTone }) {
  // 모자 색은 타입과 어울리게.
  const HAT_BY_TYPE: Partial<Record<WildType, string>> = {
    풀: "#16a34a", 물: "#0284c7", 불꽃: "#ea580c", 전기: "#eab308",
    얼음: "#22d3ee", 격투: "#b91c1c", 독: "#9333ea", 땅: "#b45309",
    비행: "#818cf8", 에스퍼: "#ec4899", 벌레: "#65a30d", 바위: "#78716c",
    고스트: "#6d28d9", 드래곤: "#4338ca", 악: "#27272a", 강철: "#475569",
    페어리: "#f472b6", 노말: "#a1a1aa",
  };
  const hat = HAT_BY_TYPE[type] ?? "#dc2626";
  return (
    <svg
      viewBox="0 0 24 24"
      width={64}
      height={64}
      shapeRendering="crispEdges"
      aria-hidden
    >
      {/* 모자 */}
      <rect x="6" y="3" width="12" height="2" fill={hat} />
      <rect x="5" y="5" width="14" height="1" fill="#3f3f46" />
      <rect x="9" y="6" width="6"  height="1" fill="#fbbf24" />
      {/* 머리 */}
      <rect x="8" y="6" width="8" height="6" fill="#fde68a" />
      {/* 눈 — tone 에 따라 */}
      {tone === "defeat" ? (
        <>
          {/* X 자 */}
          <rect x="9"  y="8" width="2" height="1" fill="#0f172a" />
          <rect x="13" y="8" width="2" height="1" fill="#0f172a" />
        </>
      ) : tone === "taunt" ? (
        <>
          {/* 화난 눈 */}
          <rect x="8"  y="8" width="2" height="1" fill="#7f1d1d" />
          <rect x="14" y="8" width="2" height="1" fill="#7f1d1d" />
          <rect x="9"  y="9" width="1" height="1" fill="#0f172a" />
          <rect x="14" y="9" width="1" height="1" fill="#0f172a" />
        </>
      ) : tone === "victory" ? (
        <>
          {/* 슬픈 눈 — 패배 인정 */}
          <rect x="9"  y="8" width="1" height="2" fill="#0f172a" />
          <rect x="14" y="8" width="1" height="2" fill="#0f172a" />
        </>
      ) : (
        <>
          {/* 기본 눈 */}
          <rect x="9"  y="8" width="1" height="1" fill="#0f172a" />
          <rect x="14" y="8" width="1" height="1" fill="#0f172a" />
        </>
      )}
      {/* 입 */}
      {tone === "victory" && (
        // 처진 입 (관장이 패배함)
        <>
          <rect x="10" y="11" width="4" height="1" fill="#7f1d1d" />
          <rect x="9"  y="10" width="1" height="1" fill="#7f1d1d" />
          <rect x="14" y="10" width="1" height="1" fill="#7f1d1d" />
        </>
      )}
      {tone === "defeat" && (
        // 웃는 입 (관장이 도전자 승리하는데 도전자가 패배 = 관장 웃음)
        <>
          <rect x="10" y="10" width="4" height="1" fill="#7f1d1d" />
          <rect x="9"  y="11" width="1" height="1" fill="#7f1d1d" />
          <rect x="14" y="11" width="1" height="1" fill="#7f1d1d" />
        </>
      )}
      {tone === "taunt" && (
        // 외치는 입
        <>
          <rect x="10" y="10" width="4" height="2" fill="#7f1d1d" />
          <rect x="11" y="11" width="2" height="1" fill="#fee2e2" />
        </>
      )}
      {tone === "prebattle" && (
        <rect x="10" y="10" width="4" height="1" fill="#7f1d1d" />
      )}
      {tone === "greeting" && (
        <>
          <rect x="11" y="10" width="2" height="1" fill="#7f1d1d" />
        </>
      )}
      {/* 몸 */}
      <rect x="6" y="12" width="12" height="6" fill={hat} />
      <rect x="6" y="12" width="12" height="1" fill="#3f3f46" />
      <rect x="11" y="13" width="2" height="4" fill="#fbbf24" />
      {/* 팔 — pump tone 이면 위로 */}
      {tone === "prebattle" ? (
        <>
          <rect x="3"  y="9"  width="2" height="4" fill="#fde68a" />
          <rect x="19" y="9"  width="2" height="4" fill="#fde68a" />
        </>
      ) : (
        <>
          <rect x="4"  y="13" width="2" height="4" fill="#fde68a" />
          <rect x="18" y="13" width="2" height="4" fill="#fde68a" />
        </>
      )}
      {/* 다리 */}
      <rect x="8"  y="18" width="3" height="4" fill="#1e3a8a" />
      <rect x="13" y="18" width="3" height="4" fill="#1e3a8a" />
      {/* 신발 */}
      <rect x="7"  y="22" width="4" height="1" fill="#0f172a" />
      <rect x="13" y="22" width="4" height="1" fill="#0f172a" />
    </svg>
  );
}

/* ─────────────── Tone-specific decorative FX ─────────────── */
function ToneFx({ tone, reduce }: { tone: NpcTone; reduce: boolean }) {
  if (reduce) return null;
  if (tone === "victory") return <Confetti />;
  if (tone === "defeat") return <Smoke />;
  if (tone === "taunt") return <AngerLines />;
  if (tone === "prebattle") return <BattleGlow />;
  return <FriendlyDots />;
}

function Confetti() {
  const colors = ["#fbbf24", "#f472b6", "#34d399", "#60a5fa", "#a78bfa", "#fde047"];
  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden">
      {Array.from({ length: 18 }).map((_, i) => (
        <motion.span
          key={i}
          className="absolute rounded-sm"
          style={{
            left: `${(i * 7.31) % 100}%`,
            top: "-8%",
            width: 6,
            height: 10,
            backgroundColor: colors[i % colors.length],
          }}
          animate={{ y: ["0%", "640%"], rotate: [0, 720] }}
          transition={{
            duration: 2 + (i % 5) * 0.35,
            repeat: Infinity,
            delay: (i % 9) * 0.18,
            ease: "easeIn",
          }}
        />
      ))}
    </div>
  );
}

function Smoke() {
  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden">
      {Array.from({ length: 7 }).map((_, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full bg-zinc-500/25 blur-md"
          style={{
            left: `${10 + i * 13}%`,
            bottom: "8%",
            width: 36,
            height: 36,
          }}
          animate={{ y: ["0%", "-220%"], opacity: [0.45, 0] }}
          transition={{
            duration: 2.6 + (i % 3) * 0.4,
            repeat: Infinity,
            delay: i * 0.35,
            ease: "easeOut",
          }}
        />
      ))}
    </div>
  );
}

function AngerLines() {
  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none">
      {Array.from({ length: 8 }).map((_, i) => (
        <motion.span
          key={i}
          className="absolute bg-rose-300/70"
          style={{
            top: `${10 + (i * 13) % 70}%`,
            left: `${10 + (i * 17) % 80}%`,
            width: 14,
            height: 2,
            transform: `rotate(${i * 33}deg)`,
          }}
          animate={{ opacity: [0, 1, 0], scaleX: [0.4, 1.3, 0.4] }}
          transition={{
            duration: 0.55,
            repeat: Infinity,
            delay: i * 0.07,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

function BattleGlow() {
  return (
    <motion.div
      aria-hidden
      className="absolute inset-0 pointer-events-none"
      style={{
        background:
          "radial-gradient(circle at 50% 45%, rgba(251,191,36,0.22) 0%, transparent 60%)",
      }}
      animate={{ opacity: [0.55, 1, 0.55] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

function FriendlyDots() {
  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none">
      {Array.from({ length: 8 }).map((_, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full bg-emerald-300/40"
          style={{
            top: `${20 + (i * 11) % 60}%`,
            left: `${15 + (i * 19) % 70}%`,
            width: 4,
            height: 4,
          }}
          animate={{ opacity: [0.25, 0.85, 0.25], scale: [1, 1.5, 1] }}
          transition={{
            duration: 2,
            repeat: Infinity,
            delay: i * 0.22,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}
