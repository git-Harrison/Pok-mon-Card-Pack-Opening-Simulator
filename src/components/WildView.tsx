"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/lib/auth";
import {
  fetchUndisplayedGradings,
  wildBattleReward,
} from "@/lib/db";
import type { PsaGrading } from "@/lib/types";
import { getCard } from "@/lib/sets";
import { RARITY_STYLE } from "@/lib/rarity";
import { psaTone } from "@/lib/psa";
import { CARD_NAME_TO_TYPE } from "@/lib/wild/name-to-type";
import { WILD_POOL, wildSpriteUrl, type WildMon } from "@/lib/wild/pool";
import { effectiveness, effectivenessLabel } from "@/lib/wild/typechart";
import { computeDamage, slabStats, winReward } from "@/lib/wild/stats";
import { TYPE_STYLE, type WildType } from "@/lib/wild/types";
import PageHeader from "./PageHeader";
import PointsChip from "./PointsChip";
import CoinIcon from "./CoinIcon";

type Phase =
  | "idle"
  | "intro"
  | "picking"
  | "starting"
  | "player-turn"
  | "enemy-attack"
  | "message"
  | "won"
  | "lost";

interface Slab {
  gradingId: string;
  cardId: string;
  name: string;
  rarity: keyof typeof RARITY_STYLE;
  grade: number;
  imageUrl: string | undefined;
  type: WildType | null;
  hp: number;
  maxHp: number;
  atk: number;
}

interface FloatingDamage {
  id: number;
  target: "enemy" | "player";
  value: number;
  crit: boolean;
  immune: boolean;
}

/** Resolve a card's Pokemon type. Strips suffixes so "피카츄 ex" still
 *  matches "피카츄" if only the base is mapped. */
function resolveType(name: string): WildType | null {
  if (CARD_NAME_TO_TYPE[name] !== undefined) return CARD_NAME_TO_TYPE[name];
  const base = name
    .replace(/\s*\(골드\)\s*$/, "")
    .replace(/\s*\(SV\)\s*$/, "")
    .replace(/\s+(ex|V|VMAX|GX|BREAK)\s*$/i, "")
    .trim();
  return CARD_NAME_TO_TYPE[base] ?? null;
}

