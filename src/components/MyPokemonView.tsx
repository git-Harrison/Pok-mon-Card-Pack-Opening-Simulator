"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useAuth } from "@/lib/auth";
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
import PokeLoader from "./PokeLoader";
import Portal from "./Portal";
import { HelpIcon, PokeballNavIcon } from "./icons/NavIcons";

/* ─────────── 종 정의 ───────────
   src/lib/wild/name-to-dex.ts 의 dex 번호와 1:1 — 야생/체육관 sprite
   매핑 시스템 (wildSpriteUrl) 그대로 재사용 → 실제 포켓몬 GIF.

   선택 가능 10종 (기본형). 모든 유저 통틀어 같은 종은 1명만 가질 수 있음
   (server-side unique constraint — 20260696 마이그레이션).
*/
type StarterSpecies =
  | "pikachu"
  | "charmander"
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
  bulbasaur:  { species: "bulbasaur",  name: "이상해씨", dex: 1,   greet: "이상해씨~", accent: "#22c55e", type: "풀",     basePower: 1050 },
  pidgey:     { species: "pidgey",     name: "구구",     dex: 16,  greet: "구구구",    accent: "#a16207", type: "비행",   basePower: 950  },
  poliwag:    { species: "poliwag",    name: "발챙이",   dex: 60,  greet: "발챙!",     accent: "#38bdf8", type: "물",     basePower: 1050 },
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

/** 전투력 — basePower + level × 100. 향후 정식 시스템 도입 시 서버 산식으로 교체. */
function computePower(meta: SpeciesMeta, level: number): number {
  return meta.basePower + Math.max(0, level) * 100;
}

/* ─────────── 진화 라인 ─────────── */
interface EvolutionStageInfo {
  dex: number;
  name: string;
}

/** 종 → stage[0..max] (인덱스 = evolution_stage).
 *  pikachu 는 2단 (라이츄 까지 — 카논상 추가 진화 없음). 그 외 9종은 3단. */
