"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import {
  enhanceMyStarter,
  evolveMyStarter,
  fetchMyStarter,
  fetchStarterCompanionCounts,
  fetchStarterMaterials,
  fetchTakenStarterSpecies,
  pickMyStarter,
  type EnhanceResult,
  type MyStarter,
  type StarterCompanionCounts,
  type StarterMaterial,
} from "@/lib/db";
import { wildSpriteUrl } from "@/lib/wild/pool";
import { starterLevelPower } from "@/lib/starter-power";
import { getCard } from "@/lib/sets";
import PokeLoader from "./PokeLoader";
import Portal from "./Portal";
import { HelpIcon, PokeballNavIcon } from "./icons/NavIcons";

/* ─────────── 종 정의 ───────────
   src/lib/wild/name-to-dex.ts 의 dex 번호와 1:1 — 야생/체육관 sprite
   매핑 시스템 (wildSpriteUrl) 그대로 재사용 → 실제 포켓몬 GIF.

   선택 가능 11종 (기본형). 가챠 풀에서 server-side `taken` 종은 제외.
   같은 종은 모든 유저 통틀어 1명만 가질 수 있음 — server unique constraint
   (20260696 + 20260697 마이그레이션).
*/
type StarterSpecies =
  | "pikachu"
  | "charmander"
  | "squirtle"
  | "bulbasaur"
  | "pidgey"
  | "poliwag"
  | "gastly"
  | "chikorita"
  | "chimchar"
  | "geodude"
  | "caterpie";

interface SpeciesMeta {
  species: StarterSpecies;
  name: string; // 한글 이름 (name-to-dex 와 동일)
  dex: number; // PokeAPI dex 번호
  greet: string; // 등장 직후 말풍선
  accent: string; // 후광/엣지 컬러
  type: PokemonType; // 속성
  basePower: number; // 전투력 base — 종 + level 보정
}

type PokemonType =
  | "전기" | "불꽃" | "물" | "풀" | "고스트" | "비행" | "바위" | "벌레";

const STARTER_META: Record<StarterSpecies, SpeciesMeta> = {
  pikachu:    { species: "pikachu",    name: "피카츄",   dex: 25,  greet: "피카!",     accent: "#facc15", type: "전기",   basePower: 1100 },
  charmander: { species: "charmander", name: "파이리",   dex: 4,   greet: "파이리!",   accent: "#fb923c", type: "불꽃",   basePower: 1100 },
  squirtle:   { species: "squirtle",   name: "꼬부기",   dex: 7,   greet: "꼬북꼬북",  accent: "#38bdf8", type: "물",     basePower: 1050 },
  bulbasaur:  { species: "bulbasaur",  name: "이상해씨", dex: 1,   greet: "이상해씨~", accent: "#22c55e", type: "풀",     basePower: 1050 },
  pidgey:     { species: "pidgey",     name: "구구",     dex: 16,  greet: "구구구",    accent: "#a16207", type: "비행",   basePower: 950  },
  poliwag:    { species: "poliwag",    name: "발챙이",   dex: 60,  greet: "발챙!",     accent: "#0ea5e9", type: "물",     basePower: 1050 },
  gastly:     { species: "gastly",     name: "고오스",   dex: 92,  greet: "고오~~",    accent: "#7c3aed", type: "고스트", basePower: 1000 },
  chikorita:  { species: "chikorita",  name: "치코리타", dex: 152, greet: "치코~",     accent: "#84cc16", type: "풀",     basePower: 1050 },
  chimchar:   { species: "chimchar",   name: "불꽃숭이", dex: 390, greet: "치임!",     accent: "#ef4444", type: "불꽃",   basePower: 1050 },
  geodude:    { species: "geodude",    name: "꼬마돌",   dex: 74,  greet: "고로!",     accent: "#92400e", type: "바위",   basePower: 1050 },
  caterpie:   { species: "caterpie",   name: "캐터피",   dex: 10,  greet: "캐터…",     accent: "#65a30d", type: "벌레",   basePower: 950  },
};

/** 속성별 색 — 도감 / 인포 카드 / 배경 그라데이션에 사용. */
const TYPE_COLOR: Record<PokemonType, { bg: string; text: string; soft: string }> = {
  전기:   { bg: "#facc15", text: "#0f172a", soft: "#fbbf24" },
  불꽃:   { bg: "#f97316", text: "#ffffff", soft: "#fb923c" },
  물:     { bg: "#3b82f6", text: "#ffffff", soft: "#60a5fa" },
  풀:     { bg: "#22c55e", text: "#ffffff", soft: "#4ade80" },
  고스트: { bg: "#7c3aed", text: "#ffffff", soft: "#a78bfa" },
  비행:   { bg: "#94a3b8", text: "#0f172a", soft: "#cbd5e1" },
  바위:   { bg: "#a16207", text: "#ffffff", soft: "#d6d3d1" },
  벌레:   { bg: "#65a30d", text: "#ffffff", soft: "#a3e635" },
};

/** 내 포켓몬 LV 기반 유저 전투력 보너스 — 정액 표 (`@/lib/starter-power`).
 *  표시/랭킹용. 체육관 실제 전투 스탯 계산 (gym_pet_battle_stats) 에는
 *  들어가지 않음. 같은 표가 서버 starter_level_power_bonus(int) 함수에도
 *  존재하며 get_profile / get_user_rankings 의 center_power 합산에 반영됨. */
function computePower(_meta: SpeciesMeta, level: number): number {
  return starterLevelPower(level);
}

/* ─────────── 진화 라인 ─────────── */
interface EvolutionStageInfo {
  dex: number;
  name: string;
}

/** 종 → stage[0..max] (인덱스 = evolution_stage).
 *  pikachu 는 2단 (라이츄까지 — 카논상 추가 진화 없음). 그 외 10종은 3단. */
const EVOLUTION_LINES: Record<StarterSpecies, EvolutionStageInfo[]> = {
  pikachu:    [{ dex: 25,  name: "피카츄"   }, { dex: 26,  name: "라이츄"   }],
  charmander: [{ dex: 4,   name: "파이리"   }, { dex: 5,   name: "리자드"   }, { dex: 6,   name: "리자몽"   }],
  squirtle:   [{ dex: 7,   name: "꼬부기"   }, { dex: 8,   name: "어니부기" }, { dex: 9,   name: "거북왕"   }],
  bulbasaur:  [{ dex: 1,   name: "이상해씨" }, { dex: 2,   name: "이상해풀" }, { dex: 3,   name: "이상해꽃" }],
  pidgey:     [{ dex: 16,  name: "구구"     }, { dex: 17,  name: "피죤"     }, { dex: 18,  name: "피죤투"   }],
  poliwag:    [{ dex: 60,  name: "발챙이"   }, { dex: 61,  name: "슈륙챙이" }, { dex: 62,  name: "강챙이"   }],
  gastly:     [{ dex: 92,  name: "고오스"   }, { dex: 93,  name: "고우스트" }, { dex: 94,  name: "팬텀"     }],
  chikorita:  [{ dex: 152, name: "치코리타" }, { dex: 153, name: "베이리프" }, { dex: 154, name: "메가니움" }],
  chimchar:   [{ dex: 390, name: "불꽃숭이" }, { dex: 391, name: "파이숭이" }, { dex: 392, name: "초염몽"   }],
  geodude:    [{ dex: 74,  name: "꼬마돌"   }, { dex: 75,  name: "데구리"   }, { dex: 76,  name: "딱구리"   }],
  caterpie:   [{ dex: 10,  name: "캐터피"   }, { dex: 11,  name: "단데기"   }, { dex: 12,  name: "버터플"   }],
};

/** 현재 stage 에 보여줄 dex/이름 — 진화 후 캐릭터 변경에 사용. */
function effectiveStage(species: StarterSpecies, stage: number): EvolutionStageInfo {
  const line = EVOLUTION_LINES[species];
  const idx = Math.max(0, Math.min(stage, line.length - 1));
  return line[idx]!;
}

/** 진화 가능한 다음 stage 정보 — 없으면 null. 라이츄 (피카츄 1차 끝) / 2차 진화 끝 모두 null. */
function nextEvolveStage(
  species: StarterSpecies,
  stage: number,
  level: number
): EvolutionStageInfo | null {
  const line = EVOLUTION_LINES[species];
  if (stage >= line.length - 1) return null;
  if (stage === 0 && level >= 10) return line[1] ?? null;
  if (stage === 1 && level >= 20) return line[2] ?? null;
  return null;
}

