"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import clsx from "clsx";
import { useAuth } from "@/lib/auth";
import {
  abandonGymChallenge,
  computeUserCenterPower,
  fetchMyPets,
  resolveGymBattle,
  type RawPetGrading,
} from "@/lib/gym/db";
import type {
  BattleTurn,
  BattleUnit,
  Gym,
  GymBattleResult,
} from "@/lib/gym/types";
import { effectiveness } from "@/lib/wild/typechart";
import { TYPE_STYLE, type WildType } from "@/lib/wild/types";
import { resolveCardType as resolvePetType } from "@/lib/wild/name-to-type";
import { lookupDex } from "@/lib/wild/name-to-dex";
import { cardSpriteUrl } from "@/lib/wild/card-sprite";
import { wildSpriteUrl } from "@/lib/wild/pool";
import { getCard } from "@/lib/sets";
import { RARITY_STYLE } from "@/lib/rarity";
import { slabStats } from "@/lib/wild/stats";
import Portal from "./Portal";
import NpcDialogModal from "./NpcDialogModal";

const VICTORY_LINES: string[] = [
  "분하다... 네 실력을 인정한다.",
  "오늘은 내가 졌다. 강해졌구나...",
  "네 펫들도 훌륭하군. 이 체육관은 이제 너의 것이다.",
  "내 메달을 가져가게. 자랑스럽게 차게나.",
  "패배는 인정한다. 다음엔 반드시 되찾으러 가겠다.",
  "정말 강한 트레이너야. 이 길을 계속 걸어주게.",
];

const DEFEAT_LINES: string[] = [
  "더 단련하고 다시 오너라. 기다리고 있겠다.",
  "체육관 관장은 그리 만만치 않다네!",
  "패배에서 배우는 자만이 강해진다. 다음을 기약하지!",
  "내 메달은 쉽게 내주지 않는다. 더 강해져서 와라!",
  "포기하지 마라. 내일 다시 도전해도 좋다.",
  "기죽지 마라. 또 만나자, 트레이너!",
];