export default function WildView() {
  const { user, setPoints } = useAuth();

  const [gradings, setGradings] = useState<PsaGrading[]>([]);
  const [loading, setLoading] = useState(true);

  const [phase, setPhase] = useState<Phase>("idle");
  const [wild, setWild] = useState<WildMon | null>(null);
  const [wildHp, setWildHp] = useState(0);
  const [slab, setSlab] = useState<Slab | null>(null);
  const [bubble, setBubble] = useState<{
    side: "wild" | "player";
    text: string;
  } | null>(null);
  const [floaters, setFloaters] = useState<FloatingDamage[]>([]);
  const [enemyHit, setEnemyHit] = useState(false);
  const [playerHit, setPlayerHit] = useState(false);
  const [attackingSide, setAttackingSide] = useState<"player" | "enemy" | null>(null);
  const [rewarded, setRewarded] = useState<number | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const floaterSeq = useRef(0);

  const refresh = useCallback(async () => {
    if (!user) return;
    const g = await fetchUndisplayedGradings(user.id);
    setGradings(g);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const eligibleSlabs: Slab[] = useMemo(() => {
    return gradings
      .map((g) => {
        const card = getCard(g.card_id);
        if (!card) return null;
        const type = resolveType(card.name);
        if (!type) return null; // trainer / 굿즈 / unmapped → excluded
        const s = slabStats(card.rarity, g.grade);
        return {
          gradingId: g.id,
          cardId: card.id,
          name: card.name,
          rarity: card.rarity,
          grade: g.grade,
          imageUrl: card.imageUrl,
          type,
          hp: s.hp,
          maxHp: s.hp,
          atk: s.atk,
        } as Slab;
      })
      .filter((x): x is Slab => x !== null)
      .sort((a, b) =>
        b.grade - a.grade || b.maxHp - a.maxHp
      );
  }, [gradings]);

  const addFloater = useCallback(
    (target: "enemy" | "player", value: number, crit = false, immune = false) => {
      floaterSeq.current += 1;
      const id = floaterSeq.current;
      setFloaters((prev) => [...prev, { id, target, value, crit, immune }]);
      setTimeout(() => {
        setFloaters((prev) => prev.filter((f) => f.id !== id));
      }, 900);
    },
    []
  );

  const say = useCallback(
    (text: string, side: "wild" | "player", ms = 1100) => {
      return new Promise<void>((resolve) => {
        setBubble({ side, text });
        setTimeout(resolve, ms);
      });
    },
    []
  );

  const encounter = useCallback(() => {
    const w = WILD_POOL[Math.floor(Math.random() * WILD_POOL.length)];
    setWild(w);
    setWildHp(w.hp);
    setSlab(null);
    setBubble(null);
    setFloaters([]);
    setRewarded(null);
    setPhase("intro");
  }, []);

  // Auto-advance from intro → picking after short dialogue.
  useEffect(() => {
    if (phase !== "intro" || !wild) return;
    setBubble({ side: "wild", text: wild.cry });
    const t = setTimeout(() => setPhase("picking"), 1500);
    return () => clearTimeout(t);
  }, [phase, wild]);

  const deploy = useCallback(
    async (s: Slab) => {
      setSlab({ ...s });
      setPhase("starting");
      await say(`좋아! ${s.name} — 가자!`, "player", 900);
      setBubble({ side: "player", text: "내 턴!" });
      setPhase("player-turn");
    },
    [say]
  );

  const playerAttack = useCallback(async () => {
    if (!slab || !wild) return;
    const mult = effectiveness(slab.type!, wild.type);
    const dmg = computeDamage(slab.atk, mult);
    setAttackingSide("player");
    await say(`${slab.name}의 공격!`, "player", 500);
    if (mult === 0) {
      addFloater("enemy", 0, false, true);
    } else {
      addFloater("enemy", dmg, mult >= 2);
    }
    setEnemyHit(true);
    setTimeout(() => setEnemyHit(false), 450);
    const newHp = Math.max(0, wildHp - dmg);
    setWildHp(newHp);
    const label = effectivenessLabel(mult);
    // Effectiveness reads on the side of the Pokemon that TOOK the hit.
    if (label.text) await say(label.text, "wild", 700);
    setAttackingSide(null);

    if (newHp <= 0) {
      await say(`야생의 ${wild.name}은(는) 쓰러졌다!`, "wild", 900);
      const prize = winReward(wild.hp);
      setRewarded(prize);
      if (user) {
        const res = await wildBattleReward(user.id, prize);
        if (res.ok && typeof res.points === "number") setPoints(res.points);
      }
      setPhase("won");
      return;
    }
    // enemy counter-attack
    setPhase("enemy-attack");
    await say(`야생의 ${wild.name}의 공격!`, "wild", 600);
    setAttackingSide("enemy");
    const emult = effectiveness(wild.type, slab.type!);
    const edmg = computeDamage(wild.atk, emult);
    if (emult === 0) {
      addFloater("player", 0, false, true);
    } else {
      addFloater("player", edmg, emult >= 2);
    }
    setPlayerHit(true);
    setTimeout(() => setPlayerHit(false), 450);
    const newSlabHp = Math.max(0, slab.hp - edmg);
    setSlab({ ...slab, hp: newSlabHp });
    const elabel = effectivenessLabel(emult);
    if (elabel.text) await say(elabel.text, "player", 700);
    setAttackingSide(null);

    if (newSlabHp <= 0) {
      await say(`${slab.name}은(는) 더 이상 싸울 수 없다…`, "player", 1000);
      setPhase("lost");
      setCooldownUntil(Date.now() + 30_000);
      return;
    }
    setBubble({ side: "player", text: "내 턴!" });
    setPhase("player-turn");
  }, [slab, wild, wildHp, addFloater, say, user, setPoints]);

  const flee = useCallback(async () => {
    if (!wild) return;
    await say("무사히 도망쳤다!", "player", 800);
    resetAll();
  }, [wild, say]);

  const resetAll = useCallback(() => {
    setPhase("idle");
    setWild(null);
    setWildHp(0);
    setSlab(null);
    setBubble(null);
    setFloaters([]);
    setAttackingSide(null);
    setRewarded(null);
  }, []);

  // Cooldown tick
  const [, force] = useState(0);
  useEffect(() => {
    if (!cooldownUntil) return;
    const i = setInterval(() => force((n) => n + 1), 500);
    return () => clearInterval(i);
  }, [cooldownUntil]);

  const cooldownLeft = cooldownUntil
    ? Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000))
    : 0;

  // ── render ──
  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 flex justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
      </div>
    );
  }
  if (eligibleSlabs.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-5 md:py-8 fade-in">
        <PageHeader
          title="🌿 야생"
          subtitle="PCL 감별 슬랩으로 야생 포켓몬과 배틀"
        />
        <div className="mt-8 rounded-2xl border border-dashed border-white/10 bg-white/5 py-14 flex flex-col items-center gap-3 text-center px-4">
          <span className="text-5xl">🌾</span>
          <p className="text-lg text-white font-semibold">
            PCL 감별 카드가 필요해요
          </p>
          <p className="text-sm text-zinc-400">
            감별을 받아 슬랩을 한 장이라도 가지고 계셔야 야생과 싸울 수 있어요.
          </p>
          <Link
            href="/grading"
            className="mt-2 inline-flex items-center h-11 px-5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-indigo-500 text-white font-bold text-sm hover:scale-[1.03] transition"
          >
            감별 받으러 가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-5 md:py-8 fade-in">
      <PageHeader
        title="🌿 야생"
        subtitle="PCL 슬랩으로 야생 포켓몬과 대결 · 승리 시 포인트 획득"
        stats={user ? <PointsChip points={user.points} size="sm" /> : null}
      />

      {phase === "idle" && (
        <div className="mt-4">
          <IdleCTA
            count={eligibleSlabs.length}
            cooldownLeft={cooldownLeft}
            onStart={encounter}
          />
          <TypeChartHint className="mt-4" />
        </div>
      )}

      {phase !== "idle" && wild && (
        <BattleScene
          wild={wild}
          wildHp={wildHp}
          slab={slab}
          phase={phase}
          bubble={bubble}
          floaters={floaters}
          enemyHit={enemyHit}
          playerHit={playerHit}
          attackingSide={attackingSide}
        />
      )}

      {phase === "picking" && (
        <PickSlabPanel slabs={eligibleSlabs} onPick={deploy} />
      )}

      {phase === "player-turn" && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={playerAttack}
            className="h-12 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 text-zinc-950 font-black text-sm active:scale-[0.98]"
          >
            ⚔️ 공격
          </button>
          <button
            onClick={flee}
            className="h-12 rounded-xl bg-white/10 border border-white/15 text-white font-bold text-sm active:scale-[0.98]"
          >
            🏃 도망
          </button>
        </div>
      )}

      {phase === "won" && (
        <ResultPanel
          tone="win"
          title={`야생의 ${wild?.name}을(를) 쓰러뜨렸다!`}
          message={
            rewarded !== null
              ? `보상 +${rewarded.toLocaleString("ko-KR")}p 획득!`
              : ""
          }
          onAgain={encounter}
          onExit={resetAll}
        />
      )}
      {phase === "lost" && (
        <ResultPanel
          tone="lose"
          title={`${slab?.name}은(는) 쓰러졌다…`}
          message={
            cooldownLeft > 0
              ? `잠시 휴식이 필요해요. ${cooldownLeft}초 뒤 다시 시도`
              : "다시 도전해 보세요."
          }
          disableAgain={cooldownLeft > 0}
          onAgain={encounter}
          onExit={resetAll}
        />
      )}
    </div>
  );
}