/* ─────────── 레벨별 필요 EXP (기획 그대로) ─────────── */
/** index = 현재 레벨 (1..29). value = 다음 레벨까지 필요 EXP. Lv30 = MAX. */
const LEVEL_EXP_TABLE: Record<number, number> = {
  1: 1200, 2: 1700, 3: 2300, 4: 3000, 5: 3900,
  6: 5000, 7: 6300, 8: 7800, 9: 9500,
  10: 12000, 11: 15000, 12: 18500, 13: 22500, 14: 27000,
  15: 32000, 16: 37500, 17: 43500, 18: 50000, 19: 57000,
  20: 70000, 21: 83000, 22: 98000, 23: 115000, 24: 134000,
  25: 155000, 26: 178000, 27: 203000, 28: 230000, 29: 260000,
};

/** 재료 base EXP — 등급 일반×1.0 / 대성공×1.2 / 초대성공×1.5.
 *  같은 속성 카드만 재료로 쓸 수 있게 바뀐 후 +3% 보너스 개념은 제거. */
const MATERIAL_EXP: Record<"MUR" | "UR" | "SAR", number> = {
  MUR: 10000,
  UR: 200,
  SAR: 20,
};

/** 재료 1장의 일반 성공 예상 EXP — 미리보기 표시용. */
function previewMaterialExp(rarity: "MUR" | "UR" | "SAR"): number {
  return MATERIAL_EXP[rarity];
}

/** 선택 가능 11종 — server `pick_my_starter` 의 v_allowed 와 동일. */
const STARTER_LIST: StarterSpecies[] = [
  "pikachu", "charmander", "squirtle", "bulbasaur", "pidgey", "poliwag",
  "gastly", "chikorita", "chimchar", "geodude", "caterpie",
];

/** 가챠 풀 = 전체 11종 - 다른 트레이너가 이미 가져간 종.
 *  풀이 비면 null — UI 가 빈 상태 안내문구로 분기. */
function rollOnce(pool: StarterSpecies[]): StarterSpecies | null {
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)]!;
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
  const [taken, setTaken] = useState<string[]>([]);
  const [rolls, setRolls] = useState<RollResult[]>([]);
  const [currentSpecies, setCurrentSpecies] = useState<StarterSpecies | null>(null);
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  const [nickname, setNickname] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  // 서버에서 starter + 다른 유저가 가져간 종 목록 동시 조회.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    Promise.all([fetchMyStarter(user.id), fetchTakenStarterSpecies()]).then(
      ([s, t]) => {
        if (!alive) return;
        setTaken(t);
        if (s) {
          setStarter(s);
          setPhase("owned");
        } else {
          setPhase("intro");
        }
      }
    );
    return () => {
      alive = false;
    };
  }, [user]);

  const refreshTaken = useCallback(async () => {
    const t = await fetchTakenStarterSpecies();
    setTaken(t);
  }, []);

  // 가챠 풀 — taken 제외. 풀이 비면 던지기 차단.
  const availablePool = useMemo(() => {
    const takenSet = new Set(taken);
    return STARTER_LIST.filter((s) => !takenSet.has(s));
  }, [taken]);

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
    const result = rollOnce(availablePool);
    if (!result) return; // 풀이 비어 있으면 던지기 차단 — UI 도 비활성화 처리.
    clearTimers();
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
  }, [phase, rolls.length, reduce, clearTimers, availablePool]);

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
      // 다른 트레이너가 그 사이에 같은 종 가져간 경우 — taken 새로고침 후 안내.
      await refreshTaken();
      setSaveError(res.error ?? "저장에 실패했어요.");
      setPhase("naming");
      return;
    }
    setStarter(res.starter ?? null);
    setPhase("done");
    window.setTimeout(() => setPhase("owned"), reduce ? 400 : 2200);
  }, [user, pickedIdx, rolls, nickname, reduce, refreshTaken]);

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
      remaining={availablePool.length}
      total={STARTER_LIST.length}
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
  remaining,
  total,
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
  remaining: number;
  total: number;
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

  // body scroll lock — 풀스크린 모드 동안. 중첩 안전 ref-count 락 사용.
  useBodyScrollLock(true);

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
                    filled ? "" : "bg-white/20"
                  )}
                  style={filled ? { background: meta!.accent } : undefined}
                />
              );
            })}
          </div>
        </div>

        {/* 남은 포켓몬 카운트 — 좌측 상단 슬림 */}
        <div
          className="absolute top-14 left-3 z-30 rounded-full bg-black/45 backdrop-blur px-3 py-1 text-[11px] font-black text-white tracking-wider"
          style={{ paddingTop: "calc(0.25rem + env(safe-area-inset-top, 0px))", paddingBottom: "0.25rem" }}
        >
          남은 포켓몬{" "}
          <span className="text-amber-300 tabular-nums">{remaining}</span>
          <span className="text-white/55"> / {total}</span>
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
              remaining={remaining}
            />
            <CtaArea
              phase={phase}
              rollsCount={rolls.length}
              reachedCap={reachedCap}
              remaining={remaining}
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

/* ─────────── 도감 LCD 안 16:9 필드 배경 ───────────
   원본 게임 에셋을 쓰지 않는 CSS-only 레트로 게임풍 필드 배경 10종.
   - 접속 시 + 매 시간마다 결정적으로 갱신 (시간 버킷 + 종 + stage 시드).
   - 같은 시간대 안에서는 동일 배경 유지 → 새로고침해도 같은 배경.
   - 1시간이 지나면 다른 배경으로 자연 전환 (AnimatePresence 크로스페이드).
   - 캐릭터 속성에 맞는 배경을 우선 (가중치 ≈ 70% 선호).
*/
type SceneKey =
  | "grass" | "forest" | "cave" | "beach" | "night"
  | "ghost" | "fire"  | "ice"  | "gym"   | "sunset";

interface SceneStyle {
  key: SceneKey;
  /** LCD 안쪽 베이스 그라데이션 (위→아래). */
  bg: string;
  /** 추가 디테일 레이어 (구름·풀·달·별 등). 모두 CSS 만 사용. */
  overlay?: string;
  /** 캐릭터 발판(원형 그림자) 톤. */
  groundTint: string;
  /** 캐릭터에 살짝 더해줄 색감 — 너무 화려하지 않게 alpha 낮게. */
  vignette?: string;
}

const SCENE_STYLES: Record<SceneKey, SceneStyle> = {
  grass: {
    key: "grass",
    bg: "linear-gradient(180deg, #a7f0c5 0%, #74d99c 38%, #2f9e57 70%, #1f6b3d 100%)",
    overlay:
      "repeating-linear-gradient(115deg, rgba(20,80,40,0.18) 0 2px, transparent 2px 7px), radial-gradient(70% 32% at 50% 8%, rgba(255,255,255,0.55), transparent 70%)",
    groundTint: "rgba(0,40,15,0.55)",
  },
  forest: {
    key: "forest",
    bg: "linear-gradient(180deg, #2b4a36 0%, #1f3a2b 50%, #122418 100%)",
    overlay:
      "radial-gradient(28% 50% at 18% 60%, rgba(20,120,60,0.6), transparent 70%), radial-gradient(28% 50% at 82% 60%, rgba(20,120,60,0.6), transparent 70%), radial-gradient(38% 60% at 50% 78%, rgba(0,80,30,0.55), transparent 70%)",
    groundTint: "rgba(0,15,5,0.7)",
  },
  cave: {
    key: "cave",
    bg: "linear-gradient(180deg, #2a2935 0%, #1c1b26 55%, #0e0d16 100%)",
    overlay:
      "radial-gradient(60% 38% at 50% 50%, rgba(255,235,180,0.18), transparent 75%), repeating-linear-gradient(180deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 4px)",
    groundTint: "rgba(0,0,0,0.75)",
  },
  beach: {
    key: "beach",
    bg: "linear-gradient(180deg, #aee2ff 0%, #6dc6f0 35%, #f4e2b6 65%, #e0c98a 100%)",
    overlay:
      "repeating-linear-gradient(180deg, rgba(255,255,255,0.18) 0 1px, transparent 1px 8px), radial-gradient(50% 22% at 50% 38%, rgba(255,255,255,0.45), transparent 70%)",
    groundTint: "rgba(80,55,15,0.5)",
  },
  night: {
    key: "night",
    bg: "linear-gradient(180deg, #0d1448 0%, #11185a 45%, #1b1740 80%, #0a0a18 100%)",
    overlay:
      "radial-gradient(8% 8% at 22% 22%, rgba(255,255,255,0.95), transparent 70%), radial-gradient(5% 5% at 70% 32%, rgba(255,255,255,0.75), transparent 70%), radial-gradient(6% 6% at 45% 14%, rgba(255,255,255,0.7), transparent 70%), radial-gradient(20% 20% at 82% 18%, rgba(255,255,200,0.65), transparent 70%)",
    groundTint: "rgba(5,5,30,0.7)",
  },
  ghost: {
    key: "ghost",
    bg: "linear-gradient(180deg, #2a1748 0%, #1f1138 50%, #0d0820 100%)",
    overlay:
      "radial-gradient(45% 30% at 30% 60%, rgba(180,120,255,0.28), transparent 75%), radial-gradient(40% 28% at 70% 70%, rgba(120,80,200,0.25), transparent 75%), radial-gradient(60% 30% at 50% 18%, rgba(160,100,220,0.2), transparent 70%)",
    groundTint: "rgba(40,10,60,0.7)",
  },
  fire: {
    key: "fire",
    bg: "linear-gradient(180deg, #3a1208 0%, #6e1d0c 40%, #c2410c 75%, #f97316 100%)",
    overlay:
      "radial-gradient(40% 28% at 28% 78%, rgba(253,224,71,0.4), transparent 70%), radial-gradient(36% 26% at 72% 82%, rgba(253,186,116,0.45), transparent 70%), radial-gradient(60% 30% at 50% 12%, rgba(0,0,0,0.35), transparent 80%)",
    groundTint: "rgba(60,10,0,0.7)",
  },
  ice: {
    key: "ice",
    bg: "linear-gradient(180deg, #d6f1ff 0%, #a8d8f0 38%, #7eb6d8 70%, #4d8db0 100%)",
    overlay:
      "repeating-linear-gradient(180deg, rgba(255,255,255,0.25) 0 1px, transparent 1px 6px), radial-gradient(45% 22% at 50% 30%, rgba(255,255,255,0.45), transparent 70%)",
    groundTint: "rgba(20,40,80,0.45)",
  },
  gym: {
    key: "gym",
    bg: "linear-gradient(180deg, #d1d5db 0%, #9ca3af 45%, #4b5563 100%)",
    overlay:
      "repeating-linear-gradient(90deg, rgba(0,0,0,0.16) 0 2px, transparent 2px 28px), repeating-linear-gradient(0deg, rgba(0,0,0,0.12) 0 2px, transparent 2px 28px), radial-gradient(70% 32% at 50% 8%, rgba(255,255,255,0.5), transparent 70%)",
    groundTint: "rgba(0,0,0,0.65)",
  },
  sunset: {
    key: "sunset",
    bg: "linear-gradient(180deg, #ff9a76 0%, #ff7e8b 35%, #c266a4 70%, #4f3973 100%)",
    overlay:
      "radial-gradient(28% 18% at 50% 38%, rgba(255,236,160,0.85), transparent 70%), radial-gradient(60% 22% at 50% 80%, rgba(60,30,80,0.55), transparent 70%)",
    groundTint: "rgba(50,15,55,0.6)",
  },
};

