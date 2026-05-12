"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  bossSpriteUrl,
  speciesSpriteUrl,
  roleLabel,
  roleColor,
  type Ch4Boss,
  type Ch4Frame,
  type Ch4Participant,
  type Ch4RaidState,
} from "@/lib/gym/ch4-db";

interface Props {
  raid: Ch4RaidState;
  boss: Ch4Boss;
  participants: Ch4Participant[];
  onBack: () => void;
}

// 1× 기준 프레임 재생 시간 (속도 조절 가능)
function frameDurationMs(f: Ch4Frame | undefined): number {
  if (!f) return 800;
  switch (f.type) {
    case "battle_start":
      return 1400;
    case "turn_start":
      return 700;
    case "turn_end":
      return 200;
    case "skill":
    case "boss_skill":
      return (f as { kind?: string }).kind === "aoe" ? 3200 : 2500;
    case "counter_reflect":
      return 1100;
    case "phase_transition":
      return 2200;
    case "skip":
      return 400;
    case "battle_end":
      return 3000;
    default:
      return 800;
  }
}

interface LiveState {
  bossHp: number;
  bossMaxHp: number;
  bossAlive: boolean;
  bossPhase: number;
  slots: Array<{ hp: number; maxHp: number; alive: boolean }>;
}

function buildInitial(frames: Ch4Frame[]): LiveState {
  const start = frames.find((f) => f.type === "battle_start") as
    | {
        boss: { hp: number; max_hp: number };
        participants: { slot: number; max_hp: number }[];
      }
    | undefined;
  const slots: LiveState["slots"] = [0, 1, 2].map((i) => {
    const p = start?.participants.find((x) => x.slot === i + 1);
    return { hp: p?.max_hp ?? 0, maxHp: p?.max_hp ?? 0, alive: true };
  }) as LiveState["slots"];
  return {
    bossHp: start?.boss.max_hp ?? 0,
    bossMaxHp: start?.boss.max_hp ?? 0,
    bossAlive: true,
    bossPhase: 1,
    slots,
  };
}

function applyFrame(state: LiveState, f: Ch4Frame): LiveState {
  const next: LiveState = {
    bossHp: state.bossHp,
    bossMaxHp: state.bossMaxHp,
    bossAlive: state.bossAlive,
    bossPhase: state.bossPhase,
    slots: state.slots.map((s) => ({ ...s })),
  };
  const bossHp = (f as { boss_hp?: number }).boss_hp;
  if (typeof bossHp === "number") {
    next.bossHp = bossHp;
    if (bossHp <= 0) next.bossAlive = false;
  }
  if (f.type === "phase_transition") {
    next.bossPhase = (f as { phase: number }).phase;
  }
  const target = (f as { target?: string }).target;
  const targetHp = (f as { target_hp?: number }).target_hp;
  if (
    (f.type === "skill" || f.type === "boss_skill") &&
    typeof target === "string" &&
    target.startsWith("slot") &&
    typeof targetHp === "number"
  ) {
    const s = parseInt(target.slice(4), 10) - 1;
    if (s >= 0 && s <= 2) {
      next.slots[s].hp = targetHp;
      if (targetHp <= 0) next.slots[s].alive = false;
    }
  }
  if (f.type === "turn_end" || f.type === "battle_end") {
    const hps = (f as { participants_hp?: number[] }).participants_hp ?? [];
    for (let s = 0; s < 3; s++) {
      if (typeof hps[s] === "number") {
        next.slots[s].hp = hps[s];
        if (hps[s] <= 0) next.slots[s].alive = false;
      }
    }
  }
  return next;
}

function findSlotByRole(
  participants: Ch4Participant[],
  role: "tank" | "dealer" | "supporter"
): number | null {
  return participants.find((p) => p.role === role)?.slot ?? null;
}

// 캐릭터 위치 (퍼센트, 컨테이너 기준)
const POS = {
  boss: { left: "50%", top: "28%" },
  tank: { left: "50%", top: "62%" },
  dealer: { left: "27%", top: "76%" },
  supporter: { left: "73%", top: "76%" },
} as const;

function posOf(actor: string, participants: Ch4Participant[]) {
  if (actor === "boss") return POS.boss;
  if (!actor.startsWith("slot")) return POS.boss;
  const slot = parseInt(actor.slice(4), 10);
  const role = participants.find((p) => p.slot === slot)?.role;
  if (role === "tank") return POS.tank;
  if (role === "dealer") return POS.dealer;
  if (role === "supporter") return POS.supporter;
  return POS.boss;
}

// ════════════════════════════════════════════
// ░░ Main ░░
// ════════════════════════════════════════════