function pickLine(arr: readonly string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 펫 grading + 카드 카탈로그 머지된 클라 표시용 데이터. */
interface MyPet {
  grading_id: string;
  card_id: string;
  card_name: string;
  rarity: keyof typeof RARITY_STYLE;
  grade: number;
  type: WildType | null;
  imageUrl?: string;
  baseHp: number;
  baseAtk: number;
}

// resolvePetType — lib/wild/name-to-type.ts 의 resolveCardType alias.

function mergePet(g: RawPetGrading): MyPet | null {
  const card = getCard(g.card_id);
  const rarity = (card?.rarity ?? g.rarity) as keyof typeof RARITY_STYLE;
  const name = card?.name ?? g.card_id;
  const stats = slabStats(rarity, g.grade);
  return {
    grading_id: g.grading_id,
    card_id: g.card_id,
    card_name: name,
    rarity,
    grade: g.grade,
    type: card ? resolvePetType(card.name) : null,
    imageUrl: card?.imageUrl,
    baseHp: stats.hp,
    baseAtk: stats.atk,
  };
}

type Phase =
  | "picking"      // 펫 3마리 선택
  | "fighting"     // 서버에 전투 요청 + 턴 로그 애니메이션
  | "result";      // 결과 패널

interface Props {
  gym: Gym;
  challengeId: string;
  /** 닫기 — 현재 도전이 진행 중이면 abandonGymChallenge 호출 후 닫음. */
  onClose: () => void;
  /** 전투 후 부모에게 새 상태 fetch 트리거. */
  onResolved: () => void;
}

export default function GymChallengeOverlay({
  gym,
  challengeId,
  onClose,
  onResolved,
}: Props) {
  const { user, setPoints } = useAuth();
  const reduce = useReducedMotion();

  const [phase, setPhase] = useState<Phase>("picking");
  const [pets, setPets] = useState<MyPet[]>([]);
  const [loadingPets, setLoadingPets] = useState(true);
  const [centerPower, setCenterPower] = useState<number>(0);
  // 사용자가 선택한 펫의 grading_id 출전 순서.
  const [order, setOrder] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [battle, setBattle] = useState<GymBattleResult | null>(null);
  const resolvedRef = useRef(false);

  const userId = user?.id ?? null;

  // 1) 펫 + center_power 로드.
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      const [raw, cp] = await Promise.all([
        fetchMyPets(userId),
        computeUserCenterPower(userId),
      ]);
      if (!alive) return;
      const merged = raw.map(mergePet).filter((p): p is MyPet => p !== null);
      setPets(merged);
      setCenterPower(cp);
      setLoadingPets(false);
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  // 2) ESC + body lock.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase !== "fighting") doClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const doClose = useCallback(async () => {
    if (resolvedRef.current) {
      onClose();
      return;
    }
    // 결과까지 안 갔다면 챌린지 abandoned 처리.
    if (userId && phase === "picking") {
      await abandonGymChallenge(userId, challengeId).catch(() => {});
    }
    onClose();
  }, [onClose, userId, phase, challengeId]);

  const togglePet = useCallback(
    (id: string) => {
      setOrder((prev) => {
        if (prev.includes(id)) return prev.filter((x) => x !== id);
        if (prev.length >= 3) return prev;
        return [...prev, id];
      });
    },
    []
  );

  const movePet = useCallback((id: string, dir: -1 | 1) => {
    setOrder((prev) => {
      const idx = prev.indexOf(id);
      if (idx < 0) return prev;
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      const t = next[target];
      next[target] = next[idx];
      next[idx] = t;
      return next;
    });
  }, []);

  const startBattle = useCallback(async () => {
    if (!userId) return;
    if (order.length !== 3) {
      setError("펫 3마리를 선택해주세요.");
      return;
    }
    setError(null);
    setPhase("fighting");

    const idMap = new Map(pets.map((p) => [p.grading_id, p]));
    const selectedPets = order
      .map((id) => idMap.get(id))
      .filter((p): p is MyPet => Boolean(p));
    if (selectedPets.length !== 3) {
      setError("펫 정보가 일치하지 않아요.");
      setPhase("picking");
      return;
    }

    const gradingIds = selectedPets.map((p) => p.grading_id);
    const petTypes = selectedPets.map((p) => p.type ?? "노말");
    const res = await resolveGymBattle(userId, gym.id, challengeId, gradingIds, petTypes);

    if (!res.ok) {
      setError(res.error ?? "전투 실패");
      setPhase("picking");
      return;
    }
    if (typeof res.points === "number") setPoints(res.points);
    resolvedRef.current = true;
    setBattle(res);
    onResolved();
    // fighting 단계는 계속 — BattlePlayback 이 turn_log 다 끝나면 result 로 전이.
  }, [userId, order, pets, gym.id, challengeId, setPoints, onResolved]);

  // 결과 phase 진입 시 NPC 대화 모달도 자동 노출 (immersion).
  const [npcResultOpen, setNpcResultOpen] = useState(false);
  const [npcResultLine, setNpcResultLine] = useState<string>("");
  const onPlaybackEnd = useCallback(() => {
    setPhase("result");
    if (battle?.result === "won") {
      setNpcResultLine(pickLine(VICTORY_LINES));
    } else {
      setNpcResultLine(pickLine(DEFEAT_LINES));
    }
    setNpcResultOpen(true);
  }, [battle]);

  // 펫 정렬 & 추천 보너스 — 클라 측 미리보기 (서버 권위 결과는 RPC).
  const previewBonus = useCallback(
    (slot: number, basePet: MyPet) => {
      const ratio = slot === 1 ? 0.10 : slot === 2 ? 0.08 : 0.06;
      const raw = Math.round((centerPower ?? 0) * ratio);
      const cap = Math.round(basePet.baseAtk * 1.5);
      return Math.min(raw, cap);
    },
    [centerPower]
  );

  const orderedPets = useMemo(() => {
    const map = new Map(pets.map((p) => [p.grading_id, p]));
    return order
      .map((id) => map.get(id))
      .filter((p): p is MyPet => Boolean(p));
  }, [order, pets]);

  return (
    <Portal>
      <motion.div
        className="fixed inset-0 z-[110] bg-black/90 flex items-end md:items-center justify-center px-2 md:px-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={doClose}
      >
        <motion.div
          className="relative w-full max-w-md bg-zinc-950 border border-white/10 rounded-2xl flex flex-col overflow-hidden max-h-[92vh]"
          onClick={(e) => e.stopPropagation()}
          initial={reduce ? false : { y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { y: 24, opacity: 0 }}
        >
          {/* Header */}
          <div className="px-3 py-2 border-b border-white/10 flex items-center gap-2">
            <span aria-hidden className="text-base">⚔️</span>
            <h2 className="text-sm font-black text-white truncate flex-1">
              {gym.name} · 도전
            </h2>
            <button
              type="button"
              onClick={doClose}
              disabled={phase === "fighting"}
              className={clsx(
                "shrink-0 w-8 h-8 rounded-lg text-sm font-bold",
                phase === "fighting"
                  ? "bg-white/5 text-zinc-600 cursor-not-allowed"
                  : "bg-white/5 hover:bg-white/10 text-white/80"
              )}
              aria-label="닫기"
              style={{ touchAction: "manipulation" }}
            >
              ✕
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {phase === "picking" && (
              <PickerPhase
                pets={pets}
                loading={loadingPets}
                gym={gym}
                centerPower={centerPower}
                order={order}
                orderedPets={orderedPets}
                onToggle={togglePet}
                onMove={movePet}
                error={error}
                onStart={startBattle}
                previewBonus={previewBonus}
              />
            )}
            {phase === "fighting" && battle?.ok && (
              <BattlePlayback battle={battle} gym={gym} onEnd={onPlaybackEnd} reduce={!!reduce} />
            )}
            {phase === "fighting" && !battle && (
              <div className="p-6 text-center text-sm text-zinc-300">
                ⚔️ 전투 시뮬레이션 중...
              </div>
            )}
            {phase === "result" && battle && (
              <ResultPhase battle={battle} gym={gym} onClose={doClose} />
            )}
          </div>
        </motion.div>
      </motion.div>

      {/* 결과 발표 — 관장 NPC 의 immersive 한 마지막 한 마디 */}
      <AnimatePresence>
        {npcResultOpen && phase === "result" && battle && (
          <NpcDialogModal
            type={gym.type}
            leaderName={gym.leader_name}
            gymName={gym.name}
            tone={battle.result === "won" ? "victory" : "defeat"}
            line={npcResultLine}
            onClose={() => setNpcResultOpen(false)}
          >
            {battle.result === "won" && (
              <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.06] px-3 py-2 text-[11px] text-amber-100 leading-snug">
                🏆 {gym.medal?.name ?? "메달"} 획득
                {typeof battle.capture_reward === "number" && (
                  <>
                    {" · "}
                    <span className="tabular-nums">
                      +{battle.capture_reward.toLocaleString("ko-KR")}P
                    </span>
                  </>
                )}
              </div>
            )}
          </NpcDialogModal>
        )}
      </AnimatePresence>
    </Portal>
  );
}