const ALL_SCENES: SceneKey[] = [
  "grass","forest","cave","beach","night","ghost","fire","ice","gym","sunset",
];

/** 캐릭터 속성별 선호 배경 — 후보군 (없으면 전체에서 픽). */
const SCENES_BY_TYPE: Record<PokemonType, SceneKey[]> = {
  전기:   ["night",  "gym",   "sunset"],
  불꽃:   ["fire",   "sunset","cave"],
  물:     ["beach",  "ice",   "night"],
  풀:     ["grass",  "forest","sunset"],
  고스트: ["ghost",  "night", "cave"],
  비행:   ["sunset", "grass", "night"],
  바위:   ["cave",   "gym",   "forest"],
  벌레:   ["forest", "grass", "night"],
};

/** 현재 시간 버킷 (1시간 단위). */
function currentHourBucket(): number {
  return Math.floor(Date.now() / (60 * 60 * 1000));
}

/** 결정적 PRNG — bucket·species·stage 시드 기반. */
function seededRand(seed: number): number {
  // mulberry32
  let t = seed >>> 0;
  t = (t + 0x6d2b79f5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
}

/** species + stage + bucket → SceneKey. 70% 선호 / 30% 전체. */
function pickSceneKey(
  type: PokemonType,
  species: StarterSpecies,
  stage: number,
  bucket: number
): SceneKey {
  const seed =
    bucket * 1009 +
    species.charCodeAt(0) * 131 +
    species.charCodeAt(species.length - 1) * 17 +
    stage * 53;
  const r1 = seededRand(seed);
  const preferred = SCENES_BY_TYPE[type] ?? ALL_SCENES;
  const pool = r1 < 0.7 ? preferred : ALL_SCENES;
  const r2 = seededRand(seed + 1);
  return pool[Math.floor(r2 * pool.length)] ?? "grass";
}

/** LCD (16:9) 안에 들어가는 레트로 필드 배경 — 캐릭터 뒤 레이어.
 *  자체 그림자 발판도 포함. CRT 스캔라인은 부모(LCD wrapper) 측에서 그림. */
function LcdScene({
  type,
  species,
  stage,
  reduce,
}: {
  type: PokemonType;
  species: StarterSpecies;
  stage: number;
  reduce: boolean;
}) {
  const [bucket, setBucket] = useState<number>(() => currentHourBucket());
  // 매 1분마다 시간 버킷 변경 감지. 변경 시 새 키로 크로스페이드.
  useEffect(() => {
    const id = window.setInterval(() => {
      const next = currentHourBucket();
      setBucket((cur) => (cur !== next ? next : cur));
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  const sceneKey = useMemo(
    () => pickSceneKey(type, species, stage, bucket),
    [type, species, stage, bucket]
  );
  const scene = SCENE_STYLES[sceneKey];

  return (
    <AnimatePresence mode="sync">
      <motion.div
        key={sceneKey}
        aria-hidden
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduce ? 0.01 : 0.7, ease: "easeOut" }}
        style={{ background: scene.bg }}
      >
        {scene.overlay && (
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{ background: scene.overlay }}
          />
        )}
        {/* 가장자리 비네팅 — 캐릭터가 묻히지 않게 가운데 살짝 밝게 */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(70% 60% at 50% 55%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.18) 70%, rgba(0,0,0,0.32) 100%)",
          }}
        />
        {/* 발판 — 캐릭터 아래 작은 타원 그림자 (게임 필드 위에 서 있는 느낌) */}
        <div
          aria-hidden
          className="absolute left-1/2 -translate-x-1/2 bottom-[10%] w-[55%] h-[7%] rounded-[50%]"
          style={{ background: scene.groundTint, filter: "blur(6px)" }}
        />
      </motion.div>
    </AnimatePresence>
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
  remaining,
}: {
  phase: Phase;
  species: StarterSpecies | null;
  rollsCount: number;
  reachedCap: boolean;
  remaining: number;
}) {
  const line = useMemo(() => {
    if (phase === "intro") {
      if (remaining === 0) {
        return "어라…?\n남은 포켓몬이 없어요. 모두 다른 트레이너와 함께해요.";
      }
      return rollsCount === 0
        ? "안녕!\n함께할 첫 포켓몬을 만나러 가보자."
        : "좋아!\n다음 친구도 만나러 가볼까?";
    }
    if (phase === "throwing") return "몬스터볼을 던졌다!";
    if (phase === "wobble") return "몬스터볼이 흔들리고 있다…";
    if (phase === "reveal" && species) {
      const m = STARTER_META[species];
      return `${m.name}(이)가 모습을 드러냈다!`;
    }
    if (phase === "between") {
      if (reachedCap) return "5번 모두 만나봤다.\n마음에 든 친구를 골라보자!";
      return "이 친구로 정할까?\n다시 한 번 만나봐도 좋아.";
    }
    return "";
  }, [phase, species, rollsCount, reachedCap, remaining]);

  return <NarrationFrame line={line} />;
}