export default function Ch4RaidReplay({ raid, boss, participants, onBack }: Props) {
  const frames = useMemo<Ch4Frame[]>(
    () => (Array.isArray(raid.replay_data) ? raid.replay_data : []),
    [raid.replay_data]
  );

  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<1 | 2 | 4>(1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const state = useMemo(() => {
    let s = buildInitial(frames);
    for (let i = 0; i <= idx && i < frames.length; i++) {
      s = applyFrame(s, frames[i]);
    }
    return s;
  }, [idx, frames]);

  const currentFrame = frames[idx];
  const currentRound = useMemo(() => {
    for (let i = idx; i >= 0; i--) {
      const f = frames[i];
      if (f.type === "turn_start") return (f as { round: number }).round;
      if (f.type === "battle_end") return (f as { final_round: number }).final_round;
    }
    return 1;
  }, [idx, frames]);

  useEffect(() => {
    if (!playing) return;
    if (idx >= frames.length - 1) {
      setPlaying(false);
      return;
    }
    const dur = frameDurationMs(currentFrame) / speed;
    timer.current = setTimeout(() => setIdx((v) => v + 1), dur);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [idx, playing, speed, currentFrame, frames.length]);

  const handleRestart = useCallback(() => {
    setIdx(0);
    setPlaying(true);
  }, []);

  if (raid.status === "resolving") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black text-zinc-300">
        <div className="text-center">
          <div className="mb-2 text-xl font-bold text-purple-400">
            전투 시뮬레이션 중...
          </div>
          <div className="text-sm text-zinc-500">곧 시작됩니다</div>
        </div>
      </div>
    );
  }

  const ended = idx >= frames.length - 1;
  const tankSlot = findSlotByRole(participants, "tank") ?? 1;
  const dealerSlot = findSlotByRole(participants, "dealer") ?? 2;
  const supporterSlot = findSlotByRole(participants, "supporter") ?? 3;

  const actor = (currentFrame as { actor?: string } | undefined)?.actor;
  const target = (currentFrame as { target?: string } | undefined)?.target;
  const isSkillFrame =
    currentFrame?.type === "skill" || currentFrame?.type === "boss_skill";

  return (
    <div className="fixed inset-0 z-50 mx-auto h-[100dvh] w-full max-w-md overflow-hidden bg-gradient-to-b from-slate-950 via-purple-950/40 to-black font-sans text-white select-none">
      {/* 배경 그리드 */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* 상단 HUD */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-3 pb-3 pt-3 backdrop-blur-sm">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md bg-black/50 px-2 py-1 text-xs text-zinc-300 hover:bg-black/80"
          aria-label="돌아가기"
        >
          ✕
        </button>
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-widest text-purple-300/80">
            STAGE {boss.stage_order}
          </div>
          <div className="font-bold text-sm text-zinc-100">{boss.name}</div>
        </div>
        <div className="rounded-md bg-black/50 px-2 py-1 font-mono text-xs text-zinc-200">
          R{currentRound}
        </div>
      </div>

      {/* 보스 영역 */}
      <div className="absolute left-0 right-0 top-[8%] flex h-[40%] flex-col items-center justify-end">
        <CasterHighlight isActive={actor === "boss" && isSkillFrame} color="#fb7185" />
        <div className="relative">
          <BossSprite boss={boss} state={state} frame={currentFrame} />
          <div className="absolute -bottom-2 left-1/2 h-3 w-32 -translate-x-1/2 rounded-[50%] bg-black/60 blur-md" />
        </div>
        <div className="mt-4 w-[88%]">
          <BossHpBar
            hp={state.bossHp}
            maxHp={state.bossMaxHp}
            phase={state.bossPhase}
            damageFlash={isSkillFrame && target === "boss"}
          />
        </div>
      </div>

      {/* 스킬명 배너 — 보스 HP 바 아래 (중앙 X) */}
      <SkillBannerInline frame={currentFrame} participants={participants} />

      {/* Ground line */}
      <div
        className="absolute left-0 right-0 top-[55%] h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(168,85,247,0.4) 50%, transparent 100%)",
        }}
      />
      <div
        className="absolute left-[10%] right-[10%] top-[55%] h-[14px] -translate-y-[6px]"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(168,85,247,0.25) 0%, transparent 70%)",
          filter: "blur(4px)",
        }}
      />

      {/* 파티 포메이션 */}
      <div className="absolute left-0 right-0 top-[58%] h-[28%]">
        {/* 탱커 선두 (중앙) */}
        <div className="absolute left-1/2 top-[8%] -translate-x-1/2">
          <CasterHighlight
            isActive={actor === `slot${tankSlot}` && isSkillFrame}
            color="#60a5fa"
          />
          <PartyFighter
            participants={participants}
            state={state}
            slot={tankSlot}
            size={92}
            currentFrame={currentFrame}
          />
        </div>
        {/* 딜러 후위 좌 */}
        <div className="absolute left-[14%] bottom-[8%]">
          <CasterHighlight
            isActive={actor === `slot${dealerSlot}` && isSkillFrame}
            color="#fb7185"
          />
          <PartyFighter
            participants={participants}
            state={state}
            slot={dealerSlot}
            size={66}
            currentFrame={currentFrame}
          />
        </div>
        {/* 서포터 후위 우 */}
        <div className="absolute right-[14%] bottom-[8%]">
          <CasterHighlight
            isActive={actor === `slot${supporterSlot}` && isSkillFrame}
            color="#34d399"
          />
          <PartyFighter
            participants={participants}
            state={state}
            slot={supporterSlot}
            size={66}
            currentFrame={currentFrame}
          />
        </div>
      </div>

      {/* 파티 HP 바 (하단, 큼지막) */}
      <div className="absolute bottom-0 left-0 right-0 z-30 bg-black/60 backdrop-blur-sm">
        <div className="grid grid-cols-3 gap-1.5 px-2 pt-2">
          {[1, 2, 3].map((s) => {
            const p = participants.find((x) => x.slot === s);
            const st = state.slots[s - 1];
            const wasHit =
              isSkillFrame && target === `slot${s}` && typeof (currentFrame as { damage?: number }).damage === "number";
            return (
              <PartyHpCard
                key={s}
                p={p}
                state={st}
                wasHit={wasHit}
              />
            );
          })}
        </div>

        {/* 컨트롤 바 */}
        <div className="flex items-center gap-1.5 px-2 py-2">
          <button
            type="button"
            onClick={handleRestart}
            className="rounded-md bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
            aria-label="처음부터"
          >
            ⏮
          </button>
          <button
            type="button"
            onClick={() => setPlaying((v) => !v)}
            disabled={ended}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-bold ${
              ended
                ? "bg-zinc-800 text-zinc-500"
                : "bg-purple-600 text-white hover:bg-purple-500"
            }`}
          >
            {ended ? "완료" : playing ? "❚❚ 일시정지" : "▶ 재생"}
          </button>
          <button
            type="button"
            onClick={() => setSpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1))}
            className="rounded-md bg-zinc-800 px-2 py-1.5 font-mono text-xs text-zinc-200 hover:bg-zinc-700"
          >
            ×{speed}
          </button>
        </div>
      </div>

      {/* 스킬 별 비주얼 이펙트 */}
      <SkillEffectsLayer frame={currentFrame} participants={participants} />

      {/* 데미지/회복 숫자 */}
      <DamageNumberOverlay frame={currentFrame} participants={participants} />

      {/* 라운드 인디케이터 */}
      <RoundIndicatorOverlay frame={currentFrame} />

      {/* 페이즈 전환 */}
      <PhaseTransitionOverlay frame={currentFrame} />

      {/* 화면 효과 (vignette) */}
      <ScreenFxOverlay frame={currentFrame} />

      {ended && raid.result && (
        <EndOverlay
          result={raid.result}
          totalTurns={raid.total_turns ?? 0}
          bossName={boss.name}
          onBack={onBack}
          onReplay={handleRestart}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════
// ░░ 시전자 강조 발광 ring ░░
// ════════════════════════════════════════════

function CasterHighlight({
  isActive,
  color,
}: {
  isActive: boolean;
  color: string;
}) {
  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: [0.6, 1.4, 1.2] }}
          exit={{ opacity: 0, scale: 1.6 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          style={{ zIndex: 0 }}
        >
          <div
            className="h-32 w-32 rounded-full"
            style={{
              background: `radial-gradient(circle, ${color}55 0%, ${color}22 40%, transparent 70%)`,
              boxShadow: `0 0 30px ${color}`,
              animation: "casterPulse 1.2s ease-in-out infinite alternate",
            }}
          />
          <style jsx>{`
            @keyframes casterPulse {
              from {
                transform: scale(1);
                opacity: 0.6;
              }
              to {
                transform: scale(1.15);
                opacity: 1;
              }
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ════════════════════════════════════════════
// ░░ Boss Sprite ░░
// ════════════════════════════════════════════

function BossSprite({
  boss,
  state,
  frame,
}: {
  boss: Ch4Boss;
  state: LiveState;
  frame: Ch4Frame | undefined;
}) {
  const actor = (frame as { actor?: string } | undefined)?.actor;
  const isAttacking =
    actor === "boss" &&
    (frame?.type === "skill" || frame?.type === "boss_skill");
  const isHit =
    !!frame &&
    (frame.type === "skill" || frame.type === "counter_reflect") &&
    (frame as { target?: string }).target === "boss" &&
    typeof (frame as { damage?: number }).damage === "number";

  return (
    <motion.div
      animate={
        isAttacking
          ? { y: [0, 22, 22, 0], scale: [1, 1.06, 1.06, 1] }
          : !state.bossAlive
          ? { opacity: 0.25, y: 8 }
          : { y: [0, -4, 0], scale: 1 }
      }
      transition={
        isAttacking
          ? { duration: 1.6, times: [0, 0.3, 0.7, 1], ease: "easeInOut" }
          : !state.bossAlive
          ? { duration: 0.8 }
          : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }
      }
    >
      <motion.img
        src={bossSpriteUrl(boss.sprite_key)}
        alt={boss.name}
        className="h-[180px] w-[180px] object-contain"
        style={{ imageRendering: "pixelated" }}
        animate={
          isHit
            ? {
                x: [0, -8, 8, -6, 6, 0],
                filter: [
                  "brightness(1)",
                  "brightness(2.8) sepia(1) saturate(5) hue-rotate(-40deg)",
                  "brightness(1)",
                ],
              }
            : !state.bossAlive
            ? { filter: "grayscale(1) brightness(0.4)" }
            : state.bossPhase === 2
            ? {
                filter: [
                  "brightness(1) hue-rotate(0deg)",
                  "brightness(1.3) hue-rotate(-30deg)",
                  "brightness(1) hue-rotate(0deg)",
                ],
              }
            : {}
        }
        transition={
          isHit
            ? { duration: 0.55 }
            : !state.bossAlive
            ? { duration: 0.6 }
            : state.bossPhase === 2
            ? { duration: 2, repeat: Infinity }
            : { duration: 0.3 }
        }
      />
    </motion.div>
  );
}

