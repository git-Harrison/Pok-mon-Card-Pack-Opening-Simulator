"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useAuth } from "@/lib/auth";
import {
  fetchMyStarter,
  fetchStarterCompanionCounts,
  pickMyStarter,
  type MyStarter,
  type StarterCompanionCounts,
} from "@/lib/db";
import { wildSpriteUrl } from "@/lib/wild/pool";
import PokeLoader from "./PokeLoader";
import Portal from "./Portal";
import { HelpIcon, PokeballNavIcon } from "./icons/NavIcons";

/* ─────────── 종 정의 ───────────
   src/lib/wild/name-to-dex.ts 의 dex 번호와 1:1 — 야생/체육관 sprite
   매핑 시스템 (wildSpriteUrl) 그대로 재사용 → 실제 포켓몬 GIF.

   확률: 뮤츠 5%, 뮤 10%, 기본 8마리 균등(약 10.625% 씩).
*/
type StarterSpecies =
  | "pikachu"
  | "charmander"
  | "squirtle"
  | "bulbasaur"
  | "gastly"
  | "dratini"
  | "pidgey"
  | "piplup"
  | "mew"
  | "mewtwo";

interface SpeciesMeta {
  species: StarterSpecies;
  name: string; // 한글 이름 (name-to-dex 와 동일)
  dex: number; // PokeAPI dex 번호
  rarity: "common" | "rare" | "super";
  greet: string; // 등장 직후 말풍선
  accent: string; // 후광/엣지 컬러
  type: PokemonType; // 속성 (전기/불꽃/물/풀/고스트/드래곤/비행/에스퍼)
  basePower: number; // 전투력 base — 종 + level 보정
}

type PokemonType =
  | "전기" | "불꽃" | "물" | "풀" | "고스트" | "드래곤" | "비행" | "에스퍼";

const STARTER_META: Record<StarterSpecies, SpeciesMeta> = {
  pikachu:    { species: "pikachu",    name: "피카츄",   dex: 25,  rarity: "common", greet: "피카!",       accent: "#facc15", type: "전기",   basePower: 1100 },
  charmander: { species: "charmander", name: "파이리",   dex: 4,   rarity: "common", greet: "파이리!",     accent: "#fb923c", type: "불꽃",   basePower: 1100 },
  squirtle:   { species: "squirtle",   name: "꼬부기",   dex: 7,   rarity: "common", greet: "꼬북꼬북",    accent: "#38bdf8", type: "물",     basePower: 1050 },
  bulbasaur:  { species: "bulbasaur",  name: "이상해씨", dex: 1,   rarity: "common", greet: "이상해씨~",   accent: "#22c55e", type: "풀",     basePower: 1050 },
  gastly:     { species: "gastly",     name: "고오스",   dex: 92,  rarity: "common", greet: "고오~~",      accent: "#7c3aed", type: "고스트", basePower: 1000 },
  dratini:    { species: "dratini",    name: "미뇽",     dex: 147, rarity: "common", greet: "미뇽!",       accent: "#60a5fa", type: "드래곤", basePower: 1200 },
  pidgey:     { species: "pidgey",     name: "구구",     dex: 16,  rarity: "common", greet: "구구구",      accent: "#a16207", type: "비행",   basePower: 950  },
  piplup:     { species: "piplup",     name: "팽도리",   dex: 393, rarity: "common", greet: "팽팽!",       accent: "#0ea5e9", type: "물",     basePower: 1100 },
  mew:        { species: "mew",        name: "뮤",       dex: 151, rarity: "rare",   greet: "뮤……?",       accent: "#f472b6", type: "에스퍼", basePower: 5500 },
  mewtwo:     { species: "mewtwo",     name: "뮤츠",     dex: 150, rarity: "super",  greet: "……그래.",     accent: "#a78bfa", type: "에스퍼", basePower: 8800 },
};

/** 속성별 색 — 도감 / 인포 카드 / 배경 그라데이션에 사용. */
const TYPE_COLOR: Record<PokemonType, { bg: string; text: string; soft: string }> = {
  전기:   { bg: "#facc15", text: "#0f172a", soft: "#fbbf24" },
  불꽃:   { bg: "#f97316", text: "#ffffff", soft: "#fb923c" },
  물:     { bg: "#3b82f6", text: "#ffffff", soft: "#60a5fa" },
  풀:     { bg: "#22c55e", text: "#ffffff", soft: "#4ade80" },
  고스트: { bg: "#7c3aed", text: "#ffffff", soft: "#a78bfa" },
  드래곤: { bg: "#6366f1", text: "#ffffff", soft: "#818cf8" },
  비행:   { bg: "#94a3b8", text: "#0f172a", soft: "#cbd5e1" },
  에스퍼: { bg: "#ec4899", text: "#ffffff", soft: "#f472b6" },
};

/** 전투력 — basePower + level × 100. 향후 정식 시스템 도입 시 서버 산식으로 교체. */
function computePower(meta: SpeciesMeta, level: number): number {
  return meta.basePower + Math.max(0, level) * 100;
}

/** LV1 시작 — 다음 레벨까지 100 xp 가정. 등록 직후 0/100. */
function levelXp(_level: number): { cur: number; max: number } {
  return { cur: 0, max: 100 };
}

const STARTER_LIST: StarterSpecies[] = [
  "pikachu", "charmander", "squirtle", "bulbasaur",
  "gastly", "dratini", "pidgey", "piplup",
];

const SUPER_RATE = 5; // mewtwo
const RARE_RATE = 10; // mew

function rollOnce(): StarterSpecies {
  const r = Math.random() * 100;
  if (r < SUPER_RATE) return "mewtwo";
  if (r < SUPER_RATE + RARE_RATE) return "mew";
  return STARTER_LIST[Math.floor(Math.random() * STARTER_LIST.length)]!;
}

const MAX_ROLLS = 5;

interface RollResult {
  index: number; // 1..5
  species: StarterSpecies;
}

type Phase =
  | "loading"
  | "owned"
  | "intro"
  | "throwing"
  | "wobble"
  | "reveal"
  | "between"
  | "naming"
  | "saving"
  | "done";

/* ─────────── 진입점 ─────────── */
export default function MyPokemonView() {
  const { user } = useAuth();
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("loading");
  const [starter, setStarter] = useState<MyStarter | null>(null);
  const [rolls, setRolls] = useState<RollResult[]>([]);
  const [currentSpecies, setCurrentSpecies] = useState<StarterSpecies | null>(null);
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  const [nickname, setNickname] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  // 서버에서 starter 조회
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

  // 던지기 시퀀스
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

    // 타이밍 (reduce off):
    //   0     throwing  (1.0s 호 — 이전 속도)
    //   1000  wobble    (3.0s 1차→정지→2차→정지→3차 — 이전 속도)
    //   4000  reveal    (빛 폭발 — 짧게)
    //   4500  between   (캐릭터 빠르게 등장)
    const t1 = window.setTimeout(() => setPhase("wobble"), reduce ? 200 : 1000);
    const t2 = window.setTimeout(() => setPhase("reveal"), reduce ? 600 : 4000);
    const t3 = window.setTimeout(() => {
      setRolls((prev) => [...prev, { index: prev.length + 1, species: result }]);
      setPhase("between");
    }, reduce ? 1100 : 4500);
    throwTimers.current = [t1, t2, t3];
  }, [phase, rolls.length, reduce, clearTimers]);

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
      if (res.starter) {
        setStarter(res.starter);
        setPhase("owned");
        return;
      }
      setSaveError(res.error ?? "저장에 실패했어요.");
      setPhase("naming");
      return;
    }
    setStarter(res.starter ?? null);
    setPhase("done");
    window.setTimeout(() => setPhase("owned"), reduce ? 400 : 2200);
  }, [user, pickedIdx, rolls, nickname, reduce]);

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

  // 풀스크린 scene — header / nav 위를 덮음 (z-[200], body lock).
  return (
    <FullscreenScene
      phase={phase}
      currentSpecies={currentSpecies}
      rolls={rolls}
      onThrow={startThrow}
      onPick={startNaming}
      reduce={reduce ?? false}
      naming={
        phase === "naming" && pickedIdx != null && rolls[pickedIdx]
          ? {
              species: rolls[pickedIdx]!.species,
              nickname,
              error: saveError,
              onChange: setNickname,
              onCancel: cancelNaming,
              onConfirm: confirmName,
            }
          : null
      }
      saving={
        phase === "saving" && pickedIdx != null && rolls[pickedIdx]
          ? {
              species: rolls[pickedIdx]!.species,
              nickname,
            }
          : null
      }
      done={phase === "done" && starter ? starter : null}
    />
  );
}