/* ─────────── CTA 영역 ─────────── */
function CtaArea({
  phase,
  rollsCount,
  reachedCap,
  remaining,
  rolls,
  onThrow,
  onPickLast,
  onShowList,
  onPickIdx,
}: {
  phase: Phase;
  rollsCount: number;
  reachedCap: boolean;
  remaining: number;
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
                        <span className="text-sm font-black text-white truncate">
                          {m.name}
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
        {phase === "intro" && remaining > 0 && (
          <ThrowCta label="몬스터볼 던지기" onClick={onThrow} />
        )}
        {phase === "intro" && remaining === 0 && (
          <button
            type="button"
            disabled
            className="w-full h-12 rounded-xl bg-zinc-800/70 border border-zinc-700 text-zinc-400 text-sm font-black cursor-not-allowed"
          >
            남은 포켓몬 없음
          </button>
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
            {remaining > 0 ? (
              <ThrowCta
                label={`다시 뽑기 (${MAX_ROLLS - rollsCount})`}
                onClick={onThrow}
              />
            ) : (
              <button
                type="button"
                disabled
                className="h-12 rounded-xl bg-zinc-800/70 border border-zinc-700 text-zinc-400 text-sm font-black cursor-not-allowed"
              >
                남은 포켓몬 없음
              </button>
            )}
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
function OwnedView({ starter: initialStarter }: { starter: MyStarter }) {
  const { user } = useAuth();
  const reduce = useReducedMotion();
  const router = useRouter();
  const [starter, setStarter] = useState<MyStarter>(initialStarter);
  const species = starter.species as StarterSpecies;
  const meta = STARTER_META[species];
  const stage = starter.evolution_stage ?? 0;
  const stageInfo = effectiveStage(species, stage);
  const isMax = (starter.is_max ?? starter.level >= 30) === true;
  const evoTarget = nextEvolveStage(species, stage, starter.level);
  const canEvolve = !isMax && evoTarget !== null;

  const [counts, setCounts] = useState<StarterCompanionCounts | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
  const [evolveOpen, setEvolveOpen] = useState(false);
  const [feedReaction, setFeedReaction] = useState<FeedReaction | null>(null);
  const feedReactionTimerRef = useRef<number | null>(null);
  const evoToastShownRef = useRef<Set<number>>(new Set());

  // 동일 속성 PCL10 카운트 (사용 중 제외) — 캐릭터 속성 기준.
  const reloadCounts = useCallback(() => {
    if (!user) return;
    fetchStarterCompanionCounts(user.id, meta.type).then(setCounts);
  }, [user, meta.type]);
  useEffect(() => {
    let alive = true;
    if (user) {
      fetchStarterCompanionCounts(user.id, meta.type).then((c) => {
        if (alive) setCounts(c);
      });
    }
    return () => {
      alive = false;
    };
  }, [user, meta.type]);

  // body scroll lock — 풀스크린 모드 동안. 중첩 안전 ref-count 락 사용.
  useBodyScrollLock(true);

  // 진화 가능 토스트 — stage 별 1회. 새로 도달했거나 진입 시 이미 가능 상태.
  useEffect(() => {
    if (!canEvolve) return;
    const key = stage;
    if (evoToastShownRef.current.has(key)) return;
    evoToastShownRef.current.add(key);
    setToast(pickEvolveToast());
    const id = window.setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(id);
  }, [canEvolve, stage]);

  const power = computePower(meta, starter.level);
  const xpCur = starter.xp ?? 0;
  const xpMax = starter.next_exp ?? LEVEL_EXP_TABLE[starter.level] ?? 100;
  const xpDisplay = isMax ? { cur: 0, max: 1 } : { cur: xpCur, max: xpMax };

  const onFeedClick = useCallback(() => {
    if (isMax) return;
    setFeedOpen(true);
  }, [isMax]);
  const onEvolveClick = useCallback(() => {
    if (!canEvolve) return;
    setEvolveOpen(true);
  }, [canEvolve]);

  /** 강화 응답을 starter 상태에 머지. 진화 가능 토스트는 별도 effect 가 잡음. */
  const applyEnhanceResult = useCallback(
    (r: EnhanceResult) => {
      if (!r.ok) return;
      setStarter((prev) => ({
        ...prev,
        level: r.level ?? prev.level,
        xp: r.xp ?? prev.xp,
        next_exp: r.next_exp ?? prev.next_exp,
        evolution_stage: r.evolution_stage ?? prev.evolution_stage,
        is_max: r.is_max ?? prev.is_max,
        max_stage: r.max_stage ?? prev.max_stage,
      }));
      // 카운트 갱신 (재료 소비됨)
      reloadCounts();
    },
    [reloadCounts]
  );

  const applyEvolveSuccess = useCallback(
    (newStage: number) => {
      setStarter((prev) => ({ ...prev, evolution_stage: newStage }));
      // 토스트 리셋 — 다음 진화 단계 도달 시 다시 표시되도록.
      // 현재 stage 는 이미 보여줬으므로 그대로 둠.
    },
    []
  );

  const showToast = useCallback((msg: string, ms = 2400) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), ms);
  }, []);

  const triggerFeedReaction = useCallback((tier: FeedReactionTier) => {
    if (feedReactionTimerRef.current != null) {
      clearTimeout(feedReactionTimerRef.current);
      feedReactionTimerRef.current = null;
    }
    setFeedReaction({
      key: Date.now(),
      tier,
      message: pickFeedReactionLine(tier),
    });
    // 톤별로 노출 시간 살짝 차등 — crit 가 가장 길게.
    const ms = tier === "crit" ? 3200 : tier === "great" ? 2800 : 2400;
    feedReactionTimerRef.current = window.setTimeout(() => {
      setFeedReaction(null);
      feedReactionTimerRef.current = null;
    }, ms);
  }, []);

  useEffect(() => {
    return () => {
      if (feedReactionTimerRef.current != null) {
        clearTimeout(feedReactionTimerRef.current);
      }
    };
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
            // 안테나(-top-7 = 28px) + LED 펄스 여유. 모바일에서 디바이스 상단이
            // 잘려 보이지 않도록 충분한 여백.
            paddingTop: "calc(max(env(safe-area-inset-top, 0px), 0px) + 40px)",
            paddingBottom: "max(env(safe-area-inset-bottom, 0px), 14px)",
          }}
        >
          <PokedexDevice
            meta={meta}
            starter={starter}
            stageInfo={stageInfo}
            power={power}
            xp={xpDisplay}
            isMax={isMax}
            canEvolve={canEvolve}
            reduce={reduce ?? false}
            onFeed={onFeedClick}
            onEvolve={onEvolveClick}
            onHome={() => router.push("/")}
            onHelp={() => setHelpOpen(true)}
            counts={counts}
            feedReaction={feedReaction}
          />
        </div>

        {/* 토스트 */}
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast}
              initial={{ y: -12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -8, opacity: 0 }}
              className="absolute top-16 inset-x-3 z-40 flex justify-center pointer-events-none"
            >
              <div className="rounded-2xl bg-amber-400 text-zinc-950 px-4 py-2.5 text-[13px] font-black shadow-[0_8px_22px_-8px_rgba(0,0,0,0.7)] border-2 border-zinc-900 max-w-md text-center leading-snug whitespace-pre-line">
                {toast}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 도움말 모달 */}
        <AnimatePresence>
          {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
        </AnimatePresence>

        {/* 먹이주기 모달 */}
        <AnimatePresence>
          {feedOpen && user && (
            <FeedModal
              userId={user.id}
              meta={meta}
              starter={starter}
              onClose={() => setFeedOpen(false)}
              onResult={(r) => {
                applyEnhanceResult(r);
                if (r.ok && r.xp_gained != null) {
                  // 결과 토스트 (등급 다양성 — log 의 가장 좋은 등급)
                  const best = pickBestGrade(r.log ?? []);
                  showToast(
                    `${best.tag} +${r.xp_gained.toLocaleString("ko-KR")} EXP${
                      (r.levels_up ?? 0) > 0
                        ? `\nLv.${r.level} 로 ${r.levels_up}단계 성장!`
                        : ""
                    }`,
                    3000
                  );
                  // 캐릭터 본인이 반응하는 말풍선 + 이펙트.
                  triggerFeedReaction(best.tier);
                }
              }}
            />
          )}
        </AnimatePresence>

        {/* 진화 모달 */}
        <AnimatePresence>
          {evolveOpen && user && evoTarget && (
            <EvolveModal
              userId={user.id}
              fromInfo={stageInfo}
              toInfo={evoTarget}
              meta={meta}
              onClose={() => setEvolveOpen(false)}
              onSuccess={(newStage) => {
                applyEvolveSuccess(newStage);
                showToast(
                  `${stageInfo.name} → ${evoTarget.name}!\n진화 완료!`,
                  3200
                );
              }}
            />
          )}
        </AnimatePresence>
      </div>
    </Portal>
  );
}