// ════════════════════════════════════════════
// ░░ Party Fighter Sprite ░░
// ════════════════════════════════════════════

function PartyFighter({
  participants,
  state,
  slot,
  size,
  currentFrame,
}: {
  participants: Ch4Participant[];
  state: LiveState;
  slot: number;
  size: number;
  currentFrame: Ch4Frame | undefined;
}) {
  const p = participants.find((x) => x.slot === slot);
  const st = state.slots[slot - 1];
  if (!p) return null;

  const actorTag = `slot${slot}`;
  const actor = (currentFrame as { actor?: string } | undefined)?.actor;
  const target = (currentFrame as { target?: string } | undefined)?.target;
  const kind = (currentFrame as { kind?: string } | undefined)?.kind;

  const isCasting =
    !!currentFrame &&
    (currentFrame.type === "skill" || currentFrame.type === "counter_reflect") &&
    actor === actorTag;
  const isHit =
    !!currentFrame &&
    (currentFrame.type === "boss_skill" || currentFrame.type === "skill") &&
    target === actorTag &&
    typeof (currentFrame as { damage?: number }).damage === "number";
  const isHealed =
    !!currentFrame &&
    currentFrame.type === "skill" &&
    kind === "heal" &&
    target === actorTag;
  const isBuffed =
    !!currentFrame &&
    currentFrame.type === "skill" &&
    (kind === "buff" || kind === "counter") &&
    (target === actorTag || target === "all_allies");

  return (
    <motion.div
      className="relative"
      animate={
        isCasting
          ? { y: [0, -34, -34, 0], scale: [1, 1.1, 1.1, 1] }
          : !st.alive
          ? { opacity: 0.25, y: 4 }
          : { y: [0, -3, 0] }
      }
      transition={
        isCasting
          ? { duration: 1.6, times: [0, 0.3, 0.7, 1], ease: "easeInOut" }
          : !st.alive
          ? { duration: 0.5 }
          : { duration: 3.0, repeat: Infinity, ease: "easeInOut" }
      }
      style={{ filter: !st.alive ? "grayscale(1)" : undefined }}
    >
      <motion.img
        src={speciesSpriteUrl(p.starter.species, p.starter.evolution_stage)}
        alt={p.starter.species}
        style={{
          height: size,
          width: size,
          imageRendering: "pixelated",
        }}
        className="object-contain"
        animate={
          isHit
            ? {
                x: [0, -7, 7, -5, 5, 0],
                filter: [
                  "brightness(1)",
                  "brightness(2.8) sepia(1) saturate(5) hue-rotate(-30deg)",
                  "brightness(1)",
                ],
              }
            : isHealed
            ? {
                filter: [
                  "drop-shadow(0 0 0 #34d399)",
                  "drop-shadow(0 0 18px #34d399)",
                  "drop-shadow(0 0 0 #34d399)",
                ],
              }
            : isBuffed
            ? {
                filter: [
                  "drop-shadow(0 0 0 #fbbf24)",
                  "drop-shadow(0 0 14px #fbbf24)",
                  "drop-shadow(0 0 0 #fbbf24)",
                ],
              }
            : {}
        }
        transition={{ duration: 0.7 }}
      />
      <div
        className="absolute left-1/2 h-1.5 -translate-x-1/2 rounded-[50%] bg-black/60 blur-sm"
        style={{ width: size * 0.7, bottom: -2 }}
      />
      <div
        className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-bold text-zinc-100 drop-shadow-lg"
        style={{ bottom: -16 }}
      >
        {p.starter.nickname}
      </div>
    </motion.div>
  );
}