/* ─────────────── sub-components ─────────────── */

function IdleCTA({
  count,
  cooldownLeft,
  onStart,
}: {
  count: number;
  cooldownLeft: number;
  onStart: () => void;
}) {
  const blocked = cooldownLeft > 0;
  return (
    <div
      className="rounded-2xl border border-emerald-500/25 overflow-hidden"
      style={{
        background:
          "radial-gradient(140% 80% at 50% 0%, rgba(16,185,129,0.18) 0%, rgba(6,95,70,0.05) 60%, transparent 100%)",
      }}
    >
      <div className="p-5 md:p-8 text-center">
        <div className="text-5xl mb-2 motion-safe:animate-bounce">🌾</div>
        <h2 className="text-lg md:text-xl font-black text-white">
          풀숲이 흔들린다…
        </h2>
        <p className="mt-1 text-xs text-zinc-300">
          보유한 PCL 슬랩 {count}장으로 야생 포켓몬과 겨룹니다.
        </p>
        <button
          onClick={onStart}
          disabled={blocked}
          className={clsx(
            "mt-4 h-12 px-6 rounded-xl font-black text-sm inline-flex items-center gap-2 transition",
            blocked
              ? "bg-white/10 text-zinc-500"
              : "bg-gradient-to-r from-emerald-400 to-lime-500 text-zinc-950 hover:scale-[1.03] active:scale-[0.98]"
          )}
        >
          {blocked ? `${cooldownLeft}초 뒤 재도전` : "야생 만나러 가기"}
        </button>
      </div>
    </div>
  );
}

