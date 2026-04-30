"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { fetchMyStarter, pickMyStarter, type MyStarter } from "@/lib/db";
import {
  PokemonSprite,
  STARTER_LIST,
  STARTER_META,
  type StarterSpecies,
} from "./icons/PokemonSprites";
import PokeLoader from "./PokeLoader";

/* ─────────── 확률 ───────────
   뮤츠 5%, 뮤 10%, 나머지 85% 를 기본 8마리에 균등 분배(약 10.625% 씩).
*/
const SUPER_RATE = 5; // mewtwo
const RARE_RATE = 10; // mew

function rollOnce(): StarterSpecies {
  const r = Math.random() * 100;
  if (r < SUPER_RATE) return "mewtwo";
  if (r < SUPER_RATE + RARE_RATE) return "mew";
  const idx = Math.floor(Math.random() * STARTER_LIST.length);
  return STARTER_LIST[idx]!;
}

/* ─────────── 페이즈 ─────────── */
type Phase =
  | "loading" // 서버에서 starter 조회 중
  | "owned" // 이미 정한 포켓몬이 있음
  | "intro" // 첫 진입 — 뽑기 전
  | "throwing" // 볼 던지는 중
  | "wobble" // 바닥에서 흔들리는 중
  | "reveal" // 캐릭터 등장
  | "between" // 결과 확인 + 다시뽑기/선택
  | "naming" // 선택 후 이름 입력
  | "saving" // 저장 중
  | "done"; // 저장 완료 → owned 로 전이

const MAX_ROLLS = 5;

interface RollResult {
  index: number; // 1..5
  species: StarterSpecies;
}