// ════════════════════════════════════════════
// ░░ Boss HP Bar (큼지막, 데미지 펄스) ░░
// ════════════════════════════════════════════

function BossHpBar({
  hp,
  maxHp,
  phase,
  damageFlash,
}: {
  hp: number;
  maxHp: number;
  phase: number;
  damageFlash: boolean;
}) {
  const pct = maxHp > 0 ? Math.max(0, (hp / maxHp) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {phase >= 2 && (
            <motion.span
              className="rounded-sm bg-red-700/80 px-1.5 py-0.5 text-[9px] font-black tracking-wider text-red-100 ring-1 ring-red-500"
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            >
              광폭화
            </motion.span>
          )}
        </div>
        <span className="font-mono text-[10px] text-zinc-300">
          {Math.max(0, hp).toLocaleString()} / {maxHp.toLocaleString()}
        </span>
      </div>
      <motion.div
        className="relative mt-1 h-5 w-full overflow-hidden rounded-md bg-zinc-900/90 ring-2 ring-rose-900/60 shadow-inner"
        animate={
          damageFlash
            ? {
                boxShadow: [
                  "inset 0 0 4px rgba(244,63,94,0.5)",
                  "inset 0 0 16px rgba(244,63,94,1), 0 0 12px rgba(244,63,94,0.8)",
                  "inset 0 0 4px rgba(244,63,94,0.5)",
                ],
              }
            : {}
        }
        transition={{ duration: 0.55 }}
      >
        <motion.div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-rose-600 via-rose-500 to-red-400"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          style={{ boxShadow: "0 0 12px rgba(244,63,94,0.6)" }}
        />
        {/* 데미지 잔상 (밝은 stripe 가 사라지는) */}
        <AnimatePresence>
          {damageFlash && (
            <motion.div
              className="absolute inset-y-0 right-0 bg-white/40"
              initial={{ width: 0, opacity: 1 }}
              animate={{ width: "10%", opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// ════════════════════════════════════════════
// ░░ Party HP Cards (하단, 크게) ░░
// ════════════════════════════════════════════

function PartyHpCard({
  p,
  state,
  wasHit,
}: {
  p: Ch4Participant | undefined;
  state: LiveState["slots"][number];
  wasHit: boolean;
}) {
  const pct = state.maxHp > 0 ? (state.hp / state.maxHp) * 100 : 0;
  const dead = !state.alive;
  const color =
    pct > 50
      ? "bg-emerald-500"
      : pct > 25
      ? "bg-amber-400"
      : "bg-red-500";
  return (
    <motion.div
      animate={
        wasHit
          ? {
              boxShadow: [
                "0 0 0 0 rgba(244,63,94,0)",
                "0 0 0 4px rgba(244,63,94,0.6)",
                "0 0 0 0 rgba(244,63,94,0)",
              ],
            }
          : {}
      }
      transition={{ duration: 0.5 }}
      className={`rounded-md border px-2 py-1.5 ${
        dead
          ? "border-zinc-900 bg-zinc-950/40 opacity-50"
          : p?.is_bot
          ? "border-zinc-700 bg-zinc-900/30"
          : "border-zinc-800 bg-zinc-950/40"
      }`}
    >
      <div className="flex items-baseline justify-between gap-1">
        <span
          className={`text-[10px] font-bold ${p ? roleColor(p.role) : ""}`}
        >
          {p ? roleLabel(p.role) : "-"}
        </span>
        {p?.is_bot && <span className="text-[8px] text-zinc-500">BOT</span>}
      </div>
      <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-zinc-900 ring-1 ring-zinc-800">
        <motion.div
          className={`h-full ${color}`}
          initial={false}
          animate={{ width: `${Math.max(0, pct)}%` }}
          transition={{ duration: 0.45 }}
          style={{ boxShadow: "0 0 6px rgba(255,255,255,0.15)" }}
        />
      </div>
      <div className="mt-0.5 flex items-baseline justify-between">
        <span className="text-[8px] text-zinc-400 truncate max-w-[60%]">
          {p?.starter.nickname ?? ""}
        </span>
        <span className="font-mono text-[9px] text-zinc-300">
          {Math.max(0, state.hp).toLocaleString()}
        </span>
      </div>
    </motion.div>
  );
}

// ════════════════════════════════════════════
// ░░ 스킬 별 비주얼 이펙트 (8 templates) ░░
// ════════════════════════════════════════════

function SkillEffectsLayer({
  frame,
  participants,
}: {
  frame: Ch4Frame | undefined;
  participants: Ch4Participant[];
}) {
  if (!frame) return null;
  if (frame.type !== "skill" && frame.type !== "boss_skill") return null;

  const f = frame as {
    actor?: string;
    target?: string;
    kind?: string;
    fx?: {
      template?: string;
      color?: string | null;
      color_2?: string | null;
      intensity?: number;
    };
  };
  const tmpl = f.fx?.template ?? "dash_strike";
  const color = f.fx?.color ?? "#ffffff";
  const color2 = f.fx?.color_2 ?? color;
  const actorPos = posOf(f.actor ?? "boss", participants);
  const targetIsBoss = f.target === "boss";
  const targetIsAoe = f.kind === "aoe" || f.target === "all_allies";
  const targetPos =
    targetIsAoe || !f.target
      ? POS.boss
      : f.target === "boss"
      ? POS.boss
      : posOf(f.target, participants);

  switch (tmpl) {
    case "beam_ray":
      return <BeamRayFx key={frame.t} from={actorPos} to={targetPos} color={color} color2={color2} />;
    case "summon_above":
      return <SummonAboveFx key={frame.t} target={targetPos} color={color} color2={color2} />;
    case "aoe_wave":
      return <AoeWaveFx key={frame.t} origin={actorPos} color={color} color2={color2} />;
    case "floor_eruption":
      return <FloorEruptionFx key={frame.t} target={targetPos} color={color} />;
    case "aura_buff":
      return <AuraBuffFx key={frame.t} actor={actorPos} color={color} />;
    case "sparkle_heal":
      return <SparkleHealFx key={frame.t} target={targetPos} color={color} />;
    case "shadow_swipe":
      return <ShadowSwipeFx key={frame.t} target={targetIsBoss ? POS.boss : targetPos} color={color} />;
    case "dash_strike":
    default:
      return <DashStrikeFx key={frame.t} target={targetIsBoss ? POS.boss : targetPos} color={color} />;
  }
}

// — 광선 (beam) —
function BeamRayFx({
  from,
  to,
  color,
  color2,
}: {
  from: { left: string; top: string };
  to: { left: string; top: string };
  color: string;
  color2: string;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {/* 광선 본체: from 에서 to 까지 SVG line */}
      <svg className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="beamGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={color} stopOpacity="0.1" />
            <stop offset="50%" stopColor={color2} stopOpacity="1" />
            <stop offset="100%" stopColor={color} stopOpacity="0.1" />
          </linearGradient>
          <filter id="beamGlow">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        <motion.line
          x1={from.left}
          y1={from.top}
          x2={to.left}
          y2={to.top}
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          filter="url(#beamGlow)"
          initial={{ opacity: 0, strokeWidth: 1 }}
          animate={{ opacity: [0, 1, 1, 0], strokeWidth: [1, 10, 8, 2] }}
          transition={{ duration: 1.2, times: [0, 0.2, 0.7, 1] }}
        />
        <motion.line
          x1={from.left}
          y1={from.top}
          x2={to.left}
          y2={to.top}
          stroke="#ffffff"
          strokeWidth="2"
          strokeLinecap="round"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{ duration: 1.2, times: [0, 0.2, 0.7, 1] }}
        />
      </svg>
      {/* 타겟 임팩트 폭발 */}
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: to.left,
          top: to.top,
          background: `radial-gradient(circle, ${color2} 0%, ${color}88 40%, transparent 70%)`,
          boxShadow: `0 0 40px ${color}`,
        }}
        initial={{ width: 0, height: 0, opacity: 0 }}
        animate={{ width: [0, 120, 80], height: [0, 120, 80], opacity: [0, 1, 0] }}
        transition={{ duration: 1.2, times: [0, 0.4, 1] }}
      />
    </div>
  );
}

// — 돌진 슬래시 —
function DashStrikeFx({ target, color }: { target: { left: string; top: string }; color: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {/* 슬래시 X 효과 */}
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{ left: target.left, top: target.top }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 0.7, times: [0, 0.3, 1] }}
      >
        {/* 슬래시 1 (↗) */}
        <motion.div
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{
            width: 120,
            height: 8,
            background: `linear-gradient(90deg, transparent, ${color}, #ffffff, ${color}, transparent)`,
            boxShadow: `0 0 20px ${color}, 0 0 40px ${color}`,
            transform: "rotate(-30deg)",
          }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.25, delay: 0.1 }}
        />
        {/* 슬래시 2 (↘) */}
        <motion.div
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{
            width: 120,
            height: 8,
            background: `linear-gradient(90deg, transparent, ${color}, #ffffff, ${color}, transparent)`,
            boxShadow: `0 0 20px ${color}, 0 0 40px ${color}`,
            transform: "rotate(30deg)",
          }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.25, delay: 0.25 }}
        />
      </motion.div>
      {/* 임팩트 플래시 */}
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: target.left,
          top: target.top,
          background: `radial-gradient(circle, #ffffff 0%, ${color} 50%, transparent 80%)`,
        }}
        initial={{ width: 0, height: 0, opacity: 0 }}
        animate={{ width: [0, 80, 0], height: [0, 80, 0], opacity: [0, 0.8, 0] }}
        transition={{ duration: 0.5, delay: 0.3 }}
      />
    </div>
  );
}