const EVOLUTION_LINES: Record<StarterSpecies, EvolutionStageInfo[]> = {
  pikachu:    [{ dex: 25,  name: "피카츄"   }, { dex: 26,  name: "라이츄"   }],
  charmander: [{ dex: 4,   name: "파이리"   }, { dex: 5,   name: "리자드"   }, { dex: 6,   name: "리자몽"   }],
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

/** 재료 base EXP — 동일 속성 ×1.03 / 등급 일반×1.0·대성공×1.2·초대성공×1.5. */
const MATERIAL_EXP: Record<"MUR" | "UR" | "SAR", number> = {
  MUR: 10000,
  UR: 200,
  SAR: 20,
};

/** 재료 1장의 일반 성공(보너스 없음) 예상 EXP — 미리보기 표시용. */
function previewMaterialExp(
  rarity: "MUR" | "UR" | "SAR",
  sameType: boolean
): number {
  const base = MATERIAL_EXP[rarity];
  return Math.floor(base * (sameType ? 1.03 : 1.0));
}

/** 선택 가능 10종 — server `pick_my_starter` 의 v_allowed 와 동일. */
const STARTER_LIST: StarterSpecies[] = [
  "pikachu", "charmander", "bulbasaur", "pidgey", "poliwag",
  "gastly", "chikorita", "chimchar", "geodude", "caterpie",
];

type Phase =
  | "loading"
  | "owned"
  | "intro"   // 선택 그리드
  | "naming"  // 별명 입력
  | "saving"  // 서버 저장 중
  | "done";   // 등록 완료 연출

/* ─────────── 진입점 ─────────── */
export default function MyPokemonView() {
  const { user } = useAuth();
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("loading");
  const [starter, setStarter] = useState<MyStarter | null>(null);
  const [taken, setTaken] = useState<string[]>([]);
  const [pickedSpecies, setPickedSpecies] = useState<StarterSpecies | null>(null);
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

  const startNaming = useCallback((species: StarterSpecies) => {
    setPickedSpecies(species);
    setNickname("");
    setSaveError(null);
    setPhase("naming");
  }, []);

  const cancelNaming = useCallback(() => {
    setPickedSpecies(null);
    setSaveError(null);
    setPhase("intro");
  }, []);

  const confirmName = useCallback(async () => {
    if (!user || !pickedSpecies) return;
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
    const res = await pickMyStarter(user.id, pickedSpecies, trimmed);
    if (!res.ok) {
      // 이미 본인이 등록한 경우 — 서버가 starter 를 돌려줌.
      if (res.starter) {
        setStarter(res.starter);
        setPhase("owned");
        return;
      }
      // 다른 유저가 방금 데려간 경우 — 목록 새로고침 후 안내.
      await refreshTaken();
      setSaveError(res.error ?? "저장에 실패했어요.");
      setPhase("naming");
      return;
    }
    setStarter(res.starter ?? null);
    setPhase("done");
    window.setTimeout(() => setPhase("owned"), reduce ? 400 : 2200);
  }, [user, pickedSpecies, nickname, reduce, refreshTaken]);

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
      taken={taken}
      onSelect={startNaming}
      reduce={reduce ?? false}
      naming={
        phase === "naming" && pickedSpecies
          ? {
              species: pickedSpecies,
              nickname,
              error: saveError,
              onChange: setNickname,
              onCancel: cancelNaming,
              onConfirm: confirmName,
            }
          : null
      }
      saving={
        phase === "saving" && pickedSpecies
          ? { species: pickedSpecies, nickname }
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
  taken,
  onSelect,
  reduce,
  naming,
  saving,
  done,
}: {
  phase: Phase;
  taken: string[];
  onSelect: (species: StarterSpecies) => void;
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

  // 다른 유저가 가져간 종은 화면에서 제외. 본인은 아직 미선택 상태에서만
  // 이 scene 에 도달하므로 taken 안의 종 = "선택 불가".
  const takenSet = useMemo(() => new Set(taken), [taken]);
  const available = useMemo(
    () => STARTER_LIST.filter((s) => !takenSet.has(s)),
    [takenSet]
  );
  const remaining = available.length;
  const total = STARTER_LIST.length;

  return (
    <Portal>
      <div className="fixed inset-0 z-[200] overflow-y-auto">
        {/* 배경 — 하늘 → 잔디 그라데이션 */}
        <SceneBackdrop reduce={reduce} />

        {/* 상단 바 — 닫기 + 남은 포켓몬 카운트 */}
        <div
          className="sticky top-0 left-0 right-0 z-30 flex items-center justify-between px-3"
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
          <div className="rounded-full bg-black/55 backdrop-blur px-3 py-1.5 text-[11px] font-black text-white tracking-wider">
            남은 포켓몬{" "}
            <span className="text-amber-300 tabular-nums">
              {remaining}
            </span>
            <span className="text-white/55"> / {total}</span>
          </div>
        </div>

        {/* 본문 — 타이틀 + 그리드 / 빈 상태 */}
        <div
          className="relative z-10 mx-auto max-w-md px-3"
          style={{
            paddingTop: 8,
            paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)",
          }}
        >
          <div className="text-center mt-1 mb-3">
            <p className="text-[10px] uppercase tracking-[0.32em] text-amber-300 font-black">
              내 첫 포켓몬
            </p>
            <h1
              className="mt-1 text-xl font-black text-white"
              style={{ textShadow: "0 2px 6px rgba(0,0,0,0.7)" }}
            >
              함께할 친구를 골라보자
            </h1>
            <p className="mt-1 text-[11px] font-bold text-zinc-300">
              한 종은 한 트레이너만 가질 수 있어요.
            </p>
          </div>

          {available.length === 0 ? (
            <EmptyAvailable />
          ) : (
            <SpeciesGrid
              species={available}
              onSelect={onSelect}
              reduce={reduce}
              disabled={phase !== "intro"}
            />
          )}
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

/* ─────────── 선택 그리드 ───────────
   남은(아직 아무 트레이너도 선택하지 않은) 포켓몬을 카드 형태로 표시.
   탭 → onSelect(species) 로 별명 입력 단계 진입.
*/
function SpeciesGrid({
  species,
  onSelect,
  reduce,
  disabled,
}: {
  species: StarterSpecies[];
  onSelect: (species: StarterSpecies) => void;
  reduce: boolean;
  disabled: boolean;
}) {
  return (
    <ul className="grid grid-cols-2 gap-2.5">
      {species.map((s, i) => {
        const meta = STARTER_META[s];
        return (
          <li key={s}>
            <motion.button
              type="button"
              onClick={() => !disabled && onSelect(s)}
              disabled={disabled}
              style={{ touchAction: "manipulation" }}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: reduce ? 0 : i * 0.04 }}
              whileTap={reduce ? undefined : { scale: 0.97 }}
              className={clsx(
                "relative w-full rounded-2xl overflow-hidden border-[3px] border-zinc-900",
                "bg-gradient-to-b from-white/12 to-white/5 backdrop-blur",
                "text-left active:translate-y-[1px] transition-transform",
                "shadow-[0_6px_0_0_rgba(15,23,42,0.85)]",
                disabled && "opacity-60 cursor-not-allowed"
              )}
            >
              {/* 후광 — 종 액센트 컬러 */}
              <span
                aria-hidden
                className="absolute -top-6 -right-6 w-24 h-24 rounded-full pointer-events-none"
                style={{
                  background: `radial-gradient(circle, ${meta.accent}55 0%, transparent 70%)`,
                }}
              />
              <div className="relative px-3 pt-2.5 pb-3 flex flex-col items-center gap-1.5">
                <span
                  className="inline-flex items-center justify-center w-20 h-20 rounded-2xl"
                  style={{ background: `${meta.accent}26` }}
                >
                  <PokemonImg dex={meta.dex} name={meta.name} size={72} />
                </span>
                <p
                  className="text-sm font-black text-white tracking-tight"
                  style={{ textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}
                >
                  {meta.name}
                </p>
                <TypeBadge type={meta.type} />
              </div>
            </motion.button>
          </li>
        );
      })}
    </ul>
  );
}

/** 모든 포켓몬이 다른 트레이너에게 선택된 상태. */
function EmptyAvailable() {
  return (
    <div className="rounded-2xl border-[3px] border-zinc-900 bg-[#fafaf5] text-zinc-900 px-4 py-6 text-center shadow-[0_4px_0_0_rgba(15,23,42,0.85)]">
      <p className="text-base font-black">남은 포켓몬이 없어요.</p>
      <p className="mt-1.5 text-[12.5px] font-bold text-zinc-700 leading-relaxed">
        모든 포켓몬이 다른 트레이너의 친구가 됐어요.
        <br />
        새 포켓몬이 풀리면 다시 안내드릴게요.
      </p>
    </div>
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

  // body scroll lock — 풀스크린 모드 동안.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

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
}) {
  const typeColor = TYPE_COLOR[meta.type];
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
            {/* 캐릭터 — LCD 안 (현재 stage dex 사용) */}
            <motion.div
              animate={reduce ? undefined : { y: [0, -3, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              style={{ filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.4))" }}
            >
              <PokemonImg dex={stageInfo.dex} name={stageInfo.name} size={110} />
            </motion.div>
          </div>
        </div>

        {/* 액션 버튼 — 캐릭터(LCD)와 정보 패널 사이.
            상태별 분기: MAX / 진화 가능 / 일반 (먹이 주기). */}
        <div className="px-4 mb-3">
          <ActionButton
            isMax={isMax}
            canEvolve={canEvolve}
            onFeed={onFeed}
            onEvolve={onEvolve}
            reduce={reduce}
          />
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
                {isMax
                  ? "MAX"
                  : `${xp.cur.toLocaleString("ko-KR")} / ${xp.max.toLocaleString("ko-KR")}`}
              </span>
            </div>
            <div className="relative h-2.5 rounded-full bg-zinc-200 overflow-hidden border border-zinc-400">
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
          <dl className="space-y-1.5 text-[12.5px]">
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

            <HelpRow label="먹이 주기">
              PCL10 카드(MUR / UR / SAR)를 재료로 줘서 EXP 를 얻고 레벨업해요.
              <strong className="font-black"> SAR 20 / UR 200 / MUR 10,000 EXP</strong>
              가 기본이고, 동속성 재료는 <strong className="font-black">+3%</strong>{" "}
              보너스. 7% 확률로 대성공(×1.2), 1% 확률로 초대성공(×1.5).
            </HelpRow>

            <HelpRow label="진화">
              Lv.10 / Lv.20 도달 시 진화 가능 상태가 돼요. 진화는{" "}
              <strong className="font-black">100% 성공</strong>이며, 진화하면
              새로운 모습으로 바뀌어요. (피카츄는 라이츄까지 1단 진화.)
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
        className="w-full h-12 rounded-xl border-[3px] border-zinc-900 bg-gradient-to-b from-zinc-200 to-zinc-400 text-zinc-700 text-sm font-black tracking-[0.32em] shadow-[0_4px_0_0_rgba(15,23,42,0.65)] cursor-not-allowed"
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
        className="w-full h-12 rounded-xl border-[3px] border-zinc-900 bg-gradient-to-b from-violet-400 via-fuchsia-400 to-rose-400 text-white text-sm font-black tracking-[0.22em] active:translate-y-[2px] transition-transform shadow-[0_4px_0_0_rgba(15,23,42,0.85)] active:shadow-[0_1px_0_0_rgba(15,23,42,0.85)]"
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
      className="w-full h-12 rounded-xl border-[3px] border-zinc-900 bg-gradient-to-b from-amber-300 to-amber-500 text-zinc-900 text-sm font-black tracking-[0.22em] active:translate-y-[2px] transition-all shadow-[0_4px_0_0_rgba(15,23,42,0.85)] active:shadow-[0_1px_0_0_rgba(15,23,42,0.85)]"
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
): { tag: string } {
  if (log.some((l) => l.grade === "crit")) return { tag: "초대성공!!" };
  if (log.some((l) => l.grade === "great")) return { tag: "대성공!" };
  return { tag: "냠냠!" };
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
      sum += previewMaterialExp(m.rarity, m.wild_type === meta.type);
    }
    return sum;
  }, [selected, materials, meta.type]);

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
              <p className="text-[12px] font-bold text-zinc-700 text-center py-6">
                사용할 수 있는 PCL10 재료가 없어요.
              </p>
            ) : (
              (["MUR", "UR", "SAR"] as const).map(
                (r) =>
                  groups[r].length > 0 && (
                    <div key={r} className="mb-3 last:mb-0">
                      <p className="text-[10px] font-black tracking-[0.18em] text-zinc-600 mb-1.5">
                        {r} ({groups[r].length})
                      </p>
                      <ul className="grid grid-cols-2 gap-1.5">
                        {groups[r].map((m) => {
                          const sameType = m.wild_type === meta.type;
                          const exp = previewMaterialExp(m.rarity, sameType);
                          const isSelected = selected.has(m.id);
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
                                  {sameType && (
                                    <span className="text-[8px] font-black text-emerald-700 tracking-wider">
                                      ●동속성
                                    </span>
                                  )}
                                </div>
                                <p className="mt-0.5 text-[10px] font-bold text-zinc-800 truncate">
                                  {m.card_id}
                                </p>
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
              )
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