export default function MyPokemonView() {
  const { user } = useAuth();
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("loading");
  const [starter, setStarter] = useState<MyStarter | null>(null);
  const [rolls, setRolls] = useState<RollResult[]>([]);
  const [currentSpecies, setCurrentSpecies] = useState<StarterSpecies | null>(
    null
  );
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  const [nickname, setNickname] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  // 서버에서 기존 starter 조회
  useEffect(() => {
    if (!user) return;
    let alive = true;
    fetchMyStarter(user.id).then((s) => {
      if (!alive) return;
      if (s) {
        setStarter(s);
        setPhase("owned");
      } else {
        setPhase("intro");
      }
    });
    return () => {
      alive = false;
    };
  }, [user]);

  /* ─────────── 던지기 시퀀스 ─────────── */
  const throwTimers = useRef<number[]>([]);
  const clearTimers = useCallback(() => {
    throwTimers.current.forEach((id) => clearTimeout(id));
    throwTimers.current = [];
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  const startThrow = useCallback(() => {
    if (rolls.length >= MAX_ROLLS) return;
    if (phase !== "intro" && phase !== "between") return;
    clearTimers();
    const result = rollOnce();
    setCurrentSpecies(result);
    setPhase("throwing");

    const t1 = window.setTimeout(() => setPhase("wobble"), reduce ? 200 : 700);
    const t2 = window.setTimeout(() => setPhase("reveal"), reduce ? 600 : 2200);
    const t3 = window.setTimeout(() => {
      setRolls((prev) => [...prev, { index: prev.length + 1, species: result }]);
      setPhase("between");
    }, reduce ? 1100 : 3500);
    throwTimers.current = [t1, t2, t3];
  }, [phase, rolls.length, reduce, clearTimers]);

  /* ─────────── 선택 → 이름짓기 ─────────── */
  const startNaming = useCallback((idx: number) => {
    setPickedIdx(idx);
    setNickname("");
    setSaveError(null);
    setPhase("naming");
  }, []);

  const cancelNaming = useCallback(() => {
    setPickedIdx(null);
    setSaveError(null);
    setPhase("between");
  }, []);

  const confirmName = useCallback(async () => {
    if (!user || pickedIdx == null) return;
    const r = rolls[pickedIdx];
    if (!r) return;
    const trimmed = nickname.trim();
    if (!trimmed) {
      setSaveError("이름을 입력해주세요.");
      return;
    }
    if (trimmed.length > 12) {
      setSaveError("이름은 12자 이하로 적어주세요.");
      return;
    }
    setSaveError(null);
    setPhase("saving");
    const res = await pickMyStarter(user.id, r.species, trimmed);
    if (!res.ok) {
      setSaveError(res.error ?? "저장에 실패했어요.");
      setPhase("naming");
      if (res.starter) {
        setStarter(res.starter);
        setPhase("owned");
      }
      return;
    }
    setStarter(res.starter ?? null);
    setPhase("done");
    window.setTimeout(() => setPhase("owned"), reduce ? 400 : 1700);
  }, [user, pickedIdx, rolls, nickname, reduce]);

  /* ─────────── 렌더 ─────────── */
  if (phase === "loading") {
    return (
      <div className="relative min-h-[calc(100dvh-12rem)] flex items-center justify-center">
        <PokeLoader size="lg" label="내 포켓몬 불러오는 중" />
      </div>
    );
  }

  if (phase === "owned" && starter) {
    return <OwnedView starter={starter} />;
  }

  return (
    <div className="relative max-w-md mx-auto px-4 py-3 md:py-6">
      {/* 헤더 — 진행 상황 */}
      <header className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
            내 첫 포켓몬
          </p>
          <h1 className="text-lg font-black text-white">함께할 친구를 찾자</h1>
        </div>
        <RollsLeftBadge used={rolls.length} max={MAX_ROLLS} />
      </header>

      {/* 무대 — 항상 같은 높이라 페이즈 전환 시 jump 없음 */}
      <Stage
        phase={phase}
        currentSpecies={currentSpecies}
        rollsCount={rolls.length}
        onThrow={startThrow}
        onPick={(idx) => startNaming(idx)}
        rolls={rolls}
        reduce={reduce ?? false}
      />

      {/* 확률 안내 */}
      <RarityNotice />

      {/* 결과 리스트 */}
      {rolls.length > 0 && phase !== "naming" && (
        <RollsList
          rolls={rolls}
          onPick={(idx) => startNaming(idx)}
          disabled={phase !== "between"}
        />
      )}

      {/* 이름짓기 모달 */}
      <AnimatePresence>
        {phase === "naming" && pickedIdx != null && rolls[pickedIdx] && (
          <NamingPanel
            species={rolls[pickedIdx]!.species}
            value={nickname}
            onChange={setNickname}
            onCancel={cancelNaming}
            onConfirm={confirmName}
            error={saveError}
          />
        )}
        {phase === "saving" && pickedIdx != null && rolls[pickedIdx] && (
          <SavingOverlay species={rolls[pickedIdx]!.species} nickname={nickname} />
        )}
        {phase === "done" && starter && <DoneOverlay starter={starter} />}
      </AnimatePresence>
    </div>
  );
}

/* ─────────── 남은 횟수 뱃지 ─────────── */
function RollsLeftBadge({ used, max }: { used: number; max: number }) {
  const left = max - used;
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-wider text-zinc-400">
        남은 뽑기
      </div>
      <div
        className={clsx(
          "text-base font-black tabular-nums",
          left === 0 ? "text-rose-400" : "text-amber-300"
        )}
      >
        {left}
        <span className="text-zinc-500 text-xs font-bold"> / {max}</span>
      </div>
    </div>
  );
}

/* ─────────── 무대 (메인 비주얼) ─────────── */
function Stage({
  phase,
  currentSpecies,
  rollsCount,
  rolls,
  onThrow,
  onPick,
  reduce,
}: {
  phase: Phase;
  currentSpecies: StarterSpecies | null;
  rollsCount: number;
  rolls: RollResult[];
  onThrow: () => void;
  onPick: (idx: number) => void;
  reduce: boolean;
}) {
  const showBall =
    phase === "intro" || phase === "throwing" || phase === "wobble";
  const showCharacter = phase === "reveal" || phase === "between";

  // 가장 최근 결과
  const lastIdx = rolls.length - 1;
  const lastRoll = lastIdx >= 0 ? rolls[lastIdx] : null;
  const speciesForDisplay =
    phase === "reveal" || phase === "throwing" || phase === "wobble"
      ? currentSpecies
      : lastRoll?.species ?? currentSpecies;

  const reachedCap = rollsCount >= MAX_ROLLS;

  return (
    <div className="relative rounded-2xl overflow-hidden bg-gradient-to-b from-zinc-900 via-zinc-950 to-black border border-white/10 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.6)]">
      {/* 그리드 / 빛 배경 */}
      <StageBackdrop reduce={reduce} />

      <div className="relative h-[300px] md:h-[340px] flex items-end justify-center">
        {/* 상단 말풍선 */}
        <SpeechBubble
          phase={phase}
          species={speciesForDisplay}
          rollsCount={rollsCount}
          reachedCap={reachedCap}
        />

        {/* 바닥 그림자 */}
        <div
          aria-hidden
          className="absolute bottom-12 left-1/2 -translate-x-1/2 w-32 h-3 rounded-[50%] bg-black/55 blur-md"
        />

        {/* 등장 캐릭터 */}
        <AnimatePresence mode="wait">
          {showCharacter && speciesForDisplay && (
            <CharacterEntrance
              key={`char-${rollsCount}-${speciesForDisplay}`}
              species={speciesForDisplay}
              reduce={reduce}
            />
          )}
        </AnimatePresence>

        {/* 포켓몬 볼 */}
        <AnimatePresence>
          {showBall && (
            <PokeBall
              key={`ball-${rollsCount}-${phase}`}
              phase={phase}
              reduce={reduce}
            />
          )}
        </AnimatePresence>

        {/* CTA */}
        <div className="absolute bottom-3 inset-x-3">
          {phase === "intro" && (
            <ThrowCta label="포켓몬 볼 던지기" onClick={onThrow} />
          )}
          {phase === "between" && !reachedCap && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => lastIdx >= 0 && onPick(lastIdx)}
                style={{ touchAction: "manipulation" }}
                className="h-12 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-zinc-950 text-sm font-black active:scale-[0.98]"
              >
                이 친구로 정할래!
              </button>
              <ThrowCta label={`다시 뽑기 (${MAX_ROLLS - rollsCount})`} onClick={onThrow} compact />
            </div>
          )}
          {phase === "between" && reachedCap && lastIdx >= 0 && (
            <button
              type="button"
              onClick={() => onPick(lastIdx)}
              style={{ touchAction: "manipulation" }}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-zinc-950 text-sm font-black active:scale-[0.98]"
            >
              아래 결과 중에서 골라보자
            </button>
          )}
          {(phase === "throwing" || phase === "wobble" || phase === "reveal") && (
            <div className="h-12" /> /* placeholder — 레이아웃 점프 방지 */
          )}
        </div>
      </div>
    </div>
  );
}