// — 위에서 떨어지는 운석/오브 —
function SummonAboveFx({
  target,
  color,
  color2,
}: {
  target: { left: string; top: string };
  color: string;
  color2: string;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {/* 떨어지는 오브 */}
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: target.left,
          top: target.top,
          width: 60,
          height: 60,
          background: `radial-gradient(circle, ${color2} 0%, ${color} 60%, transparent 100%)`,
          boxShadow: `0 0 40px ${color}, inset 0 0 20px ${color2}`,
        }}
        initial={{ y: -300, scale: 0.5, opacity: 0 }}
        animate={{ y: [-300, 0, 0], scale: [0.5, 1.2, 1], opacity: [0, 1, 1, 0] }}
        transition={{ duration: 1.2, times: [0, 0.6, 0.7, 1] }}
      />
      {/* 임팩트 폭발 */}
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: target.left,
          top: target.top,
          background: `radial-gradient(circle, #ffffff 0%, ${color} 40%, transparent 70%)`,
        }}
        initial={{ width: 0, height: 0, opacity: 0 }}
        animate={{ width: [0, 160], height: [0, 160], opacity: [0, 1, 0] }}
        transition={{ duration: 0.8, delay: 0.5 }}
      />
    </div>
  );
}

// — 광역 토네이도/충격파 —
function AoeWaveFx({
  origin,
  color,
  color2,
}: {
  origin: { left: string; top: string };
  color: string;
  color2: string;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {/* 다중 ripple */}
      {[0, 0.2, 0.4].map((delay, i) => (
        <motion.div
          key={i}
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-4"
          style={{
            left: origin.left,
            top: origin.top,
            borderColor: i % 2 === 0 ? color : color2,
            boxShadow: `0 0 30px ${color}, inset 0 0 30px ${color2}`,
          }}
          initial={{ width: 40, height: 40, opacity: 0 }}
          animate={{ width: [40, 600], height: [40, 600], opacity: [0, 0.8, 0] }}
          transition={{ duration: 1.6, delay, times: [0, 0.3, 1] }}
        />
      ))}
      {/* 회전 토네이도 (중앙 cone) */}
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{ left: origin.left, top: origin.top }}
        animate={{ rotate: 360 }}
        transition={{ duration: 1.2, ease: "linear" }}
      >
        <motion.div
          className="rounded-full"
          style={{
            width: 100,
            height: 100,
            background: `conic-gradient(${color}aa, transparent, ${color2}aa, transparent, ${color}aa)`,
            filter: "blur(4px)",
          }}
          initial={{ opacity: 0, scale: 0.3 }}
          animate={{ opacity: [0, 0.9, 0], scale: [0.3, 1.5, 2] }}
          transition={{ duration: 1.4 }}
        />
      </motion.div>
    </div>
  );
}