/* ─────────── 풀스크린 SCENE ───────────
   fixed inset-0 z-[200] → Navbar (z-40) / 더보기 시트 (z-60) / 모달 (z-140)
   모두 그 아래로 깔리고, 진짜 풀화면 연출이 됨. body scroll lock 으로
   실제 사용자 입장에서 header / 하단 nav 가 아예 사라진 풀화면.
*/
function FullscreenScene({
  phase,
  currentSpecies,
  rolls,
  onThrow,
  onPick,
  reduce,
  naming,
  saving,
  done,
}: {
  phase: Phase;
  currentSpecies: StarterSpecies | null;
  rolls: RollResult[];
  onThrow: () => void;
  onPick: (idx: number) => void;
  reduce: boolean;
  naming: {
    species: StarterSpecies;
    nickname: string;
    error: string | null;
    onChange: (v: string) => void;
    onCancel: () => void;
    onConfirm: () => void;
  } | null;
  saving: { species: StarterSpecies; nickname: string } | null;
  done: MyStarter | null;
}) {
  const router = useRouter();

  // body scroll lock — 풀스크린 모드 동안.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const lastIdx = rolls.length - 1;
  const lastRoll = lastIdx >= 0 ? rolls[lastIdx] : null;
  const speciesForDisplay =
    phase === "reveal" || phase === "throwing" || phase === "wobble"
      ? currentSpecies
      : lastRoll?.species ?? currentSpecies;
  const reachedCap = rolls.length >= MAX_ROLLS;

  // ball 은 throwing 시작 시 마운트 → reveal 에서 빛 폭발 후 unmount.
  // intro 에는 mount 안 함 (의미 없는 invisible 인스턴스 방지) — 이전엔
  // intro 에 mount 된 ball 이 throwing 페이즈 시 새 인스턴스로 교체되면서
  // "두 번째 호" 가 그려져 사용자가 두 번 던지는 것처럼 보였음.
  const showBall =
    phase === "throwing" || phase === "wobble" || phase === "reveal";
  const showCharacter = phase === "reveal" || phase === "between";

  return (
    <Portal>
      <div className="fixed inset-0 z-[200] overflow-hidden">
        {/* 배경 — 하늘 → 잔디 그라데이션 */}
        <SceneBackdrop reduce={reduce} />

        {/* 상단 바 — 닫기 + 회차 */}
        <div
          className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-3"
          style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 12px)" }}
        >
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="나가기"
            style={{ touchAction: "manipulation" }}
            className="w-10 h-10 rounded-full bg-black/45 backdrop-blur text-white text-lg font-black inline-flex items-center justify-center active:scale-95"
          >
            ✕
          </button>
          <div className="flex items-center gap-1.5">
            {Array.from({ length: MAX_ROLLS }).map((_, i) => {
              const filled = i < rolls.length;
              const meta = filled ? STARTER_META[rolls[i]!.species] : null;
              return (
                <span
                  key={i}
                  className={clsx(
                    "w-2.5 h-2.5 rounded-full",
                    filled
                      ? meta!.rarity !== "common"
                        ? "ring-2 ring-amber-300/80"
                        : ""
                      : "bg-white/20"
                  )}
                  style={filled ? { background: meta!.accent } : undefined}
                />
              );
            })}
          </div>
        </div>

        {/* 확률 안내 — 좌측 상단 슬림 */}
        <div
          className="absolute top-14 left-3 z-30 rounded-full bg-black/45 backdrop-blur px-3 py-1 text-[11px] font-bold text-white"
          style={{ paddingTop: "calc(0.25rem + env(safe-area-inset-top, 0px))", paddingBottom: "0.25rem" }}
        >
          <span className="text-pink-300">뮤 10%</span>
          <span className="text-white/40 mx-1.5">·</span>
          <span className="text-violet-300">뮤츠 5%</span>
        </div>

        {/* 제목 — 잔잔히 */}
        <div className="absolute top-14 right-3 z-30 text-right text-white">
          <p className="text-[10px] uppercase tracking-wider text-amber-300 font-bold">
            내 첫 포켓몬
          </p>
          <p className="text-xs font-black">함께할 친구를 찾자</p>
        </div>

        {/* 무대 — 캐릭터 + 볼 (화면 중상단) */}
        <Stage
          phase={phase}
          showBall={showBall}
          showCharacter={showCharacter}
          species={speciesForDisplay}
          reduce={reduce}
        />

        {/* 하단 — 나레이션 박스 + CTA (포켓몬 게임 스타일) */}
        <div
          className="absolute bottom-0 inset-x-0 z-30 px-3"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 12px)" }}
        >
          <div className="mx-auto max-w-md space-y-2">
            <NarrationBox
              phase={phase}
              species={speciesForDisplay}
              rollsCount={rolls.length}
              reachedCap={reachedCap}
            />
            <CtaArea
              phase={phase}
              rollsCount={rolls.length}
              reachedCap={reachedCap}
              onThrow={onThrow}
              onPickLast={() => lastIdx >= 0 && onPick(lastIdx)}
              onShowList={() => lastIdx >= 0 && onPick(lastIdx)}
              rolls={rolls}
              onPickIdx={onPick}
            />
          </div>
        </div>

        {/* 이름짓기 / 저장 / 완료 오버레이 */}
        <AnimatePresence>
          {naming && <NamingPanel {...naming} />}
          {saving && <SavingOverlay {...saving} />}
          {done && <DoneOverlay starter={done} />}
        </AnimatePresence>
      </div>
    </Portal>
  );
}