function TypeChartHint({ className }: { className?: string }) {
  return (
    <details
      className={clsx(
        "rounded-xl border border-white/10 bg-white/5 group",
        className
      )}
    >
      <summary className="cursor-pointer list-none px-3 py-2 text-[11px] text-zinc-300 flex items-center justify-between">
        <span>💡 타입 상성 요약</span>
        <span className="text-zinc-500 group-open:hidden">▾</span>
        <span className="text-zinc-500 hidden group-open:inline">▴</span>
      </summary>
      <div className="px-3 pb-3 text-[11px] text-zinc-400 leading-snug">
        공격 타입이 방어 타입을 잘 때리면{" "}
        <b className="text-amber-300">×2</b>, 안 먹히면{" "}
        <b className="text-rose-300">×0.5</b>, 완전 무효는{" "}
        <b className="text-zinc-500">×0</b>. 예) 불꽃 → 풀·얼음·벌레·강철 에
        강함, 물·바위·드래곤에 약함.
      </div>
    </details>
  );
}

function BattleScene({
  wild,
  wildHp,
  slab,
  phase,
  bubble,
  floaters,
  enemyHit,
  playerHit,
  attackingSide,
}: {
  wild: WildMon;
  wildHp: number;
  slab: Slab | null;
  phase: Phase;
  bubble: { side: "wild" | "player"; text: string } | null;
  floaters: FloatingDamage[];
  enemyHit: boolean;
  playerHit: boolean;
  attackingSide: "player" | "enemy" | null;
}) {
  const wildBubble = bubble?.side === "wild" ? bubble.text : "";
  const playerBubble = bubble?.side === "player" ? bubble.text : "";
  return (
    <div
      className="relative mt-4 rounded-2xl overflow-hidden border border-emerald-500/30"
      style={{
        aspectRatio: "4 / 5",
        background:
          "linear-gradient(180deg, #0a1730 0%, #102a52 30%, #19351f 55%, #0e2015 100%)",
      }}
    >
      {/* Grass ground */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-1/3 pointer-events-none"
        style={{
          background:
            "radial-gradient(60% 100% at 50% 0%, rgba(34,197,94,0.25), rgba(34,197,94,0) 70%)",
        }}
      />

      {/* Enemy (top-right): bubble on the LEFT of the sprite */}
      <div className="absolute top-3 right-3 md:top-6 md:right-6 flex flex-col items-end">
        <HpBar label={wild.name} hp={wildHp} max={wild.hp} type={wild.type} />
        <div className="mt-2 flex items-center gap-2">
          {/* Wild speech bubble — pops to the left of the sprite */}
          <AnimatePresence>
            {wildBubble && (
              <SpeechBubble key={wildBubble} text={wildBubble} side="left" />
            )}
          </AnimatePresence>
          <motion.div
            initial={{ x: 200, opacity: 0 }}
            animate={{
              x: 0,
              opacity: wildHp > 0 ? 1 : 0,
              y: enemyHit ? [0, -4, 4, 0] : 0,
              rotate: wildHp <= 0 ? 80 : 0,
            }}
            transition={
              enemyHit
                ? { duration: 0.35 }
                : { type: "spring", stiffness: 180, damping: 18 }
            }
            className="relative"
          >
            {attackingSide === "enemy" && (
              <motion.div
                className="absolute inset-0 pointer-events-none"
                initial={{ x: 0 }}
                animate={{ x: [-6, -30, 0] }}
                transition={{ duration: 0.45 }}
              />
            )}
            <WildSprite dex={wild.dex} hit={enemyHit} />
            <AnimatePresence>
              {floaters
                .filter((f) => f.target === "enemy")
                .map((f) => (
                  <FloatingNumber key={f.id} damage={f} />
                ))}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>

      {/* Player (bottom-left): bubble on the RIGHT of the card */}
      <div className="absolute bottom-3 left-3 md:bottom-6 md:left-6 flex flex-col items-start">
        {slab && (
          <>
            <div className="flex items-center gap-2">
              <motion.div
                initial={{ x: -200, opacity: 0 }}
                animate={{
                  x: 0,
                  opacity: slab.hp > 0 ? 1 : 0.2,
                  y: playerHit ? [0, -4, 4, 0] : 0,
                  rotate: slab.hp <= 0 ? -15 : 0,
                }}
                transition={
                  playerHit
                    ? { duration: 0.35 }
                    : { type: "spring", stiffness: 180, damping: 18 }
                }
                className="relative"
              >
                <PlayerSlab slab={slab} />
                <AnimatePresence>
                  {floaters
                    .filter((f) => f.target === "player")
                    .map((f) => (
                      <FloatingNumber key={f.id} damage={f} />
                    ))}
                </AnimatePresence>
              </motion.div>
              {/* Player speech bubble — pops to the right of the card */}
              <AnimatePresence>
                {playerBubble && (
                  <SpeechBubble
                    key={playerBubble}
                    text={playerBubble}
                    side="right"
                  />
                )}
              </AnimatePresence>
            </div>
            <div className="mt-2">
              <HpBar
                label={slab.name}
                hp={slab.hp}
                max={slab.maxHp}
                type={slab.type ?? "노말"}
                align="left"
              />
            </div>
          </>
        )}
      </div>

      {/* Center overlay — intro/starting glyphs */}
      {phase === "intro" && (
        <motion.div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: [0, 1, 1, 0] }}
          transition={{ duration: 1.4, times: [0, 0.2, 0.7, 1] }}
        >
          <span className="text-5xl">❗</span>
        </motion.div>
      )}
    </div>
  );
}