// — 바닥에서 솟구치는 기둥 —
function FloorEruptionFx({ target, color }: { target: { left: string; top: string }; color: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-full"
        style={{
          left: target.left,
          top: `calc(${target.top} + 40px)`,
          width: 80,
          background: `linear-gradient(to top, ${color} 0%, ${color}88 50%, transparent 100%)`,
          boxShadow: `0 0 30px ${color}`,
          borderRadius: 999,
        }}
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: [0, 200, 200, 0], opacity: [0, 1, 0.8, 0] }}
        transition={{ duration: 1.1, times: [0, 0.3, 0.7, 1] }}
      />
    </div>
  );
}

// — 시전자 주변 회전 오라 —
function AuraBuffFx({ actor, color }: { actor: { left: string; top: string }; color: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{ left: actor.left, top: actor.top }}
        animate={{ rotate: 360 }}
        transition={{ duration: 1.4, ease: "linear" }}
      >
        {/* 회전 ring 1 */}
        <motion.div
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-dashed"
          style={{
            width: 100,
            height: 100,
            borderColor: color,
            boxShadow: `0 0 20px ${color}, inset 0 0 20px ${color}`,
          }}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: [0, 1, 1, 0], scale: [0.5, 1, 1.2, 1.4] }}
          transition={{ duration: 1.4, times: [0, 0.2, 0.7, 1] }}
        />
        {/* 회전 ring 2 (역회전) */}
        <motion.div
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
          style={{
            width: 130,
            height: 130,
            borderColor: color,
            boxShadow: `0 0 15px ${color}`,
          }}
          animate={{ rotate: -720 }}
          transition={{ duration: 1.4, ease: "linear" }}
          initial={{ opacity: 0 }}
        />
      </motion.div>
      {/* 중앙 글로우 */}
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: actor.left,
          top: actor.top,
          background: `radial-gradient(circle, ${color}66 0%, transparent 70%)`,
        }}
        initial={{ width: 40, height: 40, opacity: 0 }}
        animate={{
          width: [40, 120, 80],
          height: [40, 120, 80],
          opacity: [0, 0.8, 0],
        }}
        transition={{ duration: 1.4 }}
      />
    </div>
  );
}