function StageBackdrop({ reduce }: { reduce: boolean }) {
  return (
    <>
      {/* 별빛 */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(140% 60% at 50% 110%, rgba(251,191,36,0.18) 0%, rgba(0,0,0,0) 60%)",
        }}
      />
      {/* 가로선 — 바닥감 */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-12 h-px bg-gradient-to-r from-transparent via-amber-300/40 to-transparent"
      />
      {/* 트윙클 */}
      {!reduce && (
        <div aria-hidden className="absolute inset-0 pointer-events-none">
          {Array.from({ length: 14 }).map((_, i) => (
            <motion.span
              key={i}
              className="absolute rounded-full bg-white/70"
              style={{
                top: `${(i * 13) % 70 + 5}%`,
                left: `${(i * 19) % 90 + 4}%`,
                width: i % 3 === 0 ? 2 : 1,
                height: i % 3 === 0 ? 2 : 1,
              }}
              animate={{ opacity: [0.2, 0.9, 0.2] }}
              transition={{
                duration: 2 + (i % 4) * 0.4,
                repeat: Infinity,
                delay: (i % 5) * 0.3,
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}

/* ─────────── 말풍선 ─────────── */
function SpeechBubble({
  phase,
  species,
  rollsCount,
  reachedCap,
}: {
  phase: Phase;
  species: StarterSpecies | null;
  rollsCount: number;
  reachedCap: boolean;
}) {
  const line = useMemo(() => {
    if (phase === "intro") {
      return rollsCount === 0
        ? "안녕! 함께할 첫 포켓몬을 정해볼까?"
        : "다음 포켓몬을 만나러 가볼까?";
    }
    if (phase === "throwing") return "포켓몬 볼이 날아간다…";
    if (phase === "wobble") return "포켓몬 볼이 흔들리고 있어!";
    if (phase === "reveal" && species) {
      const m = STARTER_META[species];
      if (m.rarity === "super") return "……! 뮤츠가 모습을 드러냈다!!";
      if (m.rarity === "rare") return "오! 뮤가 슬쩍 다가왔다!";
      return `${m.name}(이)가 모습을 드러냈다!`;
    }
    if (phase === "between") {
      if (reachedCap) return "5번 모두 만나봤어. 마음에 든 친구를 골라보자!";
      return "이 친구로 정할까? 다시 한 번 만나볼 수도 있어.";
    }
    return "";
  }, [phase, species, rollsCount, reachedCap]);

  // 타이프라이터
  const [shown, setShown] = useState(0);
  useEffect(() => {
    setShown(0);
    if (!line) return;
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= line.length) clearInterval(id);
    }, 30);
    return () => clearInterval(id);
  }, [line]);

  const speciesAccent = species ? STARTER_META[species].accent : "#fbbf24";

  if (!line) return null;

  return (
    <div className="absolute top-3 left-3 right-3 z-10">
      <motion.div
        key={line}
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.25 }}
        className="relative rounded-2xl bg-white text-zinc-900 px-3.5 py-2.5 text-[13px] font-bold leading-snug shadow-lg shadow-black/40"
        style={{
          borderLeft: `4px solid ${speciesAccent}`,
        }}
      >
        <span>{line.slice(0, shown)}</span>
        {shown < line.length && (
          <span className="inline-block ml-0.5 w-[2px] h-[14px] bg-zinc-700 align-middle animate-pulse" />
        )}
        {/* 꼬리 */}
        <span
          aria-hidden
          className="absolute -bottom-1.5 left-8 w-3 h-3 bg-white rotate-45"
        />
      </motion.div>
    </div>
  );
}

/* ─────────── 포켓몬 볼 ─────────── */
function PokeBall({ phase, reduce }: { phase: Phase; reduce: boolean }) {
  // 페이즈별 트랜지션
  const initial = { y: -180, x: -120, rotate: -90, scale: 0.9, opacity: 0 };
  const throwing = {
    y: 90,
    x: 0,
    rotate: 360,
    scale: 1,
    opacity: 1,
  };
  const wobble = reduce
    ? throwing
    : { y: 90, x: 0, rotate: 0, scale: 1, opacity: 1 };
  const flash = { y: 90, x: 0, rotate: 0, scale: 1.4, opacity: 0 };

  const target =
    phase === "throwing"
      ? throwing
      : phase === "wobble"
      ? wobble
      : phase === "reveal"
      ? flash
      : initial;

  return (
    <motion.div
      className="absolute z-20"
      initial={initial}
      animate={target}
      exit={{ opacity: 0, scale: 1.2, transition: { duration: 0.2 } }}
      transition={
        phase === "throwing"
          ? { duration: reduce ? 0.2 : 0.7, ease: [0.2, 0.7, 0.4, 1] }
          : phase === "reveal"
          ? { duration: 0.4, ease: "easeOut" }
          : { duration: 0.2 }
      }
      style={{ left: "50%", bottom: 36, marginLeft: -28 }}
    >
      <motion.div
        animate={
          phase === "wobble" && !reduce
            ? { rotate: [-22, 22, -18, 18, -10, 10, 0], x: [-4, 4, -3, 3, -1, 1, 0] }
            : undefined
        }
        transition={{ duration: 1.4, ease: "easeInOut" }}
      >
        <BallSvg size={56} />
      </motion.div>
      {/* reveal 직전 플래시 */}
      {phase === "reveal" && (
        <motion.span
          aria-hidden
          className="absolute inset-0 m-auto rounded-full bg-white"
          initial={{ scale: 0.6, opacity: 0.9 }}
          animate={{ scale: 6, opacity: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          style={{ width: 56, height: 56 }}
        />
      )}
    </motion.div>
  );
}

function BallSvg({ size = 56 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      shapeRendering="geometricPrecision"
      aria-hidden
    >
      <defs>
        <radialGradient id="ball-top" cx="50%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#fb7185" />
          <stop offset="60%" stopColor="#dc2626" />
          <stop offset="100%" stopColor="#7f1d1d" />
        </radialGradient>
        <radialGradient id="ball-bot" cx="50%" cy="65%" r="60%">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="100%" stopColor="#cbd5e1" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="#0f172a" />
      <path d="M2 32 a30 30 0 0 1 60 0 z" fill="url(#ball-top)" />
      <path d="M2 32 a30 30 0 0 0 60 0 z" fill="url(#ball-bot)" />
      <rect x="2" y="29" width="60" height="6" fill="#0f172a" />
      <circle cx="32" cy="32" r="9" fill="#0f172a" />
      <circle cx="32" cy="32" r="6" fill="#fff" stroke="#0f172a" strokeWidth="2" />
      <ellipse cx="22" cy="20" rx="6" ry="3" fill="#fff" opacity="0.45" />
    </svg>
  );
}

/* ─────────── 캐릭터 등장 ─────────── */
function CharacterEntrance({
  species,
  reduce,
}: {
  species: StarterSpecies;
  reduce: boolean;
}) {
  const meta = STARTER_META[species];
  const isRare = meta.rarity !== "common";

  return (
    <motion.div
      className="relative z-10"
      style={{ marginBottom: 36 }}
      initial={reduce ? { opacity: 0 } : { y: 30, opacity: 0, scale: 0.6 }}
      animate={
        reduce
          ? { opacity: 1 }
          : {
              y: [30, -10, 0],
              opacity: 1,
              scale: [0.6, 1.15, 1],
            }
      }
      exit={reduce ? { opacity: 0 } : { y: -10, opacity: 0, scale: 0.9 }}
      transition={{ duration: reduce ? 0.2 : 0.6, ease: [0.2, 1.4, 0.4, 1] }}
    >
      {/* 등장 후 반복 idle bob */}
      <motion.div
        animate={
          reduce
            ? undefined
            : { y: [0, -3, 0], rotate: [-1.2, 1.2, -1.2] }
        }
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <PokemonSprite species={species} size={140} />
      </motion.div>

      {/* 희귀 — 후광 */}
      {isRare && !reduce && (
        <RareAura color={meta.accent} super={meta.rarity === "super"} />
      )}
    </motion.div>
  );
}

function RareAura({ color, super: isSuper }: { color: string; super: boolean }) {
  return (
    <>
      <motion.span
        aria-hidden
        className="absolute inset-0 m-auto rounded-full"
        style={{
          width: 220,
          height: 220,
          background: `radial-gradient(circle, ${color}55 0%, transparent 65%)`,
          left: "50%",
          top: "50%",
          marginLeft: -110,
          marginTop: -110,
          zIndex: -1,
        }}
        animate={{ scale: [0.9, 1.1, 0.9], opacity: [0.6, 0.95, 0.6] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />
      {isSuper &&
        Array.from({ length: 14 }).map((_, i) => (
          <motion.span
            key={i}
            aria-hidden
            className="absolute rounded-full"
            style={{
              width: 4,
              height: 4,
              left: "50%",
              top: "50%",
              marginLeft: -2,
              marginTop: -2,
              background: color,
              boxShadow: `0 0 8px ${color}`,
            }}
            animate={{
              x: [0, Math.cos((i / 14) * 2 * Math.PI) * 100],
              y: [0, Math.sin((i / 14) * 2 * Math.PI) * 100],
              opacity: [0, 1, 0],
            }}
            transition={{
              duration: 1.6,
              repeat: Infinity,
              delay: i * 0.08,
              ease: "easeOut",
            }}
          />
        ))}
    </>
  );
}

/* ─────────── 메인 던지기 CTA ─────────── */
function ThrowCta({
  label,
  onClick,
  compact,
}: {
  label: string;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ touchAction: "manipulation" }}
      className={clsx(
        "h-12 rounded-xl text-sm font-black active:scale-[0.98] transition",
        "bg-gradient-to-r from-rose-500 via-red-500 to-amber-400 text-zinc-950 shadow-[0_6px_20px_-6px_rgba(220,38,38,0.7)]",
        compact ? "" : "w-full"
      )}
    >
      {label}
    </button>
  );
}

/* ─────────── 확률 안내 ─────────── */
function RarityNotice() {
  return (
    <div className="mt-3 rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-zinc-400">
        특수 포켓몬 확률
      </p>
      <div className="mt-1 flex items-center gap-3 text-[13px] font-bold">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ background: STARTER_META.mew.accent }}
          />
          <span className="text-pink-300">뮤</span>
          <span className="text-zinc-300">10%</span>
        </span>
        <span className="text-zinc-700">·</span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ background: STARTER_META.mewtwo.accent }}
          />
          <span className="text-violet-300">뮤츠</span>
          <span className="text-zinc-300">5%</span>
        </span>
      </div>
    </div>
  );
}

/* ─────────── 결과 리스트 ─────────── */
function RollsList({
  rolls,
  onPick,
  disabled,
}: {
  rolls: RollResult[];
  onPick: (idx: number) => void;
  disabled: boolean;
}) {
  return (
    <section className="mt-3">
      <p className="text-[10px] uppercase tracking-wider text-zinc-400 mb-1.5">
        뽑기 결과 ({rolls.length}/{MAX_ROLLS})
      </p>
      <ul className="grid grid-cols-1 gap-1.5">
        {rolls.map((r) => {
          const meta = STARTER_META[r.species];
          const ribbon =
            meta.rarity === "super"
              ? "특수"
              : meta.rarity === "rare"
              ? "레어"
              : null;
          return (
            <li key={r.index}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(r.index - 1)}
                style={{ touchAction: "manipulation" }}
                className={clsx(
                  "w-full flex items-center gap-3 rounded-xl px-3 py-2 border transition",
                  disabled
                    ? "bg-white/5 border-white/10 text-zinc-400 cursor-default"
                    : "bg-white/5 border-white/10 text-white hover:bg-white/10 active:scale-[0.99]",
                  meta.rarity !== "common" && "border-amber-400/40"
                )}
              >
                <span
                  className="shrink-0 inline-flex items-center justify-center w-12 h-12 rounded-lg"
                  style={{ background: `${meta.accent}22` }}
                >
                  <PokemonSprite species={r.species} size={44} />
                </span>
                <span className="flex-1 text-left min-w-0">
                  <span className="block text-[10px] text-zinc-500 font-bold">
                    {r.index}회차
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-sm font-black truncate">
                      {meta.name}
                    </span>
                    {ribbon && (
                      <span
                        className={clsx(
                          "text-[9px] font-black px-1.5 py-0.5 rounded-full",
                          meta.rarity === "super"
                            ? "bg-violet-500/30 text-violet-200"
                            : "bg-pink-500/30 text-pink-200"
                        )}
                      >
                        {ribbon}
                      </span>
                    )}
                  </span>
                </span>
                {!disabled && (
                  <span className="text-amber-300 text-xs font-bold shrink-0">
                    선택 →
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ─────────── 이름 짓기 패널 ─────────── */
function NamingPanel({
  species,
  value,
  onChange,
  onCancel,
  onConfirm,
  error,
}: {
  species: StarterSpecies;
  value: string;
  onChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  error: string | null;
}) {
  const meta = STARTER_META[species];
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(id);
  }, []);

  // body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <motion.div
      className="fixed inset-0 z-[150] flex items-end md:items-center justify-center bg-black/85 backdrop-blur-sm px-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onCancel}
    >
      <motion.div
        className="w-full max-w-md rounded-t-2xl md:rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-950 border border-white/10 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        transition={{ duration: 0.32, ease: "easeOut" }}
        style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 12px)" }}
      >
        {/* 캐릭터 + 말풍선 */}
        <div className="relative px-4 pt-5 pb-3 flex items-center gap-3">
          <div
            className="shrink-0 inline-flex items-center justify-center w-20 h-20 rounded-2xl"
            style={{ background: `${meta.accent}22` }}
          >
            <motion.div
              animate={{ y: [0, -2, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            >
              <PokemonSprite species={species} size={72} />
            </motion.div>
          </div>
          <div className="flex-1 min-w-0">
            <div
              className="relative rounded-xl bg-white text-zinc-900 px-3 py-2 text-[13px] font-bold leading-snug"
              style={{ borderLeft: `4px solid ${meta.accent}` }}
            >
              이 친구의 이름은?
              <span
                aria-hidden
                className="absolute top-3 -left-1.5 w-0 h-0 border-y-[6px] border-y-transparent border-r-[7px] border-r-white"
              />
            </div>
            <p className="mt-1 text-[11px] text-zinc-400">
              {meta.name} · 12자 이내
            </p>
          </div>
        </div>

        {/* 입력 */}
        <div className="px-4 pb-3">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`나의 ${meta.name}…`}
            maxLength={12}
            className="w-full h-12 rounded-xl bg-white/5 border border-white/15 text-white placeholder:text-zinc-500 px-3 text-base font-bold focus:outline-none focus:border-amber-400"
            style={{ touchAction: "manipulation" }}
            onKeyDown={(e) => {
              if (e.key === "Enter") onConfirm();
            }}
          />
          {error && (
            <p className="mt-1.5 text-[12px] font-bold text-rose-300">{error}</p>
          )}
        </div>

        {/* CTA */}
        <div className="px-4 pb-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            style={{ touchAction: "manipulation" }}
            className="h-12 rounded-xl bg-white/5 border border-white/10 text-white/80 text-sm font-bold active:scale-[0.98]"
          >
            돌아가기
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!value.trim()}
            style={{ touchAction: "manipulation" }}
            className={clsx(
              "h-12 rounded-xl text-sm font-black active:scale-[0.98]",
              value.trim()
                ? "bg-gradient-to-r from-amber-400 to-orange-500 text-zinc-950"
                : "bg-white/5 border border-white/10 text-zinc-500"
            )}
          >
            확정하기
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─────────── 저장 중 / 완료 오버레이 ─────────── */
function SavingOverlay({
  species,
  nickname,
}: {
  species: StarterSpecies;
  nickname: string;
}) {
  const meta = STARTER_META[species];
  return (
    <motion.div
      className="fixed inset-0 z-[160] bg-black/85 backdrop-blur-sm flex items-center justify-center px-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="text-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
          className="inline-block"
        >
          <BallSvg size={64} />
        </motion.div>
        <p className="mt-3 text-sm font-bold text-white">
          {nickname.trim() || meta.name}와(과) 친구가 되는 중…
        </p>
      </div>
    </motion.div>
  );
}

function DoneOverlay({ starter }: { starter: MyStarter }) {
  const species = starter.species as StarterSpecies;
  const meta = STARTER_META[species];
  return (
    <motion.div
      className="fixed inset-0 z-[170] bg-black/90 flex items-center justify-center px-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ scale: 0.6, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 180, damping: 14 }}
        className="text-center"
      >
        <div
          className="inline-flex items-center justify-center w-44 h-44 rounded-3xl mb-3"
          style={{
            background: `radial-gradient(circle, ${meta.accent}33 0%, transparent 70%)`,
          }}
        >
          <PokemonSprite species={species} size={150} />
        </div>
        <p className="text-[11px] uppercase tracking-wider text-amber-300 font-bold">
          내 포켓몬 등록 완료!
        </p>
        <h2 className="mt-1 text-2xl font-black text-white">
          {starter.nickname}
        </h2>
        <p className="text-sm font-bold text-zinc-300">
          {meta.name} · LV {starter.level}
        </p>
      </motion.div>
    </motion.div>
  );
}

/* ─────────── 이미 정한 유저 화면 ─────────── */
function OwnedView({ starter }: { starter: MyStarter }) {
  const species = starter.species as StarterSpecies;
  const meta = STARTER_META[species];
  const reduce = useReducedMotion();

  return (
    <div className="relative max-w-md mx-auto px-4 py-3 md:py-6">
      <header className="mb-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
          내 포켓몬
        </p>
        <h1 className="text-lg font-black text-white">
          {starter.nickname}
          <span className="ml-2 text-sm font-bold text-zinc-400">
            {meta.name}
          </span>
        </h1>
      </header>

      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-b from-zinc-900 via-zinc-950 to-black border border-white/10 h-[320px] md:h-[360px] flex items-end justify-center">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background: `radial-gradient(140% 60% at 50% 110%, ${meta.accent}33 0%, transparent 60%)`,
          }}
        />
        <div
          aria-hidden
          className="absolute bottom-12 left-1/2 -translate-x-1/2 w-32 h-3 rounded-[50%] bg-black/55 blur-md"
        />

        {/* 말풍선 */}
        <div className="absolute top-3 left-3 right-3 z-10">
          <div
            className="relative rounded-2xl bg-white text-zinc-900 px-3.5 py-2.5 text-[13px] font-bold leading-snug shadow-lg shadow-black/40"
            style={{ borderLeft: `4px solid ${meta.accent}` }}
          >
            {meta.greet} 함께 잘 부탁해, {starter.nickname}!
            <span
              aria-hidden
              className="absolute -bottom-1.5 left-8 w-3 h-3 bg-white rotate-45"
            />
          </div>
        </div>

        {/* 캐릭터 */}
        <motion.div
          className="relative z-10"
          style={{ marginBottom: 28 }}
          animate={
            reduce
              ? undefined
              : { y: [0, -3, 0], rotate: [-1.2, 1.2, -1.2] }
          }
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        >
          <PokemonSprite species={species} size={150} />
        </motion.div>

        {/* 메달 — LV / 등록일 */}
        <div className="absolute bottom-3 inset-x-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-white/8 border border-white/10 px-3 py-2 text-center">
            <p className="text-[10px] uppercase tracking-wider text-zinc-400">
              레벨
            </p>
            <p className="text-base font-black text-amber-300">
              LV {starter.level}
            </p>
          </div>
          <div className="rounded-xl bg-white/8 border border-white/10 px-3 py-2 text-center">
            <p className="text-[10px] uppercase tracking-wider text-zinc-400">
              만난 날
            </p>
            <p className="text-base font-black text-white">
              {formatDate(starter.caught_at)}
            </p>
          </div>
        </div>
      </div>

      <p className="mt-3 text-[12px] text-zinc-500 text-center leading-relaxed">
        성장 시스템은 곧 추가될 예정이야.
        <br />
        지금은 인사하고 가도 좋아 :)
      </p>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getFullYear() % 100}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  } catch {
    return "-";
  }
}