function WildSprite({ dex, hit }: { dex: number; hit: boolean }) {
  const [src, setSrc] = useState(wildSpriteUrl(dex, true));
  return (
    <div
      className="relative w-28 h-28 md:w-36 md:h-36 flex items-end justify-center"
      style={{
        filter: hit
          ? "drop-shadow(0 0 8px #f43f5e) brightness(1.4)"
          : "drop-shadow(0 4px 12px rgba(0,0,0,0.6))",
      }}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        onError={() => setSrc(wildSpriteUrl(dex, false))}
        style={{
          imageRendering: "pixelated",
          width: "100%",
          height: "auto",
          objectFit: "contain",
        }}
      />
    </div>
  );
}

function PlayerSlab({ slab }: { slab: Slab }) {
  const rstyle = RARITY_STYLE[slab.rarity];
  return (
    <div
      className={clsx(
        "relative w-24 h-32 md:w-28 md:h-40 rounded-lg overflow-hidden ring-2 bg-zinc-900",
        rstyle.frame
      )}
    >
      {slab.imageUrl ? (
        <img
          src={slab.imageUrl}
          alt={slab.name}
          className="w-full h-full object-contain bg-zinc-900"
          draggable={false}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[10px] text-white text-center p-1">
          {slab.name}
        </div>
      )}
    </div>
  );
}