// — 회복 반짝이 (sparkle) —
function SparkleHealFx({ target, color }: { target: { left: string; top: string }; color: string }) {
  // 8개 sparkle 무작위 위치
  const sparkles = [-3, -2, -1, 0, 1, 2, 3, 4];
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {sparkles.map((i) => {
        const offsetX = (Math.cos((i * Math.PI) / 4) * 50);
        const delay = (i * 0.05);
        return (
          <motion.div
            key={i}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `calc(${target.left} + ${offsetX}px)`,
              top: target.top,
            }}
            initial={{ y: 30, opacity: 0, scale: 0 }}
            animate={{ y: -60, opacity: [0, 1, 0], scale: [0, 1.2, 0.6] }}
            transition={{ duration: 1.1, delay, ease: "easeOut" }}
          >
            <div
              style={{
                width: 14,
                height: 14,
                background: color,
                borderRadius: "50%",
                boxShadow: `0 0 12px ${color}, 0 0 20px ${color}`,
              }}
            />
          </motion.div>
        );
      })}
      {/* 중앙 회복 글로우 */}
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: target.left,
          top: target.top,
          background: `radial-gradient(circle, ${color}aa 0%, transparent 60%)`,
        }}
        initial={{ width: 0, height: 0, opacity: 0 }}
        animate={{ width: [0, 100, 60], height: [0, 100, 60], opacity: [0, 0.7, 0] }}
        transition={{ duration: 1.0 }}
      />
    </div>
  );
}

// — 어둠 슬래시 (shadow_swipe) —
function ShadowSwipeFx({ target, color }: { target: { left: string; top: string }; color: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {/* 대각선 슬래시 */}
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{
          left: target.left,
          top: target.top,
          width: 200,
          height: 12,
          background: `linear-gradient(90deg, transparent, ${color}, #000000, ${color}, transparent)`,
          boxShadow: `0 0 25px ${color}, 0 0 50px ${color}`,
          transform: "rotate(-25deg)",
          filter: "blur(2px)",
        }}
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: [0, 1.2, 1], opacity: [0, 1, 0] }}
        transition={{ duration: 0.7, times: [0, 0.3, 1] }}
      />
      {/* 어둠 잔영 */}
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: target.left,
          top: target.top,
          background: `radial-gradient(circle, ${color}66 0%, #000000aa 50%, transparent 80%)`,
        }}
        initial={{ width: 0, height: 0, opacity: 0 }}
        animate={{ width: [0, 140, 100], height: [0, 140, 100], opacity: [0, 0.9, 0] }}
        transition={{ duration: 1.0 }}
      />
    </div>
  );
}

// ════════════════════════════════════════════
// ░░ 스킬명 인라인 배너 (보스 HP 아래, 작음) ░░
// ════════════════════════════════════════════