/* ─────────── 도감 디바이스 (메인 UI) ─────────── */
function PokedexDevice({
  meta,
  starter,
  stageInfo,
  power,
  xp,
  isMax,
  canEvolve,
  reduce,
  onFeed,
  onEvolve,
  onHome,
  onHelp,
  counts,
  feedReaction,
}: {
  meta: SpeciesMeta;
  starter: MyStarter;
  stageInfo: EvolutionStageInfo;
  power: number;
  xp: { cur: number; max: number };
  isMax: boolean;
  canEvolve: boolean;
  reduce: boolean;
  onFeed: () => void;
  onEvolve: () => void;
  onHome: () => void;
  onHelp: () => void;
  counts: StarterCompanionCounts | null;
  feedReaction: FeedReaction | null;
}) {
  const xpPct = isMax
    ? 100
    : xp.max > 0
    ? Math.min(100, Math.max(0, (xp.cur / xp.max) * 100))
    : 0;

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0, y: 12 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.2, 1.4, 0.4, 1] }}
      className="relative w-full max-w-[340px]"
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
        {/* 본체 광택 — 헤더 영역 위는 transparent (모바일 회색끼 방지),
            LCD 베젤 부근부터 약하게 들어가 광택감만 살림. */}
        <span
          aria-hidden
          className="absolute inset-x-0 top-[18%] h-[20%] pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.08) 60%, rgba(255,255,255,0) 100%)",
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

        {/* 헤더 — LED 라인. 좁힌 max-w 에 맞춰 padding/gap/LED 사이즈 모두 살짝 축소.
            PCL10 표시는 가독성 유지 — 카운트 텍스트 크기는 그대로. */}
        <div className="relative px-3.5 pt-2.5 pb-1.5 flex items-center gap-2">
          {/* 큰 파란 LED — 전원, 펄스 */}
          <motion.span
            aria-hidden
            className="relative w-9 h-9 rounded-full ring-2 ring-zinc-900 shrink-0"
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
            <span className="absolute top-0.5 left-1 w-3 h-3 rounded-full bg-white/75" />
            <span className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-white/30" />
          </motion.span>

          {/* 작은 LED 3개 — R Y G, 사이클로 깜빡 */}
          <div className="flex items-center gap-1">
            {[
              { c: "#fb7185", d: 0 },
              { c: "#fde047", d: 0.33 },
              { c: "#34d399", d: 0.66 },
            ].map((led, i) => (
              <motion.span
                key={i}
                aria-hidden
                className="w-2 h-2 rounded-full ring-1 ring-zinc-900"
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
          <div className="flex flex-col gap-0.5 ml-0.5 shrink-0">
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

        {/* LCD 스크린 — 검정 베젤 + 레트로 필드 배경 + 캐릭터.
            모바일 스크롤 더 줄이려 비율 16/9 + 캐릭터 96px 로 축소 (이전 16/10·110px).
            배경은 LcdScene 이 캐릭터 속성 + 시간 버킷 기반으로 결정 (저작권
            없는 CSS-only 필드, 1시간마다 자연 전환). */}
        <div className="mx-3.5 mb-2.5 rounded-xl bg-zinc-900 p-1.5 ring-2 ring-black/60 shadow-[inset_0_2px_6px_rgba(0,0,0,0.6)]">
          <div
            className="relative rounded-lg aspect-[16/9] flex items-center justify-center overflow-hidden bg-zinc-800"
          >
            {/* 레트로 게임풍 필드 — 캐릭터 뒤 레이어 */}
            <LcdScene
              type={meta.type}
              species={meta.species}
              stage={starter.evolution_stage ?? 0}
              reduce={reduce}
            />
            {/* CRT 스캔라인 */}
            <div
              aria-hidden
              className="absolute inset-0 opacity-50 pointer-events-none"
              style={{
                background:
                  "repeating-linear-gradient(0deg, transparent 0, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 3px)",
              }}
            />
            {/* 캐릭터 — LCD 안 (현재 stage dex 사용).
                 feedReaction 있을 때만 통통 점프 + 글로우, 평소엔 idle bob. */}
            <motion.div
              key={feedReaction?.key ?? "idle"}
              animate={
                reduce
                  ? undefined
                  : feedReaction
                  ? feedReaction.tier === "crit"
                    ? { y: [0, -18, 0, -10, 0], scale: [1, 1.08, 1, 1.04, 1] }
                    : feedReaction.tier === "great"
                    ? { y: [0, -14, 0, -6, 0], scale: [1, 1.06, 1, 1.02, 1] }
                    : { y: [0, -10, 0], scale: [1, 1.04, 1] }
                  : { y: [0, -3, 0] }
              }
              transition={
                feedReaction
                  ? { duration: feedReaction.tier === "crit" ? 1.2 : 0.9, ease: "easeInOut" }
                  : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }
              }
              style={{ filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.4))" }}
            >
              <PokemonImg dex={stageInfo.dex} name={stageInfo.name} size={96} />
            </motion.div>

            {/* 먹이 반응 이펙트 — 빛 폭발 + 반짝이/하트/별 */}
            <AnimatePresence>
              {feedReaction && !reduce && (
                <FeedReactionEffect
                  key={feedReaction.key}
                  tier={feedReaction.tier}
                  accent={meta.accent}
                />
              )}
            </AnimatePresence>

            {/* 말풍선 — 캐릭터 위쪽에 떠 있다가 페이드 아웃 (LCD 안쪽 상단) */}
            <AnimatePresence>
              {feedReaction && (
                <FeedSpeechBubble
                  key={feedReaction.key}
                  tier={feedReaction.tier}
                  message={feedReaction.message}
                />
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* 액션 버튼 — 캐릭터(LCD)와 정보 패널 사이.
            상태별 분기: MAX / 진화 가능 / 일반 (먹이 주기). */}
        <div className="px-3.5 mb-2.5">
          <ActionButton
            isMax={isMax}
            canEvolve={canEvolve}
            onFeed={onFeed}
            onEvolve={onEvolve}
            reduce={reduce}
          />
        </div>

        {/* 정보 패널 — 베이지 종이. padding/text 살짝 조여 정보 패널 높이 ~24px 절감. */}
        <div className="mx-3.5 mb-2.5 rounded-md bg-[#fafaf5] border-[3px] border-zinc-900 px-3 py-2.5 shadow-[0_2px_0_0_rgba(15,23,42,0.85)]">
          {/* 이름 + LV */}
          <div className="flex items-center justify-between gap-3 mb-1.5 pb-1.5 border-b-[1.5px] border-dashed border-zinc-300">
            <p className="text-[16px] font-black text-zinc-900 truncate">
              {starter.nickname}
            </p>
            <span className="shrink-0 inline-flex items-baseline gap-0.5 px-1.5 py-0.5 rounded-md bg-zinc-900 text-amber-300">
              <span className="text-[9px] font-bold tracking-wider">LV</span>
              <span className="text-sm font-black tabular-nums">
                {starter.level}
              </span>
            </span>
          </div>

          {/* EXP 바 */}
          <div className="space-y-1 mb-2">
            <div className="flex items-center justify-between text-[10px] font-black text-zinc-500 tracking-wider">
              <span>EXP</span>
              <span className="tabular-nums">
                {isMax
                  ? "MAX"
                  : `${xp.cur.toLocaleString("ko-KR")} / ${xp.max.toLocaleString("ko-KR")}`}
              </span>
            </div>
            <div className="relative h-2 rounded-full bg-zinc-200 overflow-hidden border border-zinc-400">
              <motion.div
                className={clsx(
                  "h-full",
                  isMax
                    ? "bg-gradient-to-r from-amber-300 to-orange-400"
                    : "bg-gradient-to-r from-emerald-400 to-cyan-400"
                )}
                initial={{ width: 0 }}
                animate={{ width: `${xpPct}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            </div>
          </div>

          {/* 정보 row */}
          <dl className="space-y-1 text-[12px]">
            <Row label="포켓몬">
              <span className="font-black text-zinc-900">{stageInfo.name}</span>
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
                +{power.toLocaleString("ko-KR")}
              </span>
            </Row>
          </dl>
        </div>

        {/* 하단 — D-pad + A·B 버튼.
            B 는 장식 그대로, A 는 실제 동작하는 홈 버튼으로 사용. */}
        <div className="px-3.5 pb-3 flex items-center justify-between">
          <DPad />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onHelp}
              aria-label="도움말"
              style={{ touchAction: "manipulation" }}
              className="w-8 h-8 rounded-full bg-gradient-to-b from-zinc-100 to-zinc-300 ring-2 ring-zinc-900 inline-flex items-center justify-center text-zinc-800 active:translate-y-[1px] active:shadow-inner shadow-[0_2px_0_0_rgba(0,0,0,0.55)] transition-transform"
            >
              <HelpIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onHome}
              aria-label="메인으로"
              style={{ touchAction: "manipulation" }}
              className="w-8 h-8 rounded-full bg-gradient-to-b from-zinc-100 to-zinc-300 ring-2 ring-zinc-900 inline-flex items-center justify-center text-zinc-800 active:translate-y-[1px] active:shadow-inner shadow-[0_2px_0_0_rgba(0,0,0,0.55)] transition-transform"
            >
              <PokeballNavIcon className="w-4 h-4" />
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
        className="w-full max-w-sm flex flex-col"
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.92, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 6 }}
        transition={{ duration: 0.28, ease: [0.2, 1.4, 0.4, 1] }}
        // 모달 자체 높이 제한 — 모바일 dvh 기반 + safari 폴백.
        // 외부 wrapper 가 이미 safe-area 패딩을 잡았으므로 32px 만 추가
        // 여백으로 빼면 됨.
        style={{ maxHeight: "calc(100dvh - 32px)" }}
      >
        {/* 외관 — 도감과 같은 톤 (빨간 본체 + 검정 보더 + 베이지 본문) */}
        <div
          className="relative rounded-2xl overflow-hidden border-[3px] border-zinc-900 shadow-[0_18px_36px_-10px_rgba(0,0,0,0.85)] flex flex-col min-h-0"
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

          {/* 헤더 — 항상 보이도록 shrink-0 */}
          <div className="relative px-4 pt-4 pb-3 flex items-center gap-2 shrink-0">
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

          {/* 스크롤 영역 — 내용이 화면 높이 초과 시 모달 내부에서만 스크롤. */}
          <div
            className="flex-1 min-h-0 overflow-y-auto px-4 pb-4"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <div className="rounded-md bg-[#fafaf5] border-[3px] border-zinc-900 px-4 py-3.5 shadow-[0_2px_0_0_rgba(15,23,42,0.85)] space-y-2.5 text-zinc-900">
              <div>
                <h2 className="text-[14px] font-black mb-0.5">내 포켓몬 안내</h2>
                <p className="text-[11px] text-zinc-700 leading-snug">
                  핵심 규칙만 짧게 정리했어요.
                </p>
              </div>

              <HelpRow label="1. 포켓몬 선택">
                처음에 포켓몬 1마리를 선택해요.<br />
                다른 유저가 고른 포켓몬은 선택할 수 없어요.
              </HelpRow>

              <HelpRow label="2. 먹이 주기">
                같은 속성의 PCL10 카드(<strong className="font-black">MUR / UR / SAR</strong>) 만 먹이로 사용 가능.<br />
                체육관·전시·펫 등록 중인 카드는 제외돼요.
              </HelpRow>

              <HelpRow label="3. 성장">
                먹이를 주면 EXP 가 차고 레벨이 올라요.<br />
                <strong className="font-black">Lv.1 시작 → Lv.30 MAX.</strong>
              </HelpRow>

              <HelpRow label="4. 진화">
                <strong className="font-black">Lv.10</strong> — 1차 진화 가능.<br />
                <strong className="font-black">Lv.20</strong> — 2차 진화 가능.<br />
                진화 가능 시 &ldquo;강화하기&rdquo; 버튼이 &ldquo;진화하기&rdquo;로 바뀌어요.
              </HelpRow>

              <HelpRow label="5. 전투력">
                레벨이 오르면 유저 전투력이 증가해요.<br />
                표시·랭킹용이며 체육관 전투 스탯에는 영향 없음.
              </HelpRow>

              <HelpRow label="6. 배경">
                접속할 때마다 배경이 랜덤 표시돼요.<br />
                일정 시간이 지나면 다른 배경으로 바뀔 수 있어요.
              </HelpRow>
            </div>
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
      <p className="text-[11px] font-black text-zinc-900">{label}</p>
      <p className="text-[12px] text-zinc-700 leading-snug">{children}</p>
    </div>
  );
}

/* ─────────── 액션 버튼 — 먹이주기 / 진화하기 / MAX 분기 ─────────── */
function ActionButton({
  isMax,
  canEvolve,
  onFeed,
  onEvolve,
  reduce,
}: {
  isMax: boolean;
  canEvolve: boolean;
  onFeed: () => void;
  onEvolve: () => void;
  reduce: boolean;
}) {
  if (isMax) {
    return (
      <button
        type="button"
        disabled
        className="w-full h-11 rounded-xl border-[3px] border-zinc-900 bg-gradient-to-b from-zinc-200 to-zinc-400 text-zinc-700 text-sm font-black tracking-[0.32em] shadow-[0_4px_0_0_rgba(15,23,42,0.65)] cursor-not-allowed"
      >
        ★ MAX
      </button>
    );
  }
  if (canEvolve) {
    return (
      <motion.button
        type="button"
        onClick={onEvolve}
        style={{ touchAction: "manipulation" }}
        animate={
          reduce
            ? undefined
            : {
                boxShadow: [
                  "0 4px 0 0 rgba(15,23,42,0.85), 0 0 0 0 rgba(236,72,153,0.0)",
                  "0 4px 0 0 rgba(15,23,42,0.85), 0 0 18px 4px rgba(236,72,153,0.55)",
                  "0 4px 0 0 rgba(15,23,42,0.85), 0 0 0 0 rgba(236,72,153,0.0)",
                ],
              }
        }
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        className="w-full h-11 rounded-xl border-[3px] border-zinc-900 bg-gradient-to-b from-violet-400 via-fuchsia-400 to-rose-400 text-white text-sm font-black tracking-[0.22em] active:translate-y-[2px] transition-transform shadow-[0_4px_0_0_rgba(15,23,42,0.85)] active:shadow-[0_1px_0_0_rgba(15,23,42,0.85)]"
      >
        <span
          className="inline-flex items-center justify-center gap-1.5"
          style={{ textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}
        >
          <StarGlyph />
          진화하기
          <StarGlyph />
        </span>
      </motion.button>
    );
  }
  return (
    <button
      type="button"
      onClick={onFeed}
      style={{ touchAction: "manipulation" }}
      className="w-full h-11 rounded-xl border-[3px] border-zinc-900 bg-gradient-to-b from-amber-300 to-amber-500 text-zinc-900 text-sm font-black tracking-[0.22em] active:translate-y-[2px] transition-all shadow-[0_4px_0_0_rgba(15,23,42,0.85)] active:shadow-[0_1px_0_0_rgba(15,23,42,0.85)]"
    >
      <span className="inline-flex items-center justify-center gap-1.5">
        <BoltGlyph />
        먹이 주기
        <BoltGlyph flipped />
      </span>
    </button>
  );
}

function StarGlyph() {
  return (
    <svg
      viewBox="0 0 12 12"
      width={10}
      height={10}
      fill="currentColor"
      aria-hidden
    >
      <path d="M6 0 L7.4 4.3 L12 4.3 L8.3 7 L9.7 11.5 L6 8.7 L2.3 11.5 L3.7 7 L0 4.3 L4.6 4.3 Z" />
    </svg>
  );
}

/* ─────────── 진화 가능 토스트 메시지 ─────────── */
const EVOLVE_TOAST_MESSAGES = [
  "진화 준비 완료!\n포켓몬이 갑자기 반짝거리기 시작했어요.",
  "지금입니다! 진화 타이밍!\n포켓몬 표정이 비장합니다.",
  "어라? 분위기가 이상한데요?\n주변 공기가 웅성웅성해요.",
  "포켓몬이 꿈틀댑니다!\n설마… 아니 맞아요, 진화할 준비가 됐어요!",
  "진화 가능!\n포켓몬이 오늘따라 주인공처럼 빛나고 있어요.",
];
function pickEvolveToast(): string {
  const i = Math.floor(Math.random() * EVOLVE_TOAST_MESSAGES.length);
  return EVOLVE_TOAST_MESSAGES[i]!;
}

function pickBestGrade(
  log: Array<{ grade: "normal" | "great" | "crit" }>
): { tag: string; tier: FeedReactionTier } {
  if (log.some((l) => l.grade === "crit"))
    return { tag: "초대성공!!", tier: "crit" };
  if (log.some((l) => l.grade === "great"))
    return { tag: "대성공!", tier: "great" };
  return { tag: "냠냠!", tier: "normal" };
}

/* ─────────── 먹이 반응 (캐릭터 말풍선 + 이펙트) ───────────
   결과 등급에 맞는 톤의 랜덤 문구를 캐릭터 근처에 띄움.
   같은 메시지가 연속해 나오지 않도록 단순 랜덤 + 결과 등급별 톤 분기. */
type FeedReactionTier = "normal" | "great" | "crit";

const FEED_REACTION_LINES: Record<FeedReactionTier, string[]> = {
  normal: [
    "오! 이거 꽤 맛있는데요?",
    "냠냠… 힘이 나는 것 같아요!",
    "방금 그거 또 없나요?",
    "좋아요! 조금 더 강해진 느낌이에요!",
    "먹었더니 몸이 반짝거리는 기분이에요!",
    "이 맛은… 성장의 맛!",
    "우와, 지금 좀 세진 것 같은데요?",
    "한 입 먹었는데 갑자기 자신감이 생겼어요!",
  ],
  great: [
    "오오! 이건 제대로 먹혔어요!",
    "방금 건 효과가 엄청났어요!",
    "힘이 확 올라오는 느낌이에요!",
  ],
  crit: [
    "대박! 지금 몸에서 빛이 납니다!",
    "이건 그냥 먹이가 아니라 전설의 한 입이었어요!",
    "잠깐만요… 저 지금 엄청 강해진 것 같은데요?!",
  ],
};

function pickFeedReactionLine(tier: FeedReactionTier): string {
  const lines = FEED_REACTION_LINES[tier];
  return lines[Math.floor(Math.random() * lines.length)]!;
}

interface FeedReaction {
  /** 매번 새 키로 갱신 → AnimatePresence 가 같은 등급도 재생할 수 있음. */
  key: number;
  tier: FeedReactionTier;
  message: string;
}

/* ─────────── 캐릭터 위 떠다니는 말풍선 (게임 톤) ─────────── */
function FeedSpeechBubble({
  tier,
  message,
}: {
  tier: FeedReactionTier;
  message: string;
}) {
  // 톤별 컬러 — crit 가 가장 화려, normal 은 차분.
  const palette =
    tier === "crit"
      ? { bg: "#fef3c7", border: "#b45309", text: "#7c2d12" }
      : tier === "great"
      ? { bg: "#fde68a", border: "#a16207", text: "#7c2d12" }
      : { bg: "#fafaf5", border: "#0f172a", text: "#0f172a" };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.85 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.92 }}
      transition={{ type: "spring", stiffness: 320, damping: 18 }}
      className="absolute left-1/2 top-1.5 -translate-x-1/2 z-10 pointer-events-none"
      style={{ maxWidth: "92%" }}
    >
      <div
        className="relative rounded-xl px-2.5 py-1 text-[11px] font-black leading-snug whitespace-pre-line text-center"
        style={{
          background: palette.bg,
          color: palette.text,
          border: `2px solid ${palette.border}`,
          boxShadow: "0 3px 0 0 rgba(15,23,42,0.55)",
          letterSpacing: "0.005em",
        }}
      >
        {message}
        {/* 꼬리 — 캐릭터 쪽으로 향하는 작은 삼각형 */}
        <span
          aria-hidden
          className="absolute left-1/2 -bottom-[7px] -translate-x-1/2"
          style={{
            width: 0,
            height: 0,
            borderLeft: "6px solid transparent",
            borderRight: "6px solid transparent",
            borderTop: `7px solid ${palette.border}`,
          }}
        />
        <span
          aria-hidden
          className="absolute left-1/2 -bottom-[4.5px] -translate-x-1/2"
          style={{
            width: 0,
            height: 0,
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderTop: `5px solid ${palette.bg}`,
          }}
        />
      </div>
    </motion.div>
  );
}

/* ─────────── 먹이 반응 이펙트 — 빛 폭발 / 반짝이 / 하트 / 별 ─────────── */
function FeedReactionEffect({
  tier,
  accent,
}: {
  tier: FeedReactionTier;
  accent: string;
}) {
  // 등급에 따라 입자 수와 종류 차등.
  const particleCount = tier === "crit" ? 12 : tier === "great" ? 8 : 6;
  const glyphs =
    tier === "crit"
      ? ["★", "✦", "♥", "✧"]
      : tier === "great"
      ? ["★", "✦", "♥"]
      : ["♥", "✦"];
  const flashOpacity = tier === "crit" ? 0.85 : tier === "great" ? 0.6 : 0.4;

  return (
    <motion.div
      className="absolute inset-0 pointer-events-none z-[5]"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* 빛 폭발 — 캐릭터 중심에서 뻗는 라디얼 */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{ opacity: [0, flashOpacity, 0], scale: [0.4, 1.6, 2.2] }}
        transition={{ duration: 0.9, ease: "easeOut" }}
        style={{
          background: `radial-gradient(40% 40% at 50% 60%, ${accent}cc 0%, ${accent}55 35%, transparent 70%)`,
          mixBlendMode: "screen",
        }}
      />

      {/* 입자 — 별/하트가 위쪽으로 흩날리며 페이드 */}
      {Array.from({ length: particleCount }).map((_, i) => {
        const glyph = glyphs[i % glyphs.length]!;
        const angle = (i / particleCount) * Math.PI * 2;
        const radius = 36 + (i % 3) * 8;
        const dx = Math.cos(angle) * radius;
        const dy = Math.sin(angle) * radius - 14;
        const delay = (i % 4) * 0.05;
        const size = 10 + (i % 3) * 3;
        const isStar = glyph === "★" || glyph === "✦" || glyph === "✧";
        return (
          <motion.span
            key={i}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-black"
            style={{
              fontSize: size,
              color: isStar ? "#fde047" : "#f472b6",
              textShadow: "0 1px 2px rgba(0,0,0,0.6)",
            }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
            animate={{
              x: dx,
              y: dy,
              opacity: [0, 1, 1, 0],
              scale: [0.4, 1.1, 1, 0.9],
              rotate: isStar ? [0, 25, -15, 0] : 0,
            }}
            transition={{
              duration: tier === "crit" ? 1.3 : 1.05,
              delay,
              ease: "easeOut",
            }}
          >
            {glyph}
          </motion.span>
        );
      })}
    </motion.div>
  );
}

/* ─────────── 먹이 주기 모달 ─────────── */
function FeedModal({
  userId,
  meta,
  onClose,
  onResult,
}: {
  userId: string;
  meta: SpeciesMeta;
  starter: MyStarter;
  onClose: () => void;
  onResult: (r: EnhanceResult) => void;
}) {
  const [materials, setMaterials] = useState<StarterMaterial[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchStarterMaterials(userId).then((list) => {
      if (!alive) return;
      setMaterials(list);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  // ESC + body lock
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const groups = useMemo(() => {
    const g: Record<"MUR" | "UR" | "SAR", StarterMaterial[]> = {
      MUR: [],
      UR: [],
      SAR: [],
    };
    for (const m of materials) g[m.rarity].push(m);
    return g;
  }, [materials]);

  const previewExp = useMemo(() => {
    let sum = 0;
    for (const id of selected) {
      const m = materials.find((x) => x.id === id);
      if (!m) continue;
      sum += previewMaterialExp(m.rarity);
    }
    return sum;
  }, [selected, materials]);

  const submit = useCallback(async () => {
    if (selected.size === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    const r = await enhanceMyStarter(userId, Array.from(selected));
    setSubmitting(false);
    if (!r.ok) {
      setError(r.error ?? "먹이를 줄 수 없었어요.");
      return;
    }
    onResult(r);
    onClose();
  }, [selected, submitting, userId, onResult, onClose]);

  return (
    <motion.div
      className="absolute inset-0 z-[210] flex items-end md:items-center justify-center bg-black/85 backdrop-blur-sm px-3"
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
        className="w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 16, opacity: 0 }}
        transition={{ duration: 0.32, ease: "easeOut" }}
      >
        <div
          className="relative rounded-2xl overflow-hidden border-[3px] border-zinc-900 shadow-[0_18px_36px_-10px_rgba(0,0,0,0.85)]"
          style={{
            background:
              "linear-gradient(180deg, #d6202e 0%, #b71625 55%, #8a0d1c 100%)",
          }}
        >
          <div className="px-4 pt-4 pb-2 flex items-center gap-2">
            <p className="text-[12px] font-black tracking-[0.22em] text-zinc-900">
              먹이 주기
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

          {/* 예상 EXP */}
          <div className="mx-4 mb-3 rounded-md bg-black/25 border border-black/40 px-3 py-2 flex items-center justify-between">
            <span className="text-[11px] font-black tracking-wider text-zinc-100">
              선택 {selected.size}장
            </span>
            <span
              className="text-[13px] font-black text-white tabular-nums"
              style={{ textShadow: "0 1px 2px rgba(0,0,0,0.7)" }}
            >
              +{previewExp.toLocaleString("ko-KR")} EXP
            </span>
          </div>

          {/* 재료 리스트 */}
          <div className="mx-4 mb-3 rounded-md bg-[#fafaf5] border-[3px] border-zinc-900 px-3 py-3 max-h-[50dvh] overflow-y-auto">
            {loading ? (
              <p className="text-[12px] font-bold text-zinc-700 text-center py-6">
                재료 불러오는 중…
              </p>
            ) : materials.length === 0 ? (
              <p className="text-[12px] font-bold text-zinc-700 text-center py-6 leading-relaxed">
                사용할 수 있는 같은 속성 PCL10 재료가 없어요.
                <br />
                <span className="text-[10px] text-zinc-500 font-semibold">
                  다른 속성 카드는 이 포켓몬의 먹이로 사용할 수 없어요.
                </span>
              </p>
            ) : (
              <>
                <p className="text-[10px] font-black tracking-[0.18em] text-emerald-700 mb-2">
                  ●같은 속성({meta.type}) PCL10 만 사용 가능
                </p>
                {(["MUR", "UR", "SAR"] as const).map(
                  (r) =>
                    groups[r].length > 0 && (
                      <div key={r} className="mb-3 last:mb-0">
                        <p className="text-[10px] font-black tracking-[0.18em] text-zinc-600 mb-1.5">
                          {r} ({groups[r].length})
                        </p>
                        <ul className="grid grid-cols-2 gap-1.5">
                          {groups[r].map((m) => {
                            const exp = previewMaterialExp(m.rarity);
                            const isSelected = selected.has(m.id);
                            // 카탈로그 룩업 — 카드 이름 우선, 없으면 코드.
                            const card = getCard(m.card_id);
                            const displayName = card?.name ?? m.card_id;
                            return (
                              <li key={m.id}>
                                <button
                                  type="button"
                                  onClick={() => toggle(m.id)}
                                  style={{ touchAction: "manipulation" }}
                                  className={clsx(
                                    "w-full rounded-md border-2 px-2 py-1.5 text-left transition active:scale-[0.98]",
                                    isSelected
                                      ? "bg-amber-300 border-zinc-900 shadow-[0_2px_0_0_rgba(15,23,42,0.7)]"
                                      : "bg-white border-zinc-300"
                                  )}
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      className={clsx(
                                        "text-[9px] font-black px-1 py-0.5 rounded",
                                        m.rarity === "MUR"
                                          ? "bg-amber-500 text-white"
                                          : m.rarity === "UR"
                                          ? "bg-fuchsia-500 text-white"
                                          : "bg-sky-500 text-white"
                                      )}
                                    >
                                      {m.rarity}
                                    </span>
                                    {m.wild_type && (
                                      <span className="text-[9px] font-black px-1 py-0.5 rounded bg-zinc-200 text-zinc-700">
                                        {m.wild_type}
                                      </span>
                                    )}
                                  </div>
                                  <p className="mt-0.5 text-[11px] font-black text-zinc-900 truncate">
                                    {displayName}
                                  </p>
                                  {card && (
                                    <p className="text-[9px] font-semibold text-zinc-500 truncate tabular-nums">
                                      {m.card_id}
                                    </p>
                                  )}
                                  <p className="text-[10px] font-black text-amber-700 tabular-nums">
                                    +{exp.toLocaleString("ko-KR")} EXP
                                  </p>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )
                )}
              </>
            )}
          </div>

          {error && (
            <p className="px-4 mb-2 text-[12px] font-bold text-amber-200">
              {error}
            </p>
          )}

          <div className="px-4 pb-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onClose}
              style={{ touchAction: "manipulation" }}
              className="h-12 rounded-xl bg-white/10 border border-white/20 text-white text-sm font-bold active:scale-[0.98]"
            >
              취소
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={selected.size === 0 || submitting}
              style={{ touchAction: "manipulation" }}
              className={clsx(
                "h-12 rounded-xl border-[3px] border-zinc-900 text-sm font-black active:translate-y-[2px] transition-all shadow-[0_4px_0_0_rgba(15,23,42,0.85)] active:shadow-[0_1px_0_0_rgba(15,23,42,0.85)]",
                selected.size > 0 && !submitting
                  ? "bg-gradient-to-b from-amber-300 to-amber-500 text-zinc-900"
                  : "bg-zinc-300 text-zinc-500 cursor-not-allowed"
              )}
            >
              {submitting ? "주는 중…" : `먹이 주기 (${selected.size})`}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─────────── 진화 모달 ─────────── */
function EvolveModal({
  userId,
  fromInfo,
  toInfo,
  meta,
  onClose,
  onSuccess,
}: {
  userId: string;
  fromInfo: EvolutionStageInfo;
  toInfo: EvolutionStageInfo;
  meta: SpeciesMeta;
  onClose: () => void;
  onSuccess: (newStage: number) => void;
}) {
  const [phase, setPhase] = useState<"confirm" | "animating" | "done">(
    "confirm"
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase === "confirm") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, phase]);

  const submit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    const r = await evolveMyStarter(userId);
    setSubmitting(false);
    if (r.ok && r.evolution_stage != null) {
      setPhase("animating");
      window.setTimeout(() => {
        setPhase("done");
        onSuccess(r.evolution_stage!);
      }, 1700);
      window.setTimeout(onClose, 2900);
    } else {
      onClose();
    }
  }, [submitting, userId, onSuccess, onClose]);

  return (
    <motion.div
      className="absolute inset-0 z-[230] flex items-center justify-center bg-black/90 backdrop-blur-md px-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {phase === "confirm" && (
        <motion.div
          className="w-full max-w-sm"
          initial={{ scale: 0.92, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.2, 1.4, 0.4, 1] }}
        >
          <div className="rounded-2xl overflow-hidden border-[3px] border-zinc-900 bg-gradient-to-b from-violet-500 via-fuchsia-500 to-rose-500 shadow-[0_18px_36px_-10px_rgba(0,0,0,0.85)]">
            <div className="px-5 pt-5 pb-3 text-center">
              <p
                className="text-[11px] font-black tracking-[0.32em] text-white/90"
                style={{ textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}
              >
                EVOLUTION
              </p>
              <p
                className="mt-1 text-base font-black text-white"
                style={{ textShadow: "0 1px 2px rgba(0,0,0,0.7)" }}
              >
                {fromInfo.name} → {toInfo.name}
              </p>
            </div>
            <div className="mx-4 mb-3 rounded-md bg-zinc-900 p-2 ring-2 ring-black/60">
              <div
                className="rounded aspect-[16/9] flex items-center justify-around overflow-hidden"
                style={{
                  background: `linear-gradient(180deg, ${TYPE_COLOR[meta.type].soft}55 0%, #d8d6a5 30%, #b8b687 100%)`,
                }}
              >
                <PokemonImg
                  dex={fromInfo.dex}
                  name={fromInfo.name}
                  size={70}
                />
                <span className="text-zinc-700 text-xl font-black">→</span>
                <PokemonImg dex={toInfo.dex} name={toInfo.name} size={70} />
              </div>
            </div>
            <p className="px-5 pb-3 text-[12px] font-bold text-white/90 text-center leading-relaxed">
              진화하면 되돌릴 수 없어요. 함께할 준비됐나요?
            </p>
            <div className="px-4 pb-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onClose}
                style={{ touchAction: "manipulation" }}
                className="h-12 rounded-xl bg-white/15 border border-white/25 text-white text-sm font-bold active:scale-[0.98]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                style={{ touchAction: "manipulation" }}
                className="h-12 rounded-xl border-[3px] border-zinc-900 bg-gradient-to-b from-amber-300 to-amber-500 text-zinc-900 text-sm font-black active:translate-y-[2px] shadow-[0_4px_0_0_rgba(15,23,42,0.85)] active:shadow-[0_1px_0_0_rgba(15,23,42,0.85)]"
              >
                {submitting ? "진화 중…" : "진화하기"}
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {phase === "animating" && (
        <EvolveAnimation fromInfo={fromInfo} toInfo={toInfo} />
      )}

      {phase === "done" && (
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 180, damping: 14 }}
          className="text-center"
        >
          <div
            className="inline-flex items-center justify-center w-44 h-44 rounded-3xl mb-2"
            style={{
              background: `radial-gradient(circle, ${meta.accent}55 0%, transparent 70%)`,
            }}
          >
            <PokemonImg dex={toInfo.dex} name={toInfo.name} size={150} />
          </div>
          <p className="text-[11px] uppercase tracking-[0.32em] text-amber-300 font-black">
            EVOLVED!
          </p>
          <h2 className="mt-1 text-2xl font-black text-white">
            {toInfo.name}
          </h2>
        </motion.div>
      )}
    </motion.div>
  );
}