/* ─────────── 배경 ─────────── */
function SceneBackdrop({ reduce }: { reduce: boolean }) {
  return (
    <>
      {/* 하늘 그라데이션 */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, #1e3a8a 0%, #1e1b4b 35%, #312e81 60%, #0f172a 90%)",
        }}
      />
      {/* 별빛 */}
      {!reduce && (
        <div aria-hidden className="absolute inset-0 pointer-events-none">
          {Array.from({ length: 24 }).map((_, i) => (
            <motion.span
              key={i}
              className="absolute rounded-full bg-white"
              style={{
                top: `${(i * 11) % 55 + 5}%`,
                left: `${(i * 17) % 95 + 2}%`,
                width: i % 4 === 0 ? 2.5 : 1,
                height: i % 4 === 0 ? 2.5 : 1,
                opacity: 0.6,
              }}
              animate={{ opacity: [0.2, 0.95, 0.2] }}
              transition={{
                duration: 2 + (i % 5) * 0.4,
                repeat: Infinity,
                delay: (i % 7) * 0.25,
              }}
            />
          ))}
        </div>
      )}
      {/* 바닥 — 풀숲 그림자 */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-[38%]"
        style={{
          background:
            "radial-gradient(120% 100% at 50% 0%, rgba(34,197,94,0.22) 0%, rgba(0,0,0,0) 65%), linear-gradient(180deg, rgba(15,23,42,0) 0%, #020617 100%)",
        }}
      />
      {/* 바닥 라인 — 잔디 */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-[36%] h-px bg-gradient-to-r from-transparent via-emerald-300/45 to-transparent"
      />
      {/* 후광 — 무대 중앙 */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-[28%] h-[40%]"
        style={{
          background:
            "radial-gradient(50% 60% at 50% 100%, rgba(251,191,36,0.18) 0%, rgba(0,0,0,0) 65%)",
        }}
      />
    </>
  );
}

/* ─────────── 무대 (스프라이트 + 볼) ─────────── */
function Stage({
  phase,
  showBall,
  showCharacter,
  species,
  reduce,
}: {
  phase: Phase;
  showBall: boolean;
  showCharacter: boolean;
  species: StarterSpecies | null;
  reduce: boolean;
}) {
  // 캐릭터/볼은 화면 중상단 (top 18% ~ bottom 38%) — 하단 나레이션/CTA 와
  // 절대 겹치지 않게 분리. 무대 중심점이 viewport 의 약 35% 지점.
  return (
    <div
      className="absolute inset-x-0 z-10 flex items-center justify-center"
      style={{ top: "16%", bottom: "40%" }}
    >
      {/* 바닥 그림자 — 무대 하단에 둥글게 */}
      <div
        aria-hidden
        className="absolute left-1/2 -translate-x-1/2 bottom-0 w-44 h-3 rounded-[50%] bg-black/60 blur-md"
      />

      {/* 등장 캐릭터 (실제 포켓몬 GIF) */}
      <AnimatePresence mode="wait">
        {showCharacter && species && (
          <CharacterEntrance
            key={`char-${species}`}
            species={species}
            reduce={reduce}
          />
        )}
      </AnimatePresence>

      {/* 포켓몬 볼 — throwing/wobble/reveal 동안 단일 인스턴스 유지.
          phase 별 key 분리는 transition 중복(=두 번 던지기) 의 원인이라 단일. */}
      <AnimatePresence>
        {showBall && <PokeBall key="ball" phase={phase} reduce={reduce} />}
      </AnimatePresence>
    </div>
  );
}

/* ─────────── 포켓몬 캐릭터 (실제 포켓몬 GIF) ─────────── */
function CharacterEntrance({
  species,
  reduce,
}: {
  species: StarterSpecies;
  reduce: boolean;
}) {
  const meta = STARTER_META[species];
  const isRare = meta.rarity !== "common";
  const isSuper = meta.rarity === "super";

  return (
    <motion.div
      className="relative z-10"
      initial={reduce ? { opacity: 0 } : { y: 24, opacity: 0, scale: 0.5 }}
      animate={
        reduce
          ? { opacity: 1 }
          : {
              y: [24, -14, 0],
              opacity: 1,
              scale: [0.5, 1.2, 1],
            }
      }
      exit={reduce ? { opacity: 0 } : { y: -10, opacity: 0, scale: 0.9 }}
      transition={{ duration: reduce ? 0.2 : 0.4, ease: [0.2, 1.4, 0.4, 1] }}
    >
      {/* 후광 — 희귀일 때 */}
      {isRare && !reduce && <RareAura color={meta.accent} starburst={isSuper} />}

      {/* 포켓몬 GIF — wildSpriteUrl 재사용. idle bob. */}
      <motion.div
        animate={
          reduce ? undefined : { y: [0, -5, 0], rotate: [-1.2, 1.2, -1.2] }
        }
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        style={{ filter: "drop-shadow(0 8px 14px rgba(0,0,0,0.6))" }}
      >
        <PokemonImg dex={meta.dex} name={meta.name} size={180} />
      </motion.div>

      {/* 희귀 표식 — 좌상단 작은 뱃지 (캐릭터 가리지 않게) */}
      {isRare && (
        <motion.span
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className={clsx(
            "absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 px-2 py-0.5 rounded-full text-[10px] font-black tracking-wide",
            isSuper
              ? "bg-violet-500 text-white shadow-[0_0_12px_rgba(167,139,250,0.8)]"
              : "bg-pink-500 text-white shadow-[0_0_12px_rgba(244,114,182,0.8)]"
          )}
        >
          {isSuper ? "★ 특수" : "✦ 레어"}
        </motion.span>
      )}
    </motion.div>
  );
}

/* PokeAPI 가 아주 가끔 안 뜰 때 정적 PNG 로 전환. PokeAPI Gen-5 BW 애니
   GIF 가 1차, 같은 dex 의 정적 PNG 가 2차. */
function PokemonImg({
  dex,
  name,
  size,
}: {
  dex: number;
  name: string;
  size: number;
}) {
  const [src, setSrc] = useState(() => wildSpriteUrl(dex, true));
  const [tried, setTried] = useState<"anim" | "static" | "gone">("anim");

  // species 가 바뀌면 src 다시 anim 으로 리셋.
  useEffect(() => {
    setSrc(wildSpriteUrl(dex, true));
    setTried("anim");
  }, [dex]);

  return (
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      style={{ imageRendering: "pixelated", width: size, height: size }}
      onError={() => {
        if (tried === "anim") {
          setSrc(wildSpriteUrl(dex, false));
          setTried("static");
        } else {
          setTried("gone");
        }
      }}
    />
  );
}

function RareAura({
  color,
  starburst,
}: {
  color: string;
  starburst: boolean;
}) {
  return (
    <>
      <motion.span
        aria-hidden
        className="absolute rounded-full"
        style={{
          width: 260,
          height: 260,
          background: `radial-gradient(circle, ${color}66 0%, transparent 65%)`,
          left: "50%",
          top: "50%",
          marginLeft: -130,
          marginTop: -130,
          zIndex: -1,
        }}
        animate={{ scale: [0.85, 1.15, 0.85], opacity: [0.55, 1, 0.55] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      />
      {starburst &&
        Array.from({ length: 16 }).map((_, i) => (
          <motion.span
            key={i}
            aria-hidden
            className="absolute rounded-full"
            style={{
              width: 5,
              height: 5,
              left: "50%",
              top: "50%",
              marginLeft: -2.5,
              marginTop: -2.5,
              background: color,
              boxShadow: `0 0 10px ${color}`,
              zIndex: -1,
            }}
            animate={{
              x: [0, Math.cos((i / 16) * 2 * Math.PI) * 130],
              y: [0, Math.sin((i / 16) * 2 * Math.PI) * 130],
              opacity: [0, 1, 0],
            }}
            transition={{
              duration: 1.8,
              repeat: Infinity,
              delay: i * 0.07,
              ease: "easeOut",
            }}
          />
        ))}
    </>
  );
}

/* ─────────── 포켓몬 볼 ───────────
   throwing — 화면 하단(+260)에서 위쪽 호를 그리며(-150 정점) 무대 중심(0)
              까지 1.0s. 1.4 회전.
   wobble   — 1차 → 정지 → 2차 → 정지 → 3차 (3.0s 시퀀스). 글로우 펄스.
              중간중간 ball 자체에 깜빡이는 빛 연출.
   reveal   — 무대 중앙에서 하얀 빛 폭발 + ball 페이드아웃.
*/
function PokeBall({ phase, reduce }: { phase: Phase; reduce: boolean }) {
  // 시작점 (mount 직후): 화면 아래쪽 (Stage 영역 밖) — 시각적으로 invisible
  // 효과를 위치로 만든다. opacity 키프레임 fade-in 은 사용자 보고된
  // "초반 깜빡임" 의 한 원인이라 제거. 위치만으로 화면 밖 → 호 → 무대 중심.
  const initial = { y: 260, x: -40, rotate: -60, scale: 0.85 };

  // 던지기 — 위쪽 정점 거쳐 무대 중심 도달 (1.0s). 마지막 바운스 제거.
  const throwingTarget = reduce
    ? { y: 0, x: 0, rotate: 360, scale: 1 }
    : {
        y: [260, -150, 0],
        x: [-40, -10, 0],
        rotate: [-60, 240, 360],
        scale: [0.85, 1, 1],
      };
  // 흔들림 동안 위치는 무대 중심 그대로 (inner motion.div 가 흔듦).
  const wobbleHold = { y: 0, x: 0, rotate: 0, scale: 1 };
  // reveal — 자리에서 살짝 커지며 페이드 아웃. 빛 폭발이 동시에 그 위로.
  const opening = { y: 0, x: 0, rotate: 0, scale: 1.5, opacity: 0 };

  const target =
    phase === "throwing"
      ? throwingTarget
      : phase === "wobble"
      ? wobbleHold
      : phase === "reveal"
      ? opening
      : initial;

  // 흔들림 시퀀스 (motion 2) — 1차/정지/2차/정지/3차 + 마지막 작은 점프.
  // 키 쌍 순서: 시작 0 → 흔듦 → 멈춤 → 흔듦 → 멈춤 → 흔듦 → 멈춤
  const wobbleAnim = reduce
    ? undefined
    : {
        rotate: [
          0,
          -22, 18, -16, 0,            // 1차 (0~0.6s)
          0,                          // 정지 (~0.7s)
          -28, 24, -22, 0,            // 2차 (~1.4s)
          0,                          // 정지 (~1.7s)
          -34, 30, -28, 28, 0,        // 3차 — 더 격하게
        ],
        x: [
          0,
          -3, 3, -2, 0,
          0,
          -4, 4, -3, 0,
          0,
          -5, 5, -4, 4, 0,
        ],
        y: [
          0,
          -2, -1, 0, 0,
          0,
          -3, -1, 0, 0,
          0,
          -4, -2, 0, 0, 0,
        ],
      };

  // 글로우 펄스 — wobbleAnim 키프레임(16개)과 같은 길이로 동기.
  // 1차 흔들림: 깜빡임 없음 (긴장감 빌드업 — 차분히 시작).
  // 2차 흔들림: 약한 깜빡 (0.3) — "어? 잡힌건가?".
  // 3차 흔들림: 강한 깜빡 (0.7→0.95) — "잡혔다!".
  const glowAnim = reduce
    ? undefined
    : {
        opacity: [
          0,
          0, 0, 0, 0,             // 1차 — 무
          0,                      // 정지
          0.3, 0, 0.3, 0,         // 2차 — 약한 깜빡
          0,                      // 정지
          0.7, 0, 0.95, 0.7, 0.95,// 3차 — 강한 깜빡
        ],
      };

  return (
    <motion.div
      className="absolute z-20"
      initial={initial}
      animate={target}
      exit={{ opacity: 0, scale: 1.3, transition: { duration: 0.2 } }}
      transition={
        phase === "throwing"
          ? {
              duration: reduce ? 0.2 : 1.0,
              ease: "easeOut",
              times: reduce ? undefined : [0, 0.55, 1],
            }
          : phase === "reveal"
          ? { duration: 0.3, ease: "easeOut" }
          : { duration: 0.2 }
      }
      style={{ left: "50%", top: "50%", marginLeft: -36, marginTop: -36 }}
    >
      <motion.div
        className="relative"
        animate={phase === "wobble" ? wobbleAnim : undefined}
        transition={{ duration: 3.0, ease: "easeInOut" }}
      >
        <BallSvg size={72} />

        {/* 중앙 흰 버튼 위에 깜빡이는 빛 — wobble 동안 "잡혔나?" 신호 */}
        {phase === "wobble" && (
          <motion.span
            aria-hidden
            className="absolute rounded-full"
            style={{
              left: "50%",
              top: "50%",
              width: 14,
              height: 14,
              marginLeft: -7,
              marginTop: -7,
              background:
                "radial-gradient(circle, rgba(254,243,160,1) 0%, rgba(251,191,36,0.9) 40%, rgba(251,191,36,0) 80%)",
              boxShadow: "0 0 22px rgba(251,191,36,0.95)",
            }}
            animate={glowAnim}
            transition={{ duration: 3.0, ease: "easeInOut" }}
          />
        )}

        {/* 외곽 광채 펄스 — 2차 부터 등장 (1차 동안엔 무) */}
        {phase === "wobble" && !reduce && (
          <motion.span
            aria-hidden
            className="absolute rounded-full"
            style={{
              width: 130,
              height: 130,
              left: "50%",
              top: "50%",
              marginLeft: -65,
              marginTop: -65,
              background:
                "radial-gradient(circle, rgba(251,191,36,0.55) 0%, rgba(251,191,36,0) 65%)",
              zIndex: -1,
            }}
            // glowAnim 과 동일 길이/타이밍 — 1차 0, 2차 약, 3차 강.
            animate={{
              opacity: [
                0,
                0, 0, 0, 0,
                0,
                0.25, 0, 0.25, 0,
                0,
                0.55, 0, 0.8, 0.55, 0.85,
              ],
            }}
            transition={{ duration: 3.0, ease: "easeInOut" }}
          />
        )}
      </motion.div>

      {/* reveal — 무대 중앙에서 하얀 빛 폭발 */}
      {phase === "reveal" && (
        <>
          <motion.span
            aria-hidden
            className="absolute rounded-full bg-white"
            style={{
              left: "50%",
              top: "50%",
              width: 72,
              height: 72,
              marginLeft: -36,
              marginTop: -36,
            }}
            initial={{ scale: 0.5, opacity: 1 }}
            animate={{ scale: 12, opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          />
          <motion.span
            aria-hidden
            className="absolute rounded-full"
            style={{
              left: "50%",
              top: "50%",
              width: 72,
              height: 72,
              marginLeft: -36,
              marginTop: -36,
              boxShadow: "0 0 60px 20px rgba(255,255,255,0.9)",
            }}
            initial={{ scale: 0.4, opacity: 0.95 }}
            animate={{ scale: 4, opacity: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          />
        </>
      )}
    </motion.div>
  );
}

function BallSvg({ size = 64 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      shapeRendering="geometricPrecision"
      aria-hidden
      style={{ filter: "drop-shadow(0 6px 14px rgba(220,38,38,0.55))" }}
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
      <ellipse cx="22" cy="20" rx="6" ry="3" fill="#fff" opacity="0.5" />
    </svg>
  );
}

/* ─────────── 나레이션 프레임 (껍데기 + typewriter) ───────────
   하단 고정. 흰 배경 + 두꺼운 검정 보더 + 우하단 깜빡이는 ▼ indicator.
   외부에서 line 만 넘기면 됨 — 풀스크린 scene / owned view 모두 사용.
*/
function NarrationFrame({ line }: { line: string }) {
  const [shown, setShown] = useState(0);
  const done = shown >= line.length;
  useEffect(() => {
    setShown(0);
    if (!line) return;
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= line.length) clearInterval(id);
    }, 28);
    return () => clearInterval(id);
  }, [line]);

  if (!line) return <div className="h-[88px]" aria-hidden />;

  return (
    <motion.div
      key={line}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="relative w-full rounded-md bg-[#fafaf5] text-zinc-900 px-4 py-3 leading-snug border-[3px] border-zinc-900 shadow-[0_4px_0_0_rgba(15,23,42,0.85)]"
      style={{ minHeight: 88 }}
      onClick={() => {
        if (!done) setShown(line.length);
      }}
    >
      <p className="text-[14px] font-bold whitespace-pre-line">
        {line.slice(0, shown)}
        {!done && (
          <span className="inline-block ml-0.5 w-[2px] h-[14px] bg-zinc-700 align-middle animate-pulse" />
        )}
      </p>
      {done && (
        <motion.span
          aria-hidden
          className="absolute right-2.5 bottom-1.5 text-zinc-900 text-[11px] font-black"
          animate={{ y: [0, 2, 0], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 1.0, repeat: Infinity, ease: "easeInOut" }}
        >
          ▼
        </motion.span>
      )}
    </motion.div>
  );
}

/* phase 별 라인 계산은 NarrationBox 가 담당 — NarrationFrame 한 번 사용. */
function NarrationBox({
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
        ? "안녕!\n함께할 첫 포켓몬을 만나러 가보자."
        : "좋아!\n다음 친구도 만나러 가볼까?";
    }
    if (phase === "throwing") return "몬스터볼을 던졌다!";
    if (phase === "wobble") return "몬스터볼이 흔들리고 있다…";
    if (phase === "reveal" && species) {
      const m = STARTER_META[species];
      if (m.rarity === "super") return "……!\n뮤츠가 모습을 드러냈다!!";
      if (m.rarity === "rare") return "오!\n뮤가 슬쩍 다가왔다!";
      return `${m.name}(이)가 모습을 드러냈다!`;
    }
    if (phase === "between") {
      if (reachedCap) return "5번 모두 만나봤다.\n마음에 든 친구를 골라보자!";
      return "이 친구로 정할까?\n다시 한 번 만나봐도 좋아.";
    }
    return "";
  }, [phase, species, rollsCount, reachedCap]);

  return <NarrationFrame line={line} />;
}

/* ─────────── CTA 영역 ─────────── */
function CtaArea({
  phase,
  rollsCount,
  reachedCap,
  rolls,
  onThrow,
  onPickLast,
  onShowList,
  onPickIdx,
}: {
  phase: Phase;
  rollsCount: number;
  reachedCap: boolean;
  rolls: RollResult[];
  onThrow: () => void;
  onPickLast: () => void;
  onShowList: () => void;
  onPickIdx: (idx: number) => void;
}) {
  const [listOpen, setListOpen] = useState(false);

  // 페이즈 바뀌면 list 자동 닫기
  useEffect(() => {
    if (phase !== "between") setListOpen(false);
  }, [phase]);

  const showCta =
    phase === "intro" || phase === "between";

  return (
    <div className="mx-auto max-w-md">
      {/* 결과 리스트 (between 단계, 토글) */}
      <AnimatePresence>
        {phase === "between" && rolls.length > 0 && listOpen && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.22 }}
            className="mb-2 rounded-2xl bg-black/65 backdrop-blur border border-white/15 overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-zinc-300 font-bold">
                만난 친구들 ({rolls.length}/{MAX_ROLLS})
              </span>
              <button
                type="button"
                onClick={() => setListOpen(false)}
                className="text-zinc-300 text-xs"
                style={{ touchAction: "manipulation" }}
              >
                닫기
              </button>
            </div>
            <ul className="max-h-[40vh] overflow-y-auto divide-y divide-white/5">
              {rolls.map((r) => {
                const m = STARTER_META[r.species];
                const ribbon =
                  m.rarity === "super"
                    ? "특수"
                    : m.rarity === "rare"
                    ? "레어"
                    : null;
                return (
                  <li key={r.index}>
                    <button
                      type="button"
                      onClick={() => onPickIdx(r.index - 1)}
                      style={{ touchAction: "manipulation" }}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/5 active:scale-[0.99] transition"
                    >
                      <span
                        className="shrink-0 inline-flex items-center justify-center w-12 h-12 rounded-lg"
                        style={{ background: `${m.accent}26` }}
                      >
                        <PokemonImg dex={m.dex} name={m.name} size={44} />
                      </span>
                      <span className="flex-1 text-left min-w-0">
                        <span className="block text-[10px] text-zinc-400 font-bold">
                          {r.index}회차
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="text-sm font-black text-white truncate">
                            {m.name}
                          </span>
                          {ribbon && (
                            <span
                              className={clsx(
                                "text-[9px] font-black px-1.5 py-0.5 rounded-full",
                                m.rarity === "super"
                                  ? "bg-violet-500/30 text-violet-100"
                                  : "bg-pink-500/30 text-pink-100"
                              )}
                            >
                              {ribbon}
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="text-amber-300 text-xs font-bold shrink-0">
                        선택 →
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CTA 버튼 */}
      <div className="grid gap-2">
        {phase === "intro" && (
          <ThrowCta label="몬스터볼 던지기" onClick={onThrow} />
        )}
        {phase === "between" && !reachedCap && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onPickLast}
              style={{ touchAction: "manipulation" }}
              className="h-12 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-zinc-950 text-sm font-black active:scale-[0.98] shadow-[0_8px_24px_-8px_rgba(16,185,129,0.6)]"
            >
              이 친구로 정할래!
            </button>
            <ThrowCta
              label={`다시 뽑기 (${MAX_ROLLS - rollsCount})`}
              onClick={onThrow}
            />
          </div>
        )}
        {phase === "between" && reachedCap && (
          <button
            type="button"
            onClick={onShowList}
            style={{ touchAction: "manipulation" }}
            className="h-12 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-zinc-950 text-sm font-black active:scale-[0.98]"
          >
            결과 중에서 골라보자
          </button>
        )}
        {phase === "between" && rolls.length > 0 && (
          <button
            type="button"
            onClick={() => setListOpen((v) => !v)}
            style={{ touchAction: "manipulation" }}
            className="h-9 rounded-xl bg-white/5 border border-white/10 text-white/85 text-xs font-bold active:scale-[0.99]"
          >
            {listOpen
              ? "결과 리스트 닫기"
              : `만난 친구들 보기 (${rolls.length}/${MAX_ROLLS})`}
          </button>
        )}
        {!showCta &&
          phase !== "naming" &&
          phase !== "saving" &&
          phase !== "done" && (
            <div className="h-12" /> /* 레이아웃 점프 방지 */
          )}
      </div>
    </div>
  );
}

function ThrowCta({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ touchAction: "manipulation" }}
      className="w-full h-12 rounded-xl text-sm font-black active:scale-[0.98] transition bg-gradient-to-r from-rose-500 via-red-500 to-amber-400 text-zinc-950 shadow-[0_8px_24px_-8px_rgba(220,38,38,0.7)]"
    >
      {label}
    </button>
  );
}

/* ─────────── 이름짓기 패널 ─────────── */
function NamingPanel({
  species,
  nickname,
  error,
  onChange,
  onCancel,
  onConfirm,
}: {
  species: StarterSpecies;
  nickname: string;
  error: string | null;
  onChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const meta = STARTER_META[species];
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(id);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 z-[210] flex items-end md:items-center justify-center bg-black/85 backdrop-blur-sm px-3"
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
        <div className="relative px-4 pt-5 pb-3 flex items-center gap-3">
          <div
            className="shrink-0 inline-flex items-center justify-center w-24 h-24 rounded-2xl"
            style={{ background: `${meta.accent}22` }}
          >
            <motion.div
              animate={{ y: [0, -3, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            >
              <PokemonImg dex={meta.dex} name={meta.name} size={84} />
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

        <div className="px-4 pb-3">
          <input
            ref={inputRef}
            type="text"
            value={nickname}
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
            disabled={!nickname.trim()}
            style={{ touchAction: "manipulation" }}
            className={clsx(
              "h-12 rounded-xl text-sm font-black active:scale-[0.98]",
              nickname.trim()
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

/* ─────────── 저장 / 완료 오버레이 ─────────── */
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
      className="absolute inset-0 z-[215] bg-black/85 backdrop-blur-sm flex items-center justify-center px-3"
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
          <BallSvg size={72} />
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
      className="absolute inset-0 z-[220] flex items-center justify-center px-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        background:
          "radial-gradient(circle at 50% 45%, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.95) 70%)",
      }}
    >
      {/* confetti */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {Array.from({ length: 22 }).map((_, i) => {
          const colors = ["#fbbf24", "#f472b6", "#34d399", "#60a5fa", "#a78bfa"];
          return (
            <motion.span
              key={i}
              className="absolute rounded-sm"
              style={{
                left: `${(i * 7.7) % 100}%`,
                top: "-8%",
                width: 6,
                height: 10,
                backgroundColor: colors[i % colors.length],
              }}
              animate={{ y: ["0vh", "120vh"], rotate: [0, 720] }}
              transition={{
                duration: 2.2 + (i % 5) * 0.3,
                repeat: Infinity,
                delay: (i % 9) * 0.18,
                ease: "easeIn",
              }}
            />
          );
        })}
      </div>

      <motion.div
        initial={{ scale: 0.6, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 180, damping: 14 }}
        className="text-center relative z-10"
      >
        <div
          className="inline-flex items-center justify-center w-52 h-52 rounded-3xl mb-3"
          style={{
            background: `radial-gradient(circle, ${meta.accent}40 0%, transparent 70%)`,
          }}
        >
          <PokemonImg dex={meta.dex} name={meta.name} size={170} />
        </div>
        <p className="text-[11px] uppercase tracking-wider text-amber-300 font-black">
          내 포켓몬 등록 완료!
        </p>
        <h2 className="mt-1 text-3xl font-black text-white">
          {starter.nickname}
        </h2>
        <p className="text-sm font-bold text-zinc-300">
          {meta.name} · LV {starter.level}
        </p>
      </motion.div>
    </motion.div>
  );
}

/* ─────────── 등록 완료 후 — 도감(Pokédex) 디바이스 페이지 ───────────
   페이지 자체가 빨간 도감 모달 디자인. 모든 정보(이름/종/속성/LV/EXP/전투력
   /만난날 + 캐릭터)가 도감 한 화면에 정리. 강화하기 버튼 포함.
   외부 상단에 작은 라운드 버튼 2개 (뒤로 / 메인).
*/
function OwnedView({ starter }: { starter: MyStarter }) {
  const { user } = useAuth();
  const species = starter.species as StarterSpecies;
  const meta = STARTER_META[species];
  const reduce = useReducedMotion();
  const router = useRouter();
  const [counts, setCounts] = useState<StarterCompanionCounts | null>(null);

  // 동일 속성 PCL10 카운트 조회 (사용 중 제외).
  useEffect(() => {
    if (!user) return;
    let alive = true;
    fetchStarterCompanionCounts(user.id, meta.type).then((c) => {
      if (alive) setCounts(c);
    });
    return () => {
      alive = false;
    };
  }, [user, meta.type]);

  // body scroll lock — 풀스크린 모드 동안.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const power = computePower(meta, starter.level);
  const xp = levelXp(starter.level);
  const [toast, setToast] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const onEnhance = useCallback(() => {
    setToast("강화 시스템은 곧 추가될 예정이에요.");
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[200] overflow-y-auto"
        style={{
          background:
            "radial-gradient(120% 80% at 50% -10%, #1a1a2e 0%, #0a0a14 55%, #02020a 100%)",
        }}
      >
        {/* 미세 별빛 배경 */}
        {!reduce && (
          <div aria-hidden className="absolute inset-0 pointer-events-none">
            {Array.from({ length: 22 }).map((_, i) => (
              <motion.span
                key={i}
                className="absolute rounded-full bg-white"
                style={{
                  top: `${(i * 13) % 90 + 3}%`,
                  left: `${(i * 19) % 95 + 2}%`,
                  width: i % 4 === 0 ? 2.5 : 1.2,
                  height: i % 4 === 0 ? 2.5 : 1.2,
                  opacity: 0.45,
                }}
                animate={{ opacity: [0.2, 0.85, 0.2] }}
                transition={{
                  duration: 2 + (i % 4) * 0.4,
                  repeat: Infinity,
                  delay: (i % 7) * 0.25,
                }}
              />
            ))}
          </div>
        )}

        {/* 메인 — 도감 디바이스. 외부 상단 버튼 따로 두지 않고 도감 하단의
            A 버튼이 홈 이동 역할을 겸함. items-start 로 위에 붙여 모바일
            스크롤 길이 최소화. */}
        <div
          className="min-h-full flex items-start justify-center px-3"
          style={{
            paddingTop: "calc(max(env(safe-area-inset-top, 0px), 0px) + 12px)",
            paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)",
          }}
        >
          <PokedexDevice
            meta={meta}
            starter={starter}
            power={power}
            xp={xp}
            reduce={reduce ?? false}
            onEnhance={onEnhance}
            onHome={() => router.push("/")}
            onHelp={() => setHelpOpen(true)}
            counts={counts}
          />
        </div>

        {/* 토스트 — 강화 안내 */}
        <AnimatePresence>
          {toast && (
            <motion.div
              key="toast"
              initial={{ y: -12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -8, opacity: 0 }}
              className="absolute top-16 inset-x-3 z-40 flex justify-center pointer-events-none"
            >
              <div className="rounded-full bg-amber-400 text-zinc-950 px-4 py-2 text-sm font-black shadow-[0_8px_22px_-8px_rgba(0,0,0,0.7)] border-2 border-zinc-900">
                {toast}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 도움말 모달 */}
        <AnimatePresence>
          {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
        </AnimatePresence>
      </div>
    </Portal>
  );
}

/* ─────────── 도감 디바이스 (메인 UI) ─────────── */
function PokedexDevice({
  meta,
  starter,
  power,
  xp,
  reduce,
  onEnhance,
  onHome,
  onHelp,
  counts,
}: {
  meta: SpeciesMeta;
  starter: MyStarter;
  power: number;
  xp: { cur: number; max: number };
  reduce: boolean;
  onEnhance: () => void;
  onHome: () => void;
  onHelp: () => void;
  counts: StarterCompanionCounts | null;
}) {
  const typeColor = TYPE_COLOR[meta.type];
  const xpPct = Math.min(100, Math.max(0, (xp.cur / xp.max) * 100));

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0, y: 12 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.2, 1.4, 0.4, 1] }}
      className="relative w-full max-w-sm"
      style={{
        filter:
          "drop-shadow(0 24px 36px rgba(180,20,30,0.35)) drop-shadow(0 12px 0 rgba(0,0,0,0.5))",
      }}
    >
      {/* 안테나 */}
      <span
        aria-hidden
        className="absolute left-1/2 -translate-x-1/2 -top-5 w-1 h-5 bg-zinc-900"
      />
      <motion.span
        aria-hidden
        className="absolute -top-7 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full ring-2 ring-zinc-900"
        style={{ background: "#fb7185" }}
        animate={
          reduce
            ? undefined
            : {
                boxShadow: [
                  "0 0 4px rgba(251,113,133,0.5)",
                  "0 0 14px rgba(251,113,133,1)",
                  "0 0 4px rgba(251,113,133,0.5)",
                ],
              }
        }
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* 본체 */}
      <div
        className="relative rounded-[28px] overflow-hidden border-[3px] border-zinc-900"
        style={{
          background:
            "linear-gradient(180deg, #d6202e 0%, #b71625 50%, #8a0d1c 100%)",
        }}
      >
        {/* 본체 광택 */}
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-[35%] pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 100%)",
          }}
        />
        {/* 우측 힌지 라인 — 접이식 도감 느낌 */}
        <span
          aria-hidden
          className="absolute right-1.5 top-3 bottom-3 w-1 rounded-full bg-black/35"
        />
        <span
          aria-hidden
          className="absolute right-3 top-3 bottom-3 w-px bg-white/15"
        />

        {/* 헤더 — LED 라인 */}
        <div className="relative px-4 pt-3 pb-2 flex items-center gap-2.5">
          {/* 큰 파란 LED — 전원, 펄스 */}
          <motion.span
            aria-hidden
            className="relative w-11 h-11 rounded-full ring-2 ring-zinc-900 shrink-0"
            style={{
              background:
                "radial-gradient(circle at 30% 28%, #bae6fd 0%, #38bdf8 38%, #0c4a6e 90%)",
            }}
            animate={
              reduce
                ? undefined
                : {
                    boxShadow: [
                      "inset 0 -4px 8px rgba(0,0,0,0.4), 0 0 10px rgba(56,189,248,0.45)",
                      "inset 0 -4px 8px rgba(0,0,0,0.4), 0 0 22px rgba(56,189,248,0.85)",
                      "inset 0 -4px 8px rgba(0,0,0,0.4), 0 0 10px rgba(56,189,248,0.45)",
                    ],
                  }
            }
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          >
            <span className="absolute top-1 left-1.5 w-3.5 h-3.5 rounded-full bg-white/75" />
            <span className="absolute bottom-1.5 right-1.5 w-2 h-2 rounded-full bg-white/30" />
          </motion.span>

          {/* 작은 LED 3개 — R Y G, 사이클로 깜빡 */}
          <div className="flex items-center gap-1.5">
            {[
              { c: "#fb7185", d: 0 },
              { c: "#fde047", d: 0.33 },
              { c: "#34d399", d: 0.66 },
            ].map((led, i) => (
              <motion.span
                key={i}
                aria-hidden
                className="w-2.5 h-2.5 rounded-full ring-1 ring-zinc-900"
                style={{ background: led.c }}
                animate={reduce ? undefined : { opacity: [0.35, 1, 0.35] }}
                transition={{
                  duration: 1.0,
                  repeat: Infinity,
                  delay: led.d,
                }}
              />
            ))}
          </div>

          {/* 동일 속성 PCL10 카운트 (사용 중 제외) — 헤더 행 빈 공간에 끼움 */}
          <div className="ml-auto flex flex-col items-end leading-tight gap-0.5">
            <span className="text-[9px] font-black tracking-[0.22em] text-zinc-900/75">
              PCL10
            </span>
            <CompanionCountsInline counts={counts} />
          </div>

          {/* 스피커 그릴 — 우측 끝 */}
          <div className="flex flex-col gap-0.5 mr-1 shrink-0">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex gap-0.5">
                {Array.from({ length: 6 }).map((_, c) => (
                  <span
                    key={c}
                    className="w-0.5 h-0.5 rounded-full bg-zinc-900/65"
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* LCD 스크린 — 검정 베젤 + 베이지 안쪽 + 캐릭터 (모바일 스크롤 줄이려 비율 16/10 + 캐릭터 110px) */}
        <div className="mx-4 mb-3 rounded-xl bg-zinc-900 p-2 ring-2 ring-black/60 shadow-[inset_0_2px_6px_rgba(0,0,0,0.6)]">
          <div
            className="relative rounded-lg aspect-[16/10] flex items-center justify-center overflow-hidden"
            style={{
              background: `linear-gradient(180deg, ${typeColor.soft}40 0%, #d8d6a5 30%, #b8b687 100%)`,
            }}
          >
            {/* CRT 스캔라인 */}
            <div
              aria-hidden
              className="absolute inset-0 opacity-50 pointer-events-none"
              style={{
                background:
                  "repeating-linear-gradient(0deg, transparent 0, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 3px)",
              }}
            />
            {/* 캐릭터 — LCD 안에 단독 */}
            <motion.div
              animate={reduce ? undefined : { y: [0, -3, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              style={{ filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.4))" }}
            >
              <PokemonImg dex={meta.dex} name={meta.name} size={110} />
            </motion.div>
          </div>
        </div>

        {/* 강화하기 — 캐릭터(LCD)와 정보 패널 사이 */}
        <div className="px-4 mb-3">
          <button
            type="button"
            onClick={onEnhance}
            style={{ touchAction: "manipulation" }}
            className="group relative w-full h-12 rounded-xl border-[3px] border-zinc-900 bg-gradient-to-b from-amber-300 to-amber-500 text-zinc-900 text-sm font-black tracking-[0.18em] active:translate-y-[2px] transition-all shadow-[0_4px_0_0_rgba(15,23,42,0.85)] active:shadow-[0_1px_0_0_rgba(15,23,42,0.85)]"
          >
            <span className="inline-flex items-center justify-center gap-1.5">
              <BoltGlyph />
              강화하기
              <BoltGlyph flipped />
            </span>
          </button>
        </div>

        {/* 정보 패널 — 베이지 종이 */}
        <div className="mx-4 mb-3 rounded-md bg-[#fafaf5] border-[3px] border-zinc-900 px-3.5 py-3 shadow-[0_2px_0_0_rgba(15,23,42,0.85)]">
          {/* 이름 + LV */}
          <div className="flex items-center justify-between gap-3 mb-2 pb-2 border-b-[1.5px] border-dashed border-zinc-300">
            <p className="text-[18px] font-black text-zinc-900 truncate">
              {starter.nickname}
            </p>
            <span className="shrink-0 inline-flex items-baseline gap-0.5 px-2 py-0.5 rounded-md bg-zinc-900 text-amber-300">
              <span className="text-[9px] font-bold tracking-wider">LV</span>
              <span className="text-base font-black tabular-nums">
                {starter.level}
              </span>
            </span>
          </div>

          {/* EXP 바 */}
          <div className="space-y-1 mb-2.5">
            <div className="flex items-center justify-between text-[10px] font-black text-zinc-500 tracking-wider">
              <span>EXP</span>
              <span className="tabular-nums">
                {xp.cur} / {xp.max}
              </span>
            </div>
            <div className="relative h-2.5 rounded-full bg-zinc-200 overflow-hidden border border-zinc-400">
              <motion.div
                className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400"
                initial={{ width: 0 }}
                animate={{ width: `${xpPct}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            </div>
          </div>

          {/* 정보 row */}
          <dl className="space-y-1.5 text-[12.5px]">
            <Row label="포켓몬">
              <span className="font-black text-zinc-900">{meta.name}</span>
            </Row>
            <Row label="속성">
              <TypeBadge type={meta.type} />
            </Row>
            <Row label="만난날">
              <span className="font-black text-zinc-900 tabular-nums">
                {formatDateLong(starter.caught_at)}
              </span>
            </Row>
            <Row label="전투력">
              <span className="font-black tabular-nums text-amber-700">
                {power.toLocaleString("ko-KR")}
              </span>
            </Row>
          </dl>
        </div>

        {/* 하단 — D-pad + A·B 버튼.
            B 는 장식 그대로, A 는 실제 동작하는 홈 버튼으로 사용. */}
        <div className="px-4 pb-4 flex items-center justify-between">
          <DPad />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onHelp}
              aria-label="도움말"
              style={{ touchAction: "manipulation" }}
              className="w-9 h-9 rounded-full bg-gradient-to-b from-zinc-100 to-zinc-300 ring-2 ring-zinc-900 inline-flex items-center justify-center text-zinc-800 active:translate-y-[1px] active:shadow-inner shadow-[0_2px_0_0_rgba(0,0,0,0.55)] transition-transform"
            >
              <HelpIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onHome}
              aria-label="메인으로"
              style={{ touchAction: "manipulation" }}
              className="w-9 h-9 rounded-full bg-gradient-to-b from-zinc-100 to-zinc-300 ring-2 ring-zinc-900 inline-flex items-center justify-center text-zinc-800 active:translate-y-[1px] active:shadow-inner shadow-[0_2px_0_0_rgba(0,0,0,0.55)] transition-transform"
            >
              <PokeballNavIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 우상단 작은 디테일 — 모델 라벨 */}
        <span
          aria-hidden
          className="absolute right-3 bottom-1 text-[8px] font-black text-zinc-900/55 tracking-widest"
        >
          v1.0
        </span>
      </div>
    </motion.div>
  );
}

/* ─────────── 도움말 모달 (도감 톤) ─────────── */
function HelpModal({ onClose }: { onClose: () => void }) {
  // ESC 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      className="absolute inset-0 z-[210] flex items-center justify-center bg-black/85 backdrop-blur-sm px-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        paddingTop: "max(env(safe-area-inset-top, 0px), 16px)",
        paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)",
      }}
    >
      <motion.div
        className="w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.92, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 6 }}
        transition={{ duration: 0.28, ease: [0.2, 1.4, 0.4, 1] }}
      >
        {/* 외관 — 도감과 같은 톤 (빨간 본체 + 검정 보더 + 베이지 본문) */}
        <div
          className="relative rounded-2xl overflow-hidden border-[3px] border-zinc-900 shadow-[0_18px_36px_-10px_rgba(0,0,0,0.85)]"
          style={{
            background:
              "linear-gradient(180deg, #d6202e 0%, #b71625 55%, #8a0d1c 100%)",
          }}
        >
          {/* 본체 광택 */}
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-[28%] pointer-events-none"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 100%)",
            }}
          />

          {/* 헤더 */}
          <div className="relative px-4 pt-4 pb-3 flex items-center gap-2">
            {/* 도감 시그니처 — 작은 파란 LED */}
            <span
              aria-hidden
              className="relative w-7 h-7 rounded-full ring-2 ring-zinc-900 shrink-0"
              style={{
                background:
                  "radial-gradient(circle at 30% 28%, #bae6fd 0%, #38bdf8 38%, #0c4a6e 90%)",
                boxShadow: "inset 0 -3px 6px rgba(0,0,0,0.35), 0 0 10px rgba(56,189,248,0.5)",
              }}
            >
              <span className="absolute top-1 left-1 w-2.5 h-2.5 rounded-full bg-white/70" />
            </span>
            <p className="text-[12px] font-black tracking-[0.22em] text-zinc-900">
              HELP
            </p>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              style={{ touchAction: "manipulation" }}
              className="ml-auto w-8 h-8 rounded-full bg-zinc-900 text-white text-sm font-black inline-flex items-center justify-center active:scale-95"
            >
              ✕
            </button>
          </div>

          {/* 본문 — 베이지 종이 패널 */}
          <div className="mx-4 mb-4 rounded-md bg-[#fafaf5] border-[3px] border-zinc-900 px-4 py-4 shadow-[0_2px_0_0_rgba(15,23,42,0.85)] space-y-3 text-[13px] leading-relaxed text-zinc-900">
            <div>
              <h2 className="text-[15px] font-black mb-1">내 포켓몬 도감</h2>
              <p className="text-[12px] text-zinc-700">
                함께할 첫 포켓몬과의 전용 화면이에요.
                기능별 안내는 아래를 참고하세요.
              </p>
            </div>

            <HelpRow label="LV / EXP">
              포켓몬의 성장 단계예요. 향후 전투/특훈을 통해 EXP 가 차고
              레벨업합니다.
            </HelpRow>

            <HelpRow label="전투력">
              종족 + 레벨에 따라 결정되는 종합 능력치예요. 추후 강화 시스템과
              연결됩니다.
            </HelpRow>

            <HelpRow label="동속성 PCL10">
              현재 캐릭터와 같은 속성의 PCL10 슬랩 중,
              <strong className="font-black">
                {" "}
                펫 / 전시 / 체육관 방어덱에 사용되지 않은
              </strong>
              {" "}카드 개수예요. 같은 카드 종류는 1번만 셉니다.
            </HelpRow>

            <HelpRow label="강화하기">
              곧 추가될 예정이에요. 동속성 PCL10 카드를 재료로 사용해 능력을
              올릴 수 있게 됩니다.
            </HelpRow>

            <HelpRow label="HOME / HELP">
              하단 라운드 버튼이에요. HOME 은 메인으로 이동, HELP 는 이 안내를
              다시 봅니다.
            </HelpRow>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function HelpRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 pb-2 border-b border-dashed border-zinc-300 last:border-b-0 last:pb-0">
      <p className="text-[10px] font-black tracking-[0.18em] text-zinc-500">
        {label}
      </p>
      <p className="text-[12.5px] text-zinc-800 leading-relaxed">{children}</p>
    </div>
  );
}

/* D-pad 작은 장식 */
function DPad() {
  return (
    <div
      aria-hidden
      className="relative w-12 h-12 rounded-md"
      style={{
        background: "linear-gradient(180deg, #1f1f1f 0%, #0a0a0a 100%)",
        border: "2px solid #000",
        boxShadow: "inset 0 2px 4px rgba(255,255,255,0.08)",
      }}
    >
      {/* 가로 막대 */}
      <span
        className="absolute left-0.5 right-0.5 top-1/2 -translate-y-1/2 h-3 rounded-sm"
        style={{
          background: "linear-gradient(180deg, #2a2a2a 0%, #050505 100%)",
        }}
      />
      {/* 세로 막대 */}
      <span
        className="absolute top-0.5 bottom-0.5 left-1/2 -translate-x-1/2 w-3 rounded-sm"
        style={{
          background: "linear-gradient(90deg, #2a2a2a 0%, #050505 100%)",
        }}
      />
      {/* 중앙 점 */}
      <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-zinc-700" />
    </div>
  );
}

/* 강화 버튼 좌우 번개 글리프 */
function BoltGlyph({ flipped }: { flipped?: boolean }) {
  return (
    <svg
      viewBox="0 0 12 16"
      width={10}
      height={14}
      fill="currentColor"
      aria-hidden
      style={flipped ? { transform: "scaleX(-1)" } : undefined}
    >
      <path d="M7 0 L1 9 H5 L3 16 L11 6 H7 Z" />
    </svg>
  );
}

/* ─────────── 동일 속성 PCL10 카운트 (헤더 인라인) ───────────
   현재 캐릭터 속성과 같은 PCL10 슬랩 중 펫/전시/방어덱 미사용분.
   같은 card_id 는 1 회만 (server distinct).
   영역을 더 늘리지 않고 헤더 LED 행 빈 공간에 인라인으로 끼움.
*/
function CompanionCountsInline({
  counts,
}: {
  counts: StarterCompanionCounts | null;
}) {
  const loading = counts === null;
  const dot = <span className="text-zinc-900/30 mx-1">·</span>;
  return (
    <span className="text-[12px] font-black tabular-nums tracking-wide inline-flex items-baseline">
      <CountChip label="MUR" value={counts?.mur ?? 0} loading={loading} />
      {dot}
      <CountChip label="UR" value={counts?.ur ?? 0} loading={loading} />
      {dot}
      <CountChip label="SAR" value={counts?.sar ?? 0} loading={loading} />
    </span>
  );
}

function CountChip({
  label,
  value,
  loading,
}: {
  label: string;
  value: number;
  loading: boolean;
}) {
  return (
    <span className="inline-flex items-baseline gap-0.5">
      <span className="text-zinc-900">{label}</span>
      <span
        className="text-white font-black tabular-nums"
        style={{ textShadow: "0 1px 2px rgba(0,0,0,0.75)" }}
      >
        {loading ? "·" : value}
      </span>
    </span>
  );
}

/* ─────────── 속성 뱃지 ─────────── */
function TypeBadge({ type }: { type: PokemonType }) {
  const c = TYPE_COLOR[type];
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[11px] font-black tracking-wider"
      style={{ background: c.bg, color: c.text }}
    >
      {type}
    </span>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-zinc-200 last:border-b-0 pb-1.5 last:pb-0">
      <dt className="text-[11px] font-black tracking-wider text-zinc-500">
        {label}
      </dt>
      <dd className="text-right min-w-0">{children}</dd>
    </div>
  );
}

function formatDateLong(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  } catch {
    return "-";
  }
}