function SkillBannerInline({
  frame,
  participants,
}: {
  frame: Ch4Frame | undefined;
  participants: Ch4Participant[];
}) {
  if (!frame) return null;
  if (frame.type !== "skill" && frame.type !== "boss_skill") return null;
  const f = frame as {
    actor?: string;
    skill_name?: string;
    fx?: { color?: string | null };
  };
  const name = f.skill_name;
  if (!name) return null;
  const color = f.fx?.color ?? "#ffffff";
  const isBoss = f.actor === "boss";

  // 시전자 이름
  let casterLabel = "보스";
  if (!isBoss && f.actor?.startsWith("slot")) {
    const slot = parseInt(f.actor.slice(4), 10);
    const p = participants.find((x) => x.slot === slot);
    if (p) casterLabel = p.starter.nickname;
  }

  return (
    <AnimatePresence>
      <motion.div
        key={`skill-${frame.t}`}
        className="pointer-events-none absolute left-0 right-0 top-[50%] z-30 flex justify-center px-3"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
      >
        <div
          className="flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold backdrop-blur-md"
          style={{
            background: `${color}20`,
            border: `1px solid ${color}aa`,
            boxShadow: `0 2px 10px ${color}55`,
          }}
        >
          <span className="text-[10px] text-zinc-300">{casterLabel}</span>
          <span style={{ color, textShadow: `0 0 6px ${color}` }}>
            {isBoss ? "⚔" : "★"} {name}
          </span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ════════════════════════════════════════════
// ░░ 데미지/회복 숫자 ░░
// ════════════════════════════════════════════

function DamageNumberOverlay({
  frame,
  participants,
}: {
  frame: Ch4Frame | undefined;
  participants: Ch4Participant[];
}) {
  if (!frame) return null;
  const damage = (frame as { damage?: number }).damage;
  const heal = (frame as { heal?: number }).heal;
  const isCounter = frame.type === "counter_reflect";
  const target = (frame as { target?: string }).target;

  if (!damage && !heal) return null;

  let pos: { left: string; top: string } = { left: "50%", top: "30%" };
  if (isCounter || target === "boss") {
    pos = POS.boss;
  } else if (target?.startsWith("slot")) {
    const s = parseInt(target.slice(4), 10);
    const role = participants.find((x) => x.slot === s)?.role;
    if (role === "tank") pos = POS.tank;
    else if (role === "dealer") pos = POS.dealer;
    else if (role === "supporter") pos = POS.supporter;
  }

  let label = "";
  let color = "#ffffff";
  const crit = (frame as { crit?: boolean }).crit;
  const weak = (frame as { weakness?: boolean }).weakness;
  const resist = (frame as { resist?: boolean }).resist;

  if (heal) {
    label = `+${heal.toLocaleString()}`;
    color = "#34d399";
  } else if (damage) {
    label = `-${damage.toLocaleString()}`;
    if (crit) color = "#f87171";
    else if (weak) color = "#fbbf24";
    else if (resist) color = "#94a3b8";
    else color = "#fde68a";
  }
  if (isCounter && damage) {
    label = `↩ -${damage.toLocaleString()}`;
    color = "#fb923c";
  }

  return (
    <AnimatePresence>
      <motion.div
        key={`dmg-${frame.t}`}
        className="pointer-events-none absolute z-40 -translate-x-1/2"
        style={{ left: pos.left, top: pos.top }}
        initial={{ y: 12, opacity: 0, scale: 0.5 }}
        animate={{
          y: -90,
          opacity: 1,
          scale: crit ? 1.8 : weak ? 1.5 : 1.25,
        }}
        exit={{ opacity: 0, y: -110 }}
        transition={{ duration: 1.4, ease: "easeOut" }}
      >
        <div
          className="text-center text-3xl font-black tabular-nums"
          style={{
            color,
            textShadow: `0 0 12px ${color}, 0 2px 6px rgba(0,0,0,0.95)`,
            WebkitTextStroke: "1.5px rgba(0,0,0,0.7)",
          }}
        >
          {label}
        </div>
        {crit && (
          <div className="text-center text-[10px] font-black tracking-wider text-red-300">
            CRITICAL!
          </div>
        )}
        {weak && !crit && (
          <div className="text-center text-[10px] font-black tracking-wider text-amber-300">
            약점!
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

// ════════════════════════════════════════════
// ░░ 라운드 시작 배너 ░░
// ════════════════════════════════════════════

function RoundIndicatorOverlay({ frame }: { frame: Ch4Frame | undefined }) {
  if (!frame || frame.type !== "turn_start") return null;
  const round = (frame as { round: number }).round;
  return (
    <AnimatePresence>
      <motion.div
        key={`round-${frame.t}`}
        className="pointer-events-none absolute left-0 right-0 top-[14%] z-30 flex justify-center"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="rounded-full bg-black/70 px-5 py-1.5 text-xs font-bold tracking-[0.2em] text-purple-200 ring-1 ring-purple-700/50">
          ROUND {round}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ════════════════════════════════════════════
// ░░ 페이즈 전환 ░░
// ════════════════════════════════════════════

function PhaseTransitionOverlay({ frame }: { frame: Ch4Frame | undefined }) {
  if (!frame || frame.type !== "phase_transition") return null;
  return (
    <AnimatePresence>
      <motion.div
        key={`phase-${frame.t}`}
        className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
      >
        <motion.div
          className="absolute inset-0"
          animate={{
            background: [
              "radial-gradient(circle, transparent 30%, rgba(220,38,38,0) 100%)",
              "radial-gradient(circle, transparent 20%, rgba(220,38,38,0.5) 100%)",
              "radial-gradient(circle, transparent 30%, rgba(220,38,38,0) 100%)",
            ],
          }}
          transition={{ duration: 1.4 }}
        />
        <motion.div
          className="relative text-center"
          initial={{ scale: 0.4, y: 30 }}
          animate={{ scale: [0.4, 1.2, 1], y: 0 }}
          exit={{ scale: 1.4, opacity: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div
            className="text-4xl font-black text-red-400"
            style={{
              textShadow:
                "0 0 20px #ef4444, 0 0 40px #7f1d1d, 0 4px 8px rgba(0,0,0,0.9)",
            }}
          >
            광폭화
          </div>
          <div className="mt-1 text-xs tracking-[0.3em] text-red-200">
            PHASE 2
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ════════════════════════════════════════════
// ░░ 화면 효과 (AOE vignette) ░░
// ════════════════════════════════════════════

function ScreenFxOverlay({ frame }: { frame: Ch4Frame | undefined }) {
  if (!frame) return null;
  const fx = (frame as {
    fx?: {
      shake?: string;
      vignette?: string | null;
      color?: string | null;
    };
    kind?: string;
  }).fx;
  if (!fx) return null;
  const isAoe = (frame as { kind?: string }).kind === "aoe";
  const isHeavy = fx.shake === "screen" || fx.shake === "large";
  const vColor = isAoe ? fx.vignette ?? fx.color : isHeavy ? fx.color : null;
  if (!vColor) return null;

  return (
    <AnimatePresence>
      <motion.div
        key={`fx-${frame.t}`}
        className="pointer-events-none absolute inset-0 z-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, isAoe ? 0.7 : 0.4, 0] }}
        exit={{ opacity: 0 }}
        transition={{ duration: 1.4, times: [0, 0.3, 1] }}
        style={{
          background: `radial-gradient(circle, transparent ${isAoe ? 20 : 40}%, ${vColor} 110%)`,
        }}
      />
    </AnimatePresence>
  );
}

// ════════════════════════════════════════════
// ░░ 종료 오버레이 ░░
// ════════════════════════════════════════════

function EndOverlay({
  result,
  totalTurns,
  bossName,
  onBack,
  onReplay,
}: {
  result: "win" | "loss";
  totalTurns: number;
  bossName: string;
  onBack: () => void;
  onReplay: () => void;
}) {
  const isWin = result === "win";
  return (
    <motion.div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <motion.div
        className={`mx-4 rounded-2xl border-4 px-8 py-7 text-center ${
          isWin
            ? "border-emerald-500 bg-emerald-950/50"
            : "border-red-700 bg-red-950/50"
        }`}
        initial={{ scale: 0.5, y: 30 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.15, ease: "backOut" }}
      >
        <motion.div
          className={`text-5xl font-black tracking-wider ${
            isWin ? "text-emerald-300" : "text-red-300"
          }`}
          style={{
            textShadow: isWin
              ? "0 0 20px #10b981, 0 4px 8px rgba(0,0,0,0.8)"
              : "0 0 20px #dc2626, 0 4px 8px rgba(0,0,0,0.8)",
          }}
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 1.8, repeat: Infinity }}
        >
          {isWin ? "VICTORY" : "DEFEAT"}
        </motion.div>
        <div className="mt-3 text-sm text-zinc-300">
          {bossName} · {totalTurns} 라운드
        </div>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onReplay}
            className="rounded-lg bg-purple-600 px-6 py-2 font-bold text-white hover:bg-purple-500"
          >
            다시보기
          </button>
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg bg-zinc-800 px-6 py-2 font-bold text-zinc-100 hover:bg-zinc-700"
          >
            돌아가기
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