function EvolveAnimation({
  fromInfo,
  toInfo,
}: {
  fromInfo: EvolutionStageInfo;
  toInfo: EvolutionStageInfo;
}) {
  return (
    <motion.div
      className="relative w-44 h-44 flex items-center justify-center"
      initial={{ scale: 0.9 }}
      animate={{ scale: 1 }}
    >
      {/* 빛 폭발 */}
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-full bg-white"
        initial={{ scale: 0.4, opacity: 0.95 }}
        animate={{ scale: [0.4, 2.2, 4], opacity: [0.95, 0.6, 0] }}
        transition={{ duration: 1.6, ease: "easeOut" }}
      />
      {/* 캐릭터 cross-fade */}
      <motion.div
        className="absolute"
        initial={{ opacity: 1, scale: 1 }}
        animate={{ opacity: 0, scale: 1.4 }}
        transition={{ duration: 0.8 }}
      >
        <PokemonImg dex={fromInfo.dex} name={fromInfo.name} size={140} />
      </motion.div>
      <motion.div
        className="absolute"
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, delay: 0.9 }}
      >
        <PokemonImg dex={toInfo.dex} name={toInfo.name} size={140} />
      </motion.div>
    </motion.div>
  );
}

/* D-pad 작은 장식 */
function DPad() {
  return (
    <div
      aria-hidden
      className="relative w-11 h-11 rounded-md"
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