/* ─────────────── Picker ─────────────── */

function PickerPhase({
  pets,
  loading,
  gym,
  centerPower,
  order,
  orderedPets,
  onToggle,
  onMove,
  error,
  onStart,
  previewBonus,
}: {
  pets: MyPet[];
  loading: boolean;
  gym: Gym;
  centerPower: number;
  order: string[];
  orderedPets: MyPet[];
  onToggle: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  error: string | null;
  onStart: () => void;
  previewBonus: (slot: number, p: MyPet) => number;
}) {
  // 체육관 속성 매칭 강제 — 같은 속성 펫만 노출.
  const matchingPets = useMemo(
    () => pets.filter((p) => p.type === gym.type),
    [pets, gym.type]
  );
  const insufficient = !loading && matchingPets.length < 3;

  return (
    <div className="p-3 md:p-4 space-y-3">
      <div className="rounded-xl border border-amber-400/40 bg-amber-400/[0.08] px-3 py-2 text-[11px] md:text-[12px] text-amber-100 leading-snug">
        ⚡ <b className="text-white">{gym.type}</b> 속성 체육관 — 도전 펫
        3마리 모두 <b>{gym.type}</b> 속성이어야 합니다.
        {!loading && (
          <span className="ml-1 text-amber-200/85">
            (보유 {gym.type} 속성 펫 {matchingPets.length}/3+)
          </span>
        )}
      </div>
      {/* 상대 라인업 요약 */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-2.5">
        <p className="text-[11px] uppercase tracking-wider text-zinc-400 mb-1.5">
          상대 — {gym.leader_name} ({gym.type})
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          {gym.pokemon.map((p) => {
            const ts = TYPE_STYLE[p.type as WildType];
            return (
              <div
                key={p.id}
                className="rounded-lg bg-zinc-900/60 border border-white/10 p-1.5 flex flex-col items-center gap-0.5"
              >
                <div className="w-10 h-10">
                  <img
                    src={wildSpriteUrl(p.dex, true)}
                    alt=""
                    draggable={false}
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain"
                    style={{ imageRendering: "pixelated" }}
                  />
                </div>
                <p className="text-[9px] font-bold text-white truncate w-full text-center">
                  {p.name}
                </p>
                <span className={clsx("px-1 py-[1px] rounded text-[7px] font-black", ts.badge)}>
                  {p.type}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* 출전 순서 */}
      <section className="rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-2.5">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[11px] uppercase tracking-wider text-amber-200">
            내 출전 순서 ({order.length}/3)
          </p>
          <p className="text-[10px] text-zinc-400 tabular-nums">
            전투력 {centerPower.toLocaleString("ko-KR")}
          </p>
        </div>
        {orderedPets.length === 0 && (
          <p className="text-[11px] text-zinc-500 text-center py-2">
            아래에서 펫 3마리를 선택하세요.
          </p>
        )}
        <ul className="flex flex-col gap-1">
          {orderedPets.map((p, idx) => {
            const slot = idx + 1;
            const bonus = previewBonus(slot, p);
            return (
              <li
                key={p.grading_id}
                className="rounded-lg bg-zinc-900/70 border border-white/10 px-2 py-1.5 flex items-center gap-2"
              >
                <span className="text-[10px] font-black text-amber-200 w-6 text-center">
                  #{slot}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-bold text-white truncate">
                    {p.card_name}
                  </p>
                  <p className="text-[9px] text-zinc-400">
                    HP {p.baseHp} · ATK {p.baseAtk}
                    {bonus > 0 && (
                      <span className="text-amber-300"> (+{bonus})</span>
                    )}
                    {p.type && (
                      <>
                        {" · "}
                        <span className="text-zinc-200">{p.type}</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => onMove(p.grading_id, -1)}
                    disabled={idx === 0}
                    className="w-6 h-6 rounded bg-white/5 disabled:opacity-30 text-white text-[10px]"
                    aria-label="앞 슬롯으로"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(p.grading_id, +1)}
                    disabled={idx === orderedPets.length - 1}
                    className="w-6 h-6 rounded bg-white/5 disabled:opacity-30 text-white text-[10px]"
                    aria-label="뒤 슬롯으로"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggle(p.grading_id)}
                    className="w-6 h-6 rounded bg-rose-500/30 hover:bg-rose-500/50 text-white text-[10px]"
                    aria-label="제거"
                  >
                    ✕
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 펫 풀 — 체육관 속성과 일치하는 펫만 */}
      <section className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
        <p className="text-[11px] uppercase tracking-wider text-zinc-400 mb-1.5">
          {gym.type} 속성 펫 (PCL10 · 펫 등록 슬랩만)
        </p>
        {loading ? (
          <p className="text-[11px] text-zinc-500 py-3 text-center">로딩 중...</p>
        ) : insufficient ? (
          <p className="text-[11px] text-rose-300 py-3 text-center leading-snug">
            등록된 {gym.type} 속성 PCL10 펫이 부족해요 ({matchingPets.length}/3).<br/>
            프로필에서 {gym.type} 속성 펫을 더 등록한 뒤 도전하세요.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-1.5">
            {matchingPets.map((p) => {
              const idx = order.indexOf(p.grading_id);
              const selected = idx >= 0;
              const eff = p.type
                ? effectiveness(p.type, gym.type)
                : 1;
              return (
                <li key={p.grading_id}>
                  <button
                    type="button"
                    onClick={() => onToggle(p.grading_id)}
                    style={{ touchAction: "manipulation" }}
                    className={clsx(
                      "relative w-full rounded-lg border p-1.5 text-left flex items-center gap-1.5 transition active:scale-[0.98]",
                      selected
                        ? "border-amber-400/60 bg-amber-400/10"
                        : "border-white/10 bg-zinc-900/60 hover:bg-white/5"
                    )}
                  >
                    {selected && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-400 text-zinc-950 text-[10px] font-black flex items-center justify-center">
                        {idx + 1}
                      </span>
                    )}
                    <div
                      className={clsx(
                        "w-8 h-11 rounded overflow-hidden ring-1 bg-zinc-900 shrink-0",
                        RARITY_STYLE[p.rarity].frame
                      )}
                    >
                      {p.imageUrl && (
                        <img
                          src={p.imageUrl}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                          className="w-full h-full object-contain"
                          draggable={false}
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold text-white truncate">
                        {p.card_name}
                      </p>
                      <p className="text-[9px] text-zinc-400 leading-tight">
                        HP {p.baseHp} · ATK {p.baseAtk}
                      </p>
                      <div className="flex items-center gap-0.5 mt-0.5">
                        {p.type ? (
                          <span
                            className={clsx(
                              "px-1 py-[1px] rounded text-[8px] font-black",
                              TYPE_STYLE[p.type].badge
                            )}
                          >
                            {p.type}
                          </span>
                        ) : (
                          <span className="text-[8px] text-zinc-500">無속성</span>
                        )}
                        {p.type && eff !== 1 && (
                          <span
                            className={clsx(
                              "text-[8px] font-black",
                              eff > 1 ? "text-emerald-300" : eff < 1 ? "text-rose-300" : "text-zinc-400"
                            )}
                          >
                            ×{eff}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {error && (
        <p className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={onStart}
        disabled={order.length !== 3}
        style={{ touchAction: "manipulation" }}
        className={clsx(
          "w-full h-12 rounded-xl font-black text-base transition",
          order.length === 3
            ? "bg-gradient-to-r from-rose-500 to-amber-500 text-zinc-950 active:scale-[0.98]"
            : "bg-white/5 text-zinc-500 cursor-not-allowed"
        )}
      >
        ⚔️ 전투 시작!
      </button>
    </div>
  );
}

/* ─────────────── Battle Playback ─────────────── */

/** 서버는 펫/방어덱 단위의 name 필드에 card_id (예: "m4-001") 를 그대로
 *  실어 보낸다 (DB 에 카드 카탈로그가 없음). 화면 표기용 이름은 클라가
 *  getCard(card_id).name 으로 룩업해 한국어 이름으로 치환. NPC 적은
 *  card_id 가 없고 미리 정해진 한국어 name 을 받으므로 그대로 사용. */
function unitDisplayName(unit: BattleUnit | undefined | null): string {
  if (!unit) return "?";
  if (unit.card_id) {
    const card = getCard(unit.card_id);
    if (card?.name) return card.name;
  }
  return unit.name || "?";
}

function BattlePlayback({
  battle,
  gym,
  onEnd,
  reduce,
}: {
  battle: GymBattleResult;
  gym: Gym;
  onEnd: () => void;
  reduce: boolean;
}) {
  const turns = battle.turn_log ?? [];
  const initialPets = battle.pets ?? [];
  const initialEnemies = battle.enemies ?? [];

  // 시뮬: 턴 인덱스를 일정 주기로 증가시켜 HP/이펙트 갱신.
  const [turnIdx, setTurnIdx] = useState(0);
  const [petsState, setPetsState] = useState<BattleUnit[]>(
    initialPets.map((p) => ({ ...p, hp: p.hp_max }))
  );
  const [enemiesState, setEnemiesState] = useState<BattleUnit[]>(
    initialEnemies.map((p) => ({ ...p, hp: p.hp_max }))
  );
  const [shake, setShake] = useState<"pet" | "enemy" | null>(null);
  const [floater, setFloater] = useState<{
    side: "pet" | "enemy";
    value: number;
    crit: boolean;
    immune: boolean;
  } | null>(null);

  // 활성 슬롯 추적
  const [petIdx, setPetIdx] = useState(0);
  const [enemyIdx, setEnemyIdx] = useState(0);

  useEffect(() => {
    if (turnIdx >= turns.length) {
      // 마지막 턴까지 다 본 후 결과 화면 전환 — 사용자가 마지막 데미지/HP
      // 변화를 체감할 시간을 주기 위해 1.4s 대기.
      const t = setTimeout(onEnd, 1400);
      return () => clearTimeout(t);
    }
    // 첫 턴은 등장 연출 + 사용자 인지 시간 위해 1.5s 추가 대기.
    // 이후 턴은 1200ms 간격 — 데미지 부유 / HP 감소 / 흔들림 다 보기 충분.
    const speed = reduce ? 350 : turnIdx === 0 ? 1500 : 1200;
    const t = setTimeout(() => {
      const turn: BattleTurn = turns[turnIdx];
      // 데미지 표기 + HP 업데이트
      const isPetAttack = turn.side === "pet";
      const targetSide: "pet" | "enemy" = isPetAttack ? "enemy" : "pet";
      setShake(targetSide);
      setFloater({
        side: targetSide,
        value: turn.damage,
        crit: turn.crit,
        immune: turn.eff === 0,
      });
      if (isPetAttack) {
        setEnemiesState((prev) => {
          const next = [...prev];
          const idx = turn.defender_slot - 1;
          if (next[idx]) next[idx] = { ...next[idx], hp: turn.enemy_hp_left };
          return next;
        });
      } else {
        setPetsState((prev) => {
          const next = [...prev];
          const idx = turn.defender_slot - 1;
          if (next[idx]) next[idx] = { ...next[idx], hp: turn.pet_hp_left };
          return next;
        });
      }
      // 활성 슬롯 갱신
      setPetIdx(turn.side === "pet" ? turn.attacker_slot - 1 : turn.defender_slot - 1);
      setEnemyIdx(turn.side === "enemy" ? turn.attacker_slot - 1 : turn.defender_slot - 1);

      setTimeout(() => setShake(null), 250);
      setTimeout(() => setFloater(null), Math.max(speed - 100, 200));
      setTurnIdx((i) => i + 1);
    }, speed);
    return () => clearTimeout(t);
  }, [turnIdx, turns, onEnd, reduce]);

  const activePet = petsState[Math.min(petIdx, petsState.length - 1)];
  const activeEnemy = enemiesState[Math.min(enemyIdx, enemiesState.length - 1)];
  const gymTypeStyle = TYPE_STYLE[gym.type];

  return (
    <div className="p-3 md:p-4 space-y-3">
      {/* 무대 */}
      <div className={clsx(
        "relative rounded-2xl border p-3 aspect-[4/3] overflow-hidden",
        "border-white/10",
        gymTypeStyle.glow,
      )}
      style={{
        background: "linear-gradient(180deg,#1a0a3a 0%,#1d2a55 45%,#0f1f3a 100%)",
      }}>
        {/* 적 — 우상단 */}
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
          <HpBar
            label={unitDisplayName(activeEnemy)}
            hp={activeEnemy?.hp ?? 0}
            max={activeEnemy?.hp_max ?? 1}
            type={(activeEnemy?.type as WildType) ?? gym.type}
          />
          <motion.div
            className="relative w-20 h-20 md:w-24 md:h-24"
            animate={shake === "enemy" ? { x: [0, -6, 6, -3, 3, 0], filter: ["brightness(1.3)", "brightness(1)"] } : { x: 0 }}
            transition={{ duration: 0.25 }}
          >
            {activeEnemy && <EnemySprite enemy={activeEnemy} />}
            <AnimatePresence>
              {floater?.side === "enemy" && (
                <FloaterText key={`f-e-${turnIdx}`} f={floater} />
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* 펫 — 좌하단. HpBar 가 카드 위에 오도록 순서 조정 (이전엔
            카드 아래에 있어 카드 사이즈가 크면 화면 밖으로 잘리거나
            카드와 겹쳐 안 보이는 이슈). */}
        <div className="absolute bottom-2 left-2 flex flex-col items-start gap-1">
          <HpBar
            label={unitDisplayName(activePet)}
            hp={activePet?.hp ?? 0}
            max={activePet?.hp_max ?? 1}
            type={(activePet?.type as WildType) ?? "노말"}
            align="left"
          />
          <motion.div
            className="relative w-16 h-20 md:w-20 md:h-24"
            animate={shake === "pet" ? { x: [0, -4, 4, -2, 2, 0], filter: ["brightness(1.3)", "brightness(1)"] } : { x: 0 }}
            transition={{ duration: 0.25 }}
          >
            <PetCardArt pet={activePet} />
            <AnimatePresence>
              {floater?.side === "pet" && (
                <FloaterText key={`f-p-${turnIdx}`} f={floater} />
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>

      {/* 턴 카운터 */}
      <p className="text-center text-[11px] text-zinc-400 tabular-nums">
        턴 {Math.min(turnIdx, turns.length)} / {turns.length}
      </p>
    </div>
  );
}

function HpBar({
  label, hp, max, type, align = "right",
}: {
  label: string; hp: number; max: number; type: WildType; align?: "left" | "right";
}) {
  const pct = Math.max(0, Math.min(100, (hp / max) * 100));
  const color =
    pct > 50 ? "bg-emerald-400" : pct > 20 ? "bg-amber-400" : "bg-rose-500";
  return (
    <div
      className={clsx(
        "rounded-lg border border-white/15 bg-black/55 px-2 py-0.5 min-w-[140px] max-w-[180px]",
        align === "left" ? "items-start" : "items-end"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold text-white truncate flex-1 min-w-0">
          {label}
        </span>
        <span className={clsx("shrink-0 text-[7px] font-black px-1 py-[1px] rounded-full", TYPE_STYLE[type].badge)}>
          {type}
        </span>
      </div>
      <div className="mt-0.5 h-1 rounded-full bg-white/10 overflow-hidden">
        <motion.div
          className={clsx("h-full", color)}
          initial={{ width: "100%" }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>
      <div className="mt-[1px] text-[8px] text-zinc-300 tabular-nums text-right">
        {hp} / {max}
      </div>
    </div>
  );
}

function FloaterText({
  f,
}: {
  f: { value: number; crit: boolean; immune: boolean };
}) {
  const txt = f.immune ? "무효" : `-${f.value}`;
  return (
    <motion.span
      className={clsx(
        "absolute left-1/2 top-1/3 -translate-x-1/2 font-black text-base md:text-lg select-none pointer-events-none",
        f.immune ? "text-zinc-300" : f.crit ? "text-amber-300" : "text-rose-200"
      )}
      style={{ textShadow: "0 2px 6px rgba(0,0,0,0.85)" }}
      initial={{ y: 0, opacity: 1, scale: 0.6 }}
      animate={{ y: -36, opacity: 0, scale: 1.15 }}
      transition={{ duration: 0.7, ease: "easeOut" }}
    >
      {txt}
    </motion.span>
  );
}

/** 카드 이름 → dex sprite 시도 → 카드 이미지 fallback → 텍스트 fallback.
 *  사용자 요청: 펫 / 방어 덱도 야생 포켓몬처럼 도트 캐릭터로 보이게.
 *  carrd_id 가 있으면 카드 이름을 lookup 해 dex 매핑 시도, 매핑되면
 *  PokeAPI BW gen5 애니메이션 sprite (야생 전투와 동일) 로 렌더. */
function CardOrDexSprite({
  cardId,
  fallbackDex,
  name,
  pixel = true,
}: {
  cardId?: string;
  fallbackDex?: number;
  name: string;
  pixel?: boolean;
}) {
  const card = cardId ? getCard(cardId) : null;
  // 1) 메가/특수 폼 sprite 우선 (Pokemon Showdown ani — 메가 X/Y 등
  //    구분). 매칭 없으면 dex 기반 PokeAPI gen5 BW 로 fallback.
  const cardName = card?.name ?? name;
  const megaSprite = cardName ? cardSpriteUrl(cardName) : null;
  const dexFromName = cardName ? lookupDex(cardName) : null;
  const dex = dexFromName ?? fallbackDex ?? null;
  const [megaBroken, setMegaBroken] = useState(false);
  const [spriteBroken, setSpriteBroken] = useState(false);
  const [cardBroken, setCardBroken] = useState(false);

  if (megaSprite && !megaBroken) {
    return (
      <img
        src={megaSprite}
        alt={cardName}
        draggable={false}
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setMegaBroken(true)}
        className="w-full h-full object-contain"
        style={pixel ? { imageRendering: "pixelated" } : undefined}
      />
    );
  }
  if (dex && !spriteBroken) {
    return (
      <img
        src={wildSpriteUrl(dex, true)}
        alt={cardName}
        draggable={false}
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setSpriteBroken(true)}
        className="w-full h-full object-contain"
        style={pixel ? { imageRendering: "pixelated" } : undefined}
      />
    );
  }
  // 2) dex 매칭 실패 → 카드 이미지 fallback.
  if (card?.imageUrl && !cardBroken) {
    return (
      <img
        src={card.imageUrl}
        alt={cardName}
        draggable={false}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setCardBroken(true)}
        className="w-full h-full object-contain rounded-md"
      />
    );
  }
  // 3) 둘 다 실패 → 이름 텍스트.
  return (
    <div className="w-full h-full flex items-center justify-center text-[10px] text-white text-center bg-zinc-900 rounded-md p-1">
      {cardName}
    </div>
  );
}

/** 적 sprite — NPC 모드는 dex 직접, 방어덱 모드는 카드 이름→dex 시도. */
function EnemySprite({ enemy }: { enemy: BattleUnit }) {
  return (
    <CardOrDexSprite
      cardId={enemy.card_id}
      fallbackDex={enemy.dex}
      name={unitDisplayName(enemy)}
    />
  );
}

function PetCardArt({ pet }: { pet: BattleUnit | undefined }) {
  if (!pet) return null;
  return <CardOrDexSprite cardId={pet.card_id} name={unitDisplayName(pet)} />;
}

/* ─────────────── Result ─────────────── */

function ResultPhase({
  battle,
  gym,
  onClose,
}: {
  battle: GymBattleResult;
  gym: Gym;
  onClose: () => void;
}) {
  const won = battle.result === "won";
  return (
    <div className="p-4 md:p-5 space-y-3">
      <div
        className={clsx(
          "rounded-2xl border p-4 text-center",
          won
            ? "border-amber-400/50 bg-amber-400/10"
            : "border-rose-500/50 bg-rose-500/10"
        )}
      >
        <p className="text-3xl mb-1">{won ? "🏆" : "💥"}</p>
        <h3 className={clsx("text-base font-black", won ? "text-amber-200" : "text-rose-200")}>
          {won ? "체육관 정복!" : "패배..."}
        </h3>
        {won && (
          <>
            <p className="text-[11px] text-amber-200/90 mt-1">
              {gym.medal?.name ?? "메달"} 획득
            </p>
            <p className="text-[12px] text-amber-100 mt-1 tabular-nums">
              보상 +{(battle.capture_reward ?? 0).toLocaleString("ko-KR")}P
            </p>
            <p className="text-[10px] text-zinc-300 mt-0.5">
              12시간 보호 시작
            </p>
          </>
        )}
        {!won && battle.cooldown_until && (
          <p className="text-[11px] text-zinc-300 mt-1">
            재도전 쿨타임 적용 (8분)
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onClose}
        className="w-full h-11 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-zinc-950 font-bold text-sm"
      >
        닫기
      </button>
    </div>
  );
}