function HpBar({
  label,
  hp,
  max,
  type,
  align = "right",
}: {
  label: string;
  hp: number;
  max: number;
  type: WildType;
  align?: "right" | "left";
}) {
  const pct = Math.max(0, Math.min(100, (hp / max) * 100));
  const barColor =
    pct > 50
      ? "bg-emerald-400"
      : pct > 20
      ? "bg-amber-400"
      : "bg-rose-500";
  return (
    <div
      className={clsx(
        "rounded-lg border border-white/15 bg-black/55 backdrop-blur px-2.5 py-1 min-w-[140px]",
        align === "left" ? "items-start" : "items-end"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold text-white truncate max-w-[100px]">
          {label}
        </span>
        <span
          className={clsx(
            "text-[8px] font-black px-1.5 py-[1px] rounded-full",
            TYPE_STYLE[type].badge
          )}
        >
          {type}
        </span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <motion.div
          className={clsx("h-full", barColor)}
          initial={{ width: "100%" }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        />
      </div>
      <div className="mt-0.5 text-[9px] text-zinc-300 tabular-nums text-right">
        {hp} / {max}
      </div>
    </div>
  );
}

function FloatingNumber({ damage }: { damage: FloatingDamage }) {
  const txt = damage.immune ? "무효" : `-${damage.value}`;
  const cls = damage.immune
    ? "text-zinc-300"
    : damage.crit
    ? "text-amber-300"
    : "text-rose-200";
  return (
    <motion.span
      className={clsx(
        "absolute left-1/2 top-1/3 -translate-x-1/2 font-black text-lg md:text-xl select-none pointer-events-none",
        cls
      )}
      style={{ textShadow: "0 2px 6px rgba(0,0,0,0.8)" }}
      initial={{ y: 0, opacity: 1, scale: 0.6 }}
      animate={{ y: -46, opacity: 0, scale: 1.2 }}
      transition={{ duration: 0.9, ease: "easeOut" }}
    >
      {txt}
    </motion.span>
  );
}

function PickSlabPanel({
  slabs,
  onPick,
}: {
  slabs: Slab[];
  onPick: (s: Slab) => void;
}) {
  return (
    <div className="mt-4">
      <p className="text-xs text-zinc-400 mb-2">
        싸울 PCL 슬랩을 고르세요 — 타입 상성을 잘 살피고!
      </p>
      <ul
        className="grid gap-2"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}
      >
        {slabs.map((s) => {
          const tone = psaTone(s.grade);
          return (
            <li key={s.gradingId}>
              <button
                onClick={() => onPick(s)}
                className={clsx(
                  "w-full flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-left hover:bg-white/10 active:scale-[0.98] transition"
                )}
              >
                <div
                  className={clsx(
                    "shrink-0 w-10 h-14 rounded-md overflow-hidden ring-2 bg-zinc-900",
                    RARITY_STYLE[s.rarity].frame
                  )}
                >
                  {s.imageUrl && (
                    <img
                      src={s.imageUrl}
                      alt=""
                      className="w-full h-full object-contain"
                      draggable={false}
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold text-white truncate">
                    {s.name}
                  </p>
                  <p className="text-[10px] flex items-center gap-1">
                    <span
                      className={clsx(
                        "px-1 py-[1px] rounded font-black text-[9px]",
                        tone.banner
                      )}
                    >
                      PCL {s.grade}
                    </span>
                    {s.type && (
                      <span
                        className={clsx(
                          "px-1 py-[1px] rounded font-bold text-[9px]",
                          TYPE_STYLE[s.type].badge
                        )}
                      >
                        {s.type}
                      </span>
                    )}
                  </p>
                  <p className="text-[9px] text-zinc-400 tabular-nums mt-0.5">
                    HP {s.maxHp} · ATK {s.atk}
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ResultPanel({
  tone,
  title,
  message,
  onAgain,
  onExit,
  disableAgain = false,
}: {
  tone: "win" | "lose";
  title: string;
  message: string;
  onAgain: () => void;
  onExit: () => void;
  disableAgain?: boolean;
}) {
  const win = tone === "win";
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx(
        "mt-4 rounded-2xl border p-5 text-center",
        win
          ? "border-amber-400/50 bg-amber-400/10"
          : "border-rose-500/50 bg-rose-500/10"
      )}
    >
      <div className="text-4xl mb-2">{win ? "🏆" : "💥"}</div>
      <h3
        className={clsx(
          "text-lg font-black",
          win ? "text-amber-200" : "text-rose-200"
        )}
      >
        {title}
      </h3>
      {message && (
        <p
          className={clsx(
            "mt-1 text-sm tabular-nums inline-flex items-center gap-1 justify-center",
            win ? "text-amber-300" : "text-rose-300"
          )}
        >
          {win && <CoinIcon size="xs" />}
          {message}
        </p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={onAgain}
          disabled={disableAgain}
          className={clsx(
            "h-11 rounded-xl font-bold text-sm",
            disableAgain
              ? "bg-white/5 text-zinc-500"
              : "bg-gradient-to-r from-emerald-400 to-lime-500 text-zinc-950 active:scale-[0.98]"
          )}
        >
          한 번 더
        </button>
        <button
          onClick={onExit}
          className="h-11 rounded-xl bg-white/10 border border-white/15 text-white font-bold text-sm active:scale-[0.98]"
        >
          그만하기
        </button>
      </div>
    </motion.div>
  );
}

/** Small character-adjacent speech bubble with a tail. */
function SpeechBubble({
  text,
  side,
}: {
  text: string;
  side: "left" | "right";
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4, scale: 0.85 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.9 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={clsx(
        "relative max-w-[140px] md:max-w-[160px] rounded-xl px-2.5 py-1.5",
        "bg-white text-zinc-900 text-[11px] md:text-xs font-bold leading-snug",
        "shadow-[0_4px_14px_rgba(0,0,0,0.4)] break-keep"
      )}
    >
      {text}
      {/* tail */}
      <span
        aria-hidden
        className={clsx(
          "absolute top-1/2 -translate-y-1/2 w-0 h-0 border-y-[6px] border-y-transparent",
          side === "left"
            ? "-right-1.5 border-l-[7px] border-l-white"
            : "-left-1.5 border-r-[7px] border-r-white"
        )}
      />
    </motion.div>
  );
}
