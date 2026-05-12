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
      return 400;
    case "turn_end":
      return 150;
    case "skill":
    case "boss_skill": {
      const k = (f as { kind?: string }).kind;
      if (k === "aoe" || k === "heal_all") return 2600;
      if (k === "ultimate") return 3000;
      if (k === "multi_hit") return 2300;
      return 2200;
    }
    case "counter_reflect":
      return 1000;
    case "phase_transition":
      return 2000;
    case "skip":
      return 250;
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

type FrameTarget = {
  target?: string;
  target_hp?: number;
  damage?: number;
  heal?: number;
  hit_index?: number;
  resist?: boolean;
  crit?: boolean;
};

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
  // ★ targets[] 배열 일괄 적용 (AOE / multi_hit / heal_all 등)
  const targets = (f as { targets?: FrameTarget[] }).targets;
  if (Array.isArray(targets)) {
    for (const t of targets) {
      if (t.target === "boss" && typeof t.target_hp === "number") {
        next.bossHp = t.target_hp;
        if (t.target_hp <= 0) next.bossAlive = false;
      } else if (
        typeof t.target === "string" &&
        t.target.startsWith("slot") &&
        typeof t.target_hp === "number"
      ) {
        const s = parseInt(t.target.slice(4), 10) - 1;
        if (s >= 0 && s <= 2) {
          next.slots[s].hp = t.target_hp;
          if (t.target_hp <= 0) next.slots[s].alive = false;
        }
      }
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
  boss: { left: "50%", top: "26%" },
  tank: { left: "50%", top: "55%" },
  dealer: { left: "26%", top: "67%" },
  supporter: { left: "74%", top: "67%" },
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
        <div className="w-7" aria-hidden />
      </div>

      {/* 보스 영역 */}
      <div className="absolute left-0 right-0 top-[6%] flex h-[38%] flex-col items-center justify-end">
        <CasterHighlight isActive={actor === "boss" && isSkillFrame} color="#fb7185" />
        <div className="relative">
          <BossSprite boss={boss} state={state} frame={currentFrame} />
          <div className="absolute -bottom-2 left-1/2 h-3 w-32 -translate-x-1/2 rounded-[50%] bg-black/60 blur-md" />
        </div>
        <div className="mt-3 w-[88%]">
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
        className="absolute left-0 right-0 top-[48%] h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(168,85,247,0.4) 50%, transparent 100%)",
        }}
      />
      <div
        className="absolute left-[10%] right-[10%] top-[48%] h-[14px] -translate-y-[6px]"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(168,85,247,0.25) 0%, transparent 70%)",
          filter: "blur(4px)",
        }}
      />

      {/* 파티 포메이션 */}
      <div className="absolute left-0 right-0 top-[50%] h-[26%]">
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
        <div className="absolute left-[12%] bottom-[20%]">
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
        <div className="absolute right-[12%] bottom-[20%]">
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
// ░░ 포지션 문양 (Tank=방패 / Dealer=검 / Supporter=별 / Boss=왕관) ░░
// ════════════════════════════════════════════

function RoleSigil({
  role,
  size = 16,
  color = "#ffffff",
}: {
  role: "tank" | "dealer" | "supporter" | "boss";
  size?: number;
  color?: string;
}) {
  const stroke = color;
  const fill = `${color}55`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{
        filter: `drop-shadow(0 0 6px ${color})`,
        flexShrink: 0,
      }}
      aria-hidden
    >
      {role === "tank" && (
        // 방패
        <path
          d="M12 2 L21 5 V12 C21 17 17 21 12 22 C7 21 3 17 3 12 V5 Z"
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinejoin="round"
          fill={fill}
        />
      )}
      {role === "dealer" && (
        // 검 (사선)
        <g stroke={stroke} strokeWidth="1.6" strokeLinecap="round" fill="none">
          <line x1="4" y1="20" x2="18" y2="6" />
          <path d="M18 6 L21 3 L17 7 Z" fill={fill} />
          <line x1="5" y1="17" x2="9" y2="21" />
          <circle cx="4" cy="20" r="1.6" fill={fill} />
        </g>
      )}
      {role === "supporter" && (
        // 4 점 별 + 십자
        <g stroke={stroke} strokeWidth="1.4" strokeLinejoin="round" fill={fill}>
          <polygon points="12,3 14,10 21,12 14,14 12,21 10,14 3,12 10,10" />
        </g>
      )}
      {role === "boss" && (
        // 왕관/뿔
        <g stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" fill={fill}>
          <path d="M3 18 L5 7 L9 13 L12 5 L15 13 L19 7 L21 18 Z" />
          <line x1="3" y1="21" x2="21" y2="21" stroke={stroke} />
        </g>
      )}
    </svg>
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
        className="absolute left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/80 px-2 py-0.5 text-[11px] font-bold text-zinc-50 ring-1 ring-zinc-700/70 drop-shadow-lg"
        style={{ bottom: -22 }}
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
    targets?: FrameTarget[];
    fx?: {
      template?: string;
      color?: string | null;
      color_2?: string | null;
      intensity?: number;
      fullscreen?: boolean;
      role?: string;
    };
  };
  const tmpl = f.fx?.template ?? "dash_strike";
  const color = f.fx?.color ?? "#ffffff";
  const color2 = f.fx?.color_2 ?? color;
  const actorPos = posOf(f.actor ?? "boss", participants);
  const targetIsBoss = f.target === "boss";

  // ★ targets[] 가 여러 개 → 동시 임팩트 (AOE / heal_all)
  const targetPositions: { left: string; top: string }[] = [];
  if (Array.isArray(f.targets) && f.targets.length > 1) {
    for (const t of f.targets) {
      if (!t.target) continue;
      if (t.target === "boss") targetPositions.push(POS.boss);
      else if (t.target.startsWith("slot")) targetPositions.push(posOf(t.target, participants));
    }
  }

  // 단일 타겟 (기본)
  const targetPos =
    targetIsBoss
      ? POS.boss
      : f.target === "all_allies" && targetPositions.length === 0
      ? POS.boss
      : f.target
      ? posOf(f.target, participants)
      : POS.boss;

  // Ultimate fullscreen burst — 위에 따로 깐다
  const ultimateOverlay = f.fx?.fullscreen ? (
    <UltimateBurstFx
      key={`ult-${frame.t}`}
      actor={actorPos}
      color={color}
      color2={color2}
      role={(f.fx?.role as never) ?? "boss"}
    />
  ) : null;

  // 메인 이펙트 — 타겟 여러 개면 각자 동시 렌더
  const renderOne = (tp: { left: string; top: string }, suffix: string) => {
    const k = `${frame.t}-${suffix}`;
    switch (tmpl) {
      case "beam_ray":
        return <BeamRayFx key={k} from={actorPos} to={tp} color={color} color2={color2} />;
      case "summon_above":
        return <SummonAboveFx key={k} target={tp} color={color} color2={color2} />;
      case "aoe_wave":
        return <AoeWaveFx key={k} origin={actorPos} color={color} color2={color2} />;
      case "floor_eruption":
        return <FloorEruptionFx key={k} target={tp} color={color} />;
      case "aura_buff":
        return <AuraBuffFx key={k} actor={actorPos} color={color} />;
      case "sparkle_heal":
        return <SparkleHealFx key={k} target={tp} color={color} />;
      case "shadow_swipe":
        return <ShadowSwipeFx key={k} target={tp} color={color} />;
      case "slash_v":
        return <SlashVFx key={k} actor={actorPos} target={tp} color={color} color2={color2} />;
      case "multi_strike":
        return <MultiStrikeFx key={k} actor={actorPos} target={tp} color={color} color2={color2} />;
      case "ultimate_burst":
        // ult 자체는 위 overlay 에서 처리 — base hit 은 slash_v 로 표현
        return <SlashVFx key={k} actor={actorPos} target={tp} color={color} color2={color2} big />;
      case "dash_strike":
      default:
        return <DashStrikeFx key={k} target={tp} color={color} />;
    }
  };

  return (
    <>
      {ultimateOverlay}
      {targetPositions.length > 1
        ? targetPositions.map((tp, i) => renderOne(tp, `t${i}`))
        : renderOne(targetPos, "0")}
    </>
  );
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
      {/* 시전자 차징 (출발점 발광) */}
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: from.left,
          top: from.top,
          background: `radial-gradient(circle, #ffffff 0%, ${color2} 35%, transparent 70%)`,
          boxShadow: `0 0 60px ${color2}, 0 0 120px ${color}`,
        }}
        initial={{ width: 0, height: 0, opacity: 0 }}
        animate={{
          width: [0, 100, 60, 0],
          height: [0, 100, 60, 0],
          opacity: [0, 1, 1, 0],
        }}
        transition={{ duration: 1.6, times: [0, 0.2, 0.4, 1] }}
      />
      {/* 광선 본체: from 에서 to 까지 SVG line */}
      <svg className="absolute inset-0 h-full w-full">
        <defs>
          <filter id="beamGlow">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <filter id="beamGlowSoft">
            <feGaussianBlur stdDeviation="12" />
          </filter>
        </defs>
        {/* 외곽 글로우 (가장 흐림) */}
        <motion.line
          x1={from.left}
          y1={from.top}
          x2={to.left}
          y2={to.top}
          stroke={color}
          strokeOpacity="0.6"
          strokeWidth="32"
          strokeLinecap="round"
          filter="url(#beamGlowSoft)"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.7, 0.7, 0] }}
          transition={{ duration: 1.4, times: [0, 0.25, 0.7, 1] }}
        />
        {/* 중간 빔 */}
        <motion.line
          x1={from.left}
          y1={from.top}
          x2={to.left}
          y2={to.top}
          stroke={color2}
          strokeWidth="14"
          strokeLinecap="round"
          filter="url(#beamGlow)"
          initial={{ opacity: 0, strokeWidth: 2 }}
          animate={{ opacity: [0, 1, 1, 0], strokeWidth: [2, 20, 16, 4] }}
          transition={{ duration: 1.4, times: [0, 0.2, 0.7, 1] }}
        />
        {/* 코어 (하얀 중심선) */}
        <motion.line
          x1={from.left}
          y1={from.top}
          x2={to.left}
          y2={to.top}
          stroke="#ffffff"
          strokeWidth="5"
          strokeLinecap="round"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{ duration: 1.4, times: [0, 0.2, 0.7, 1] }}
        />
      </svg>
      {/* 타겟 임팩트 폭발 (3중 레이어) */}
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: to.left,
          top: to.top,
          background: `radial-gradient(circle, #ffffff 0%, ${color2} 35%, ${color}aa 60%, transparent 80%)`,
          boxShadow: `0 0 80px ${color}, 0 0 160px ${color}`,
        }}
        initial={{ width: 0, height: 0, opacity: 0 }}
        animate={{ width: [0, 240, 180], height: [0, 240, 180], opacity: [0, 1, 0] }}
        transition={{ duration: 1.4, times: [0, 0.4, 1] }}
      />
      {/* 임팩트 후속 충격파 */}
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-4"
        style={{
          left: to.left,
          top: to.top,
          borderColor: color2,
          boxShadow: `0 0 30px ${color2}`,
        }}
        initial={{ width: 30, height: 30, opacity: 0 }}
        animate={{ width: [30, 340], height: [30, 340], opacity: [0, 1, 0] }}
        transition={{ duration: 1.0, delay: 0.35, times: [0, 0.4, 1] }}
      />
      {/* 임팩트 스파크 (8 방향) */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
        <motion.div
          key={deg}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{
            left: to.left,
            top: to.top,
            width: 4,
            height: 60,
            background: `linear-gradient(to bottom, ${color2}, transparent)`,
            transform: `rotate(${deg}deg)`,
            transformOrigin: "top center",
            boxShadow: `0 0 8px ${color2}`,
          }}
          initial={{ opacity: 0, scaleY: 0 }}
          animate={{ opacity: [0, 1, 0], scaleY: [0, 1.5, 0.5] }}
          transition={{ duration: 0.8, delay: 0.4 }}
        />
      ))}
    </div>
  );
}

// — 돌진 슬래시 —
function DashStrikeFx({ target, color }: { target: { left: string; top: string }; color: string }) {
  // 3 슬래시 각도
  const slashAngles = [-35, 35, -10];
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {/* 슬래시 모음 */}
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{ left: target.left, top: target.top }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{ duration: 1.0, times: [0, 0.2, 0.7, 1] }}
      >
        {slashAngles.map((deg, i) => (
          <motion.div
            key={i}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{
              width: 220,
              height: 16,
              background: `linear-gradient(90deg, transparent 0%, ${color}aa 20%, #ffffff 50%, ${color}aa 80%, transparent 100%)`,
              boxShadow: `0 0 30px ${color}, 0 0 60px ${color}, 0 0 90px ${color}`,
              transform: `rotate(${deg}deg)`,
              filter: "blur(0.5px)",
              borderRadius: 999,
            }}
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: [0, 1.1, 1], opacity: [0, 1, 0.9] }}
            transition={{ duration: 0.35, delay: 0.08 + i * 0.13, ease: "easeOut" }}
          />
        ))}
      </motion.div>
      {/* 임팩트 플래시 (큼지막) */}
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: target.left,
          top: target.top,
          background: `radial-gradient(circle, #ffffff 0%, ${color} 40%, ${color}66 70%, transparent 100%)`,
          boxShadow: `0 0 50px ${color}, 0 0 100px ${color}`,
        }}
        initial={{ width: 0, height: 0, opacity: 0 }}
        animate={{ width: [0, 180, 100], height: [0, 180, 100], opacity: [0, 1, 0] }}
        transition={{ duration: 0.85, delay: 0.3 }}
      />
      {/* 충격파 ring */}
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-[6px]"
        style={{
          left: target.left,
          top: target.top,
          borderColor: color,
          boxShadow: `0 0 25px ${color}`,
        }}
        initial={{ width: 20, height: 20, opacity: 0 }}
        animate={{ width: [20, 260], height: [20, 260], opacity: [0, 1, 0] }}
        transition={{ duration: 0.9, delay: 0.35 }}
      />
      {/* 파편 입자 */}
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <motion.div
          key={deg}
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: target.left,
            top: target.top,
            width: 10,
            height: 10,
            background: `radial-gradient(circle, #ffffff, ${color})`,
            boxShadow: `0 0 12px ${color}`,
          }}
          initial={{ x: 0, y: 0, opacity: 0 }}
          animate={{
            x: Math.cos((deg * Math.PI) / 180) * 90,
            y: Math.sin((deg * Math.PI) / 180) * 90,
            opacity: [0, 1, 0],
            scale: [0.5, 1.5, 0.3],
          }}
          transition={{ duration: 0.9, delay: 0.4, ease: "easeOut" }}
        />
      ))}
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
      {/* 떨어지는 오브 (꼬리 효과) */}
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: target.left,
          top: target.top,
          width: 110,
          height: 110,
          background: `radial-gradient(circle, #ffffff 0%, ${color2} 30%, ${color} 60%, transparent 100%)`,
          boxShadow: `0 0 70px ${color}, 0 0 140px ${color}, inset 0 0 40px ${color2}`,
        }}
        initial={{ y: -400, scale: 0.4, opacity: 0 }}
        animate={{ y: [-400, 0, 0], scale: [0.4, 1.4, 1.1], opacity: [0, 1, 1, 0] }}
        transition={{ duration: 1.4, times: [0, 0.55, 0.7, 1] }}
      />
      {/* 꼬리 streak */}
      <motion.div
        className="absolute -translate-x-1/2"
        style={{
          left: target.left,
          top: `calc(${target.top} - 200px)`,
          width: 30,
          height: 220,
          background: `linear-gradient(to bottom, transparent 0%, ${color}88 60%, ${color2} 100%)`,
          filter: "blur(8px)",
          borderRadius: 999,
        }}
        initial={{ y: -300, opacity: 0, scaleY: 0.3 }}
        animate={{ y: [-300, 0, 0], opacity: [0, 1, 0], scaleY: [0.3, 1.2, 0.5] }}
        transition={{ duration: 1.2, times: [0, 0.55, 0.9] }}
      />
      {/* 임팩트 폭발 (3중) */}
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: target.left,
          top: target.top,
          background: `radial-gradient(circle, #ffffff 0%, ${color2} 25%, ${color}aa 55%, transparent 80%)`,
          boxShadow: `0 0 80px ${color}, 0 0 160px ${color}`,
        }}
        initial={{ width: 0, height: 0, opacity: 0 }}
        animate={{ width: [0, 320, 240], height: [0, 320, 240], opacity: [0, 1, 0] }}
        transition={{ duration: 1.1, delay: 0.55 }}
      />
      {/* 충격파 ring 2개 */}
      {[0, 0.15].map((delay, i) => (
        <motion.div
          key={i}
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-[6px]"
          style={{
            left: target.left,
            top: target.top,
            borderColor: i === 0 ? color2 : color,
            boxShadow: `0 0 40px ${color}`,
          }}
          initial={{ width: 40, height: 40, opacity: 0 }}
          animate={{ width: [40, 420], height: [40, 420], opacity: [0, 1, 0] }}
          transition={{ duration: 1.2, delay: 0.55 + delay }}
        />
      ))}
      {/* 폭발 파편 (12 방향) */}
      {Array.from({ length: 12 }).map((_, i) => {
        const deg = (i * 360) / 12;
        const dist = 80 + Math.random() * 40;
        return (
          <motion.div
            key={i}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: target.left,
              top: target.top,
              width: 14,
              height: 14,
              background: `radial-gradient(circle, #ffffff, ${color})`,
              boxShadow: `0 0 14px ${color2}`,
            }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
            animate={{
              x: Math.cos((deg * Math.PI) / 180) * dist,
              y: Math.sin((deg * Math.PI) / 180) * dist,
              opacity: [0, 1, 0],
              scale: [0.4, 1.6, 0.2],
            }}
            transition={{ duration: 1.0, delay: 0.6, ease: "easeOut" }}
          />
        );
      })}
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
      {/* 화면 전체 vignette flash */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at ${origin.left} ${origin.top}, transparent 10%, ${color}33 60%, ${color}88 100%)`,
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.9, 0] }}
        transition={{ duration: 1.6 }}
      />
      {/* 다중 ripple (5개) */}
      {[0, 0.12, 0.24, 0.36, 0.5].map((delay, i) => (
        <motion.div
          key={i}
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: origin.left,
            top: origin.top,
            borderWidth: 8,
            borderStyle: "solid",
            borderColor: i % 2 === 0 ? color : color2,
            boxShadow: `0 0 50px ${color}, inset 0 0 50px ${color2}`,
            filter: "blur(1px)",
          }}
          initial={{ width: 40, height: 40, opacity: 0 }}
          animate={{ width: [40, 900], height: [40, 900], opacity: [0, 1, 0] }}
          transition={{ duration: 1.8, delay, times: [0, 0.3, 1], ease: "easeOut" }}
        />
      ))}
      {/* 회전 토네이도 (큼지막) */}
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{ left: origin.left, top: origin.top }}
        animate={{ rotate: 720 }}
        transition={{ duration: 1.6, ease: "linear" }}
      >
        <motion.div
          className="rounded-full"
          style={{
            width: 220,
            height: 220,
            background: `conic-gradient(${color}, transparent, ${color2}, transparent, ${color}, transparent, ${color2}, transparent, ${color})`,
            filter: "blur(8px)",
          }}
          initial={{ opacity: 0, scale: 0.2 }}
          animate={{ opacity: [0, 1, 0.7, 0], scale: [0.2, 1.6, 2.2, 2.6] }}
          transition={{ duration: 1.6 }}
        />
      </motion.div>
      {/* 코어 폭발 (백색) */}
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: origin.left,
          top: origin.top,
          background: `radial-gradient(circle, #ffffff 0%, ${color2}aa 30%, ${color}aa 60%, transparent 90%)`,
          boxShadow: `0 0 80px ${color}, 0 0 160px ${color}`,
        }}
        initial={{ width: 0, height: 0, opacity: 0 }}
        animate={{
          width: [0, 280, 320],
          height: [0, 280, 320],
          opacity: [0, 1, 0],
        }}
        transition={{ duration: 0.9 }}
      />
      {/* 외곽 파편 (16 방향) */}
      {Array.from({ length: 16 }).map((_, i) => {
        const deg = (i * 360) / 16;
        return (
          <motion.div
            key={i}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: origin.left,
              top: origin.top,
              width: 12,
              height: 12,
              background: `radial-gradient(circle, #ffffff, ${color2})`,
              boxShadow: `0 0 14px ${color}`,
            }}
            initial={{ x: 0, y: 0, opacity: 0 }}
            animate={{
              x: Math.cos((deg * Math.PI) / 180) * (180 + (i % 3) * 30),
              y: Math.sin((deg * Math.PI) / 180) * (180 + (i % 3) * 30),
              opacity: [0, 1, 0],
              scale: [0.4, 1.4, 0.2],
            }}
            transition={{ duration: 1.4, delay: 0.2, ease: "easeOut" }}
          />
        );
      })}
    </div>
  );
}

// — 바닥에서 솟구치는 기둥 —
function FloorEruptionFx({ target, color }: { target: { left: string; top: string }; color: string }) {
  // 3 개 기둥 (중앙 큰 거 + 좌우 작은 거)
  const columns = [
    { offset: 0, w: 130, h: 320, delay: 0 },
    { offset: -80, w: 70, h: 220, delay: 0.1 },
    { offset: 80, w: 70, h: 220, delay: 0.15 },
  ];
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {/* 메인 + 보조 기둥 */}
      {columns.map((c, i) => (
        <motion.div
          key={i}
          className="absolute -translate-x-1/2 -translate-y-full"
          style={{
            left: `calc(${target.left} + ${c.offset}px)`,
            top: `calc(${target.top} + 50px)`,
            width: c.w,
            background: `linear-gradient(to top, #ffffff 0%, ${color} 30%, ${color}aa 70%, transparent 100%)`,
            boxShadow: `0 0 50px ${color}, 0 0 100px ${color}`,
            borderRadius: 999,
            filter: "blur(0.5px)",
          }}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: [0, c.h, c.h, 0], opacity: [0, 1, 0.9, 0] }}
          transition={{ duration: 1.3, delay: c.delay, times: [0, 0.25, 0.7, 1] }}
        />
      ))}
      {/* 바닥 균열 ring */}
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: target.left,
          top: `calc(${target.top} + 30px)`,
          background: `radial-gradient(ellipse, ${color}aa 0%, ${color}66 40%, transparent 70%)`,
          boxShadow: `0 0 50px ${color}`,
        }}
        initial={{ width: 0, height: 0, opacity: 0 }}
        animate={{ width: [0, 240], height: [0, 60], opacity: [0, 1, 0] }}
        transition={{ duration: 1.0 }}
      />
      {/* 위로 튀는 입자 */}
      {Array.from({ length: 10 }).map((_, i) => {
        const x = (Math.random() - 0.5) * 160;
        const y = -120 - Math.random() * 100;
        return (
          <motion.div
            key={i}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: target.left,
              top: `calc(${target.top} + 30px)`,
              width: 8,
              height: 8,
              background: `radial-gradient(circle, #ffffff, ${color})`,
              boxShadow: `0 0 10px ${color}`,
            }}
            initial={{ x: 0, y: 0, opacity: 0 }}
            animate={{ x, y, opacity: [0, 1, 0], scale: [0.5, 1.2, 0.4] }}
            transition={{ duration: 1.2, delay: 0.15 + i * 0.04, ease: "easeOut" }}
          />
        );
      })}
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
        animate={{ rotate: 540 }}
        transition={{ duration: 1.6, ease: "linear" }}
      >
        {/* 회전 ring 1 (안쪽, 두꺼운 dashed) */}
        <motion.div
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-[6px] border-dashed"
          style={{
            width: 160,
            height: 160,
            borderColor: color,
            boxShadow: `0 0 40px ${color}, inset 0 0 40px ${color}`,
          }}
          initial={{ opacity: 0, scale: 0.3 }}
          animate={{ opacity: [0, 1, 1, 0], scale: [0.3, 1, 1.3, 1.5] }}
          transition={{ duration: 1.6, times: [0, 0.2, 0.7, 1] }}
        />
        {/* 회전 ring 2 (역회전, 큼) */}
        <motion.div
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-[4px]"
          style={{
            width: 220,
            height: 220,
            borderColor: color,
            boxShadow: `0 0 30px ${color}`,
          }}
          animate={{ rotate: -900 }}
          transition={{ duration: 1.6, ease: "linear" }}
          initial={{ opacity: 0 }}
        />
        {/* 회전 ring 3 (가장 바깥) */}
        <motion.div
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-[2px] border-dotted"
          style={{
            width: 290,
            height: 290,
            borderColor: color,
            boxShadow: `0 0 20px ${color}`,
          }}
          animate={{ rotate: 1080 }}
          transition={{ duration: 1.6, ease: "linear" }}
          initial={{ opacity: 0 }}
        />
      </motion.div>
      {/* 위로 떠오르는 빛 줄기 (6 개) */}
      {[-60, -36, -12, 12, 36, 60].map((offset, i) => (
        <motion.div
          key={i}
          className="absolute -translate-x-1/2"
          style={{
            left: `calc(${actor.left} + ${offset}px)`,
            top: actor.top,
            width: 6,
            height: 80,
            background: `linear-gradient(to top, ${color}, transparent)`,
            boxShadow: `0 0 14px ${color}`,
            borderRadius: 999,
          }}
          initial={{ y: 40, opacity: 0, scaleY: 0.3 }}
          animate={{ y: -80, opacity: [0, 1, 0], scaleY: [0.3, 1.2, 0.8] }}
          transition={{ duration: 1.2, delay: i * 0.06, ease: "easeOut" }}
        />
      ))}
      {/* 중앙 글로우 */}
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: actor.left,
          top: actor.top,
          background: `radial-gradient(circle, ${color}cc 0%, ${color}55 40%, transparent 80%)`,
          boxShadow: `0 0 60px ${color}`,
        }}
        initial={{ width: 40, height: 40, opacity: 0 }}
        animate={{
          width: [40, 220, 160],
          height: [40, 220, 160],
          opacity: [0, 0.9, 0],
        }}
        transition={{ duration: 1.6 }}
      />
    </div>
  );
}

// — 회복 반짝이 (sparkle) —
function SparkleHealFx({ target, color }: { target: { left: string; top: string }; color: string }) {
  // 16개 sparkle 무작위 위치
  const sparkleCount = 16;
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {Array.from({ length: sparkleCount }).map((_, i) => {
        const angle = (i * 360) / sparkleCount;
        const radius = 30 + ((i * 17) % 50);
        const offsetX = Math.cos((angle * Math.PI) / 180) * radius;
        const offsetY = Math.sin((angle * Math.PI) / 180) * radius * 0.6;
        const delay = (i * 0.04);
        return (
          <motion.div
            key={i}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `calc(${target.left} + ${offsetX}px)`,
              top: `calc(${target.top} + ${offsetY}px)`,
            }}
            initial={{ y: 40, opacity: 0, scale: 0, rotate: 0 }}
            animate={{ y: -80, opacity: [0, 1, 0], scale: [0, 1.6, 0.4], rotate: 180 }}
            transition={{ duration: 1.3, delay, ease: "easeOut" }}
          >
            {/* 4-point star shape via crossed rects */}
            <div className="relative" style={{ width: 22, height: 22 }}>
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: `radial-gradient(circle, #ffffff, ${color})`,
                  borderRadius: "50%",
                  boxShadow: `0 0 18px ${color}, 0 0 32px ${color}`,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: 36,
                  height: 3,
                  background: `linear-gradient(90deg, transparent, ${color}, #ffffff, ${color}, transparent)`,
                  transform: "translate(-50%, -50%)",
                  boxShadow: `0 0 8px ${color}`,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: 3,
                  height: 36,
                  background: `linear-gradient(180deg, transparent, ${color}, #ffffff, ${color}, transparent)`,
                  transform: "translate(-50%, -50%)",
                  boxShadow: `0 0 8px ${color}`,
                }}
              />
            </div>
          </motion.div>
        );
      })}
      {/* 회복 ring (위로 상승) */}
      {[0, 0.2, 0.4].map((delay, i) => (
        <motion.div
          key={i}
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px]"
          style={{
            left: target.left,
            top: target.top,
            borderColor: color,
            boxShadow: `0 0 22px ${color}, inset 0 0 16px ${color}`,
          }}
          initial={{ width: 30, height: 30, y: 30, opacity: 0 }}
          animate={{
            width: [30, 180],
            height: [30, 180],
            y: [30, -40],
            opacity: [0, 0.9, 0],
          }}
          transition={{ duration: 1.4, delay, ease: "easeOut" }}
        />
      ))}
      {/* 중앙 회복 글로우 (큼지막) */}
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: target.left,
          top: target.top,
          background: `radial-gradient(circle, #ffffff 0%, ${color}aa 35%, transparent 70%)`,
          boxShadow: `0 0 80px ${color}`,
        }}
        initial={{ width: 0, height: 0, opacity: 0 }}
        animate={{ width: [0, 200, 140], height: [0, 200, 140], opacity: [0, 0.9, 0] }}
        transition={{ duration: 1.2 }}
      />
      {/* "+" 십자 회복 표식 */}
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{
          left: target.left,
          top: `calc(${target.top} - 40px)`,
        }}
        initial={{ opacity: 0, scale: 0.3, y: 20 }}
        animate={{ opacity: [0, 1, 0], scale: [0.3, 1.5, 1.2], y: [20, -30, -60] }}
        transition={{ duration: 1.4 }}
      >
        <div
          className="text-4xl font-black"
          style={{
            color,
            textShadow: `0 0 18px ${color}, 0 0 32px ${color}, 0 2px 4px rgba(0,0,0,0.8)`,
          }}
        >
          +
        </div>
      </motion.div>
    </div>
  );
}

// — 어둠 슬래시 (shadow_swipe) —
function ShadowSwipeFx({ target, color }: { target: { left: string; top: string }; color: string }) {
  // 3 슬래시 (-30°, 15°, -5°)
  const slashes = [
    { deg: -30, w: 320, delay: 0.05 },
    { deg: 20, w: 280, delay: 0.18 },
    { deg: -5, w: 340, delay: 0.32 },
  ];
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {/* 어둠 vignette */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at ${target.left} ${target.top}, transparent 15%, ${color}33 40%, #000000aa 100%)`,
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.9, 0] }}
        transition={{ duration: 1.2 }}
      />
      {/* 다중 대각선 슬래시 */}
      {slashes.map((s, i) => (
        <motion.div
          key={i}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{
            left: target.left,
            top: target.top,
            width: s.w,
            height: 22,
            background: `linear-gradient(90deg, transparent 0%, ${color}aa 15%, #000000 35%, #ffffff 50%, #000000 65%, ${color}aa 85%, transparent 100%)`,
            boxShadow: `0 0 40px ${color}, 0 0 80px ${color}, 0 0 120px #000000`,
            transform: `rotate(${s.deg}deg)`,
            filter: "blur(1.5px)",
            borderRadius: 999,
          }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: [0, 1.3, 1], opacity: [0, 1, 0] }}
          transition={{ duration: 0.85, delay: s.delay, times: [0, 0.3, 1] }}
        />
      ))}
      {/* 어둠 잔영 (큼지막) */}
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: target.left,
          top: target.top,
          background: `radial-gradient(circle, ${color}aa 0%, ${color}44 30%, #000000cc 60%, transparent 100%)`,
          boxShadow: `0 0 60px ${color}, 0 0 120px #000000`,
        }}
        initial={{ width: 0, height: 0, opacity: 0 }}
        animate={{ width: [0, 260, 200], height: [0, 260, 200], opacity: [0, 1, 0] }}
        transition={{ duration: 1.2 }}
      />
      {/* 검은 안개 입자 */}
      {Array.from({ length: 10 }).map((_, i) => {
        const deg = (i * 360) / 10;
        return (
          <motion.div
            key={i}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: target.left,
              top: target.top,
              width: 24,
              height: 24,
              background: `radial-gradient(circle, ${color}cc 0%, #000000 70%)`,
              filter: "blur(6px)",
            }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.5 }}
            animate={{
              x: Math.cos((deg * Math.PI) / 180) * 110,
              y: Math.sin((deg * Math.PI) / 180) * 110,
              opacity: [0, 1, 0],
              scale: [0.5, 1.6, 0.3],
            }}
            transition={{ duration: 1.3, delay: 0.35, ease: "easeOut" }}
          />
        );
      })}
    </div>
  );
}

// — V-자 슬래시 (SVG path) — 비원형, 검 휘둘림 같은 곡선 —
function SlashVFx({
  actor,
  target,
  color,
  color2,
  big = false,
}: {
  actor: { left: string; top: string };
  target: { left: string; top: string };
  color: string;
  color2: string;
  big?: boolean;
}) {
  // SVG 좌표 계산: actor와 target의 percent을 SVG 비례로 변환
  // 컨테이너 100% 기준 → viewBox 100×100
  const ax = parseFloat(actor.left);
  const ay = parseFloat(actor.top);
  const tx = parseFloat(target.left);
  const ty = parseFloat(target.top);
  // V 슬래시 path: actor 위→ target 우상→ target 좌하→ actor 위 (curved)
  // 단순화: 두 개 곡선 (\\ 와 //)
  const r = big ? 20 : 12;
  const cx = tx;
  const cy = ty;
  const path1 = `M ${cx - r} ${cy - r} Q ${cx} ${cy - r * 1.4} ${cx + r} ${cy - r * 0.4} Q ${cx + r * 0.3} ${cy + r * 0.2} ${cx + r * 0.4} ${cy + r}`;
  const path2 = `M ${cx + r} ${cy - r} Q ${cx} ${cy - r * 1.4} ${cx - r} ${cy - r * 0.4} Q ${cx - r * 0.3} ${cy + r * 0.2} ${cx - r * 0.4} ${cy + r}`;
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          <filter id={`slashGlow-${color.replace("#", "")}-${big}`}>
            <feGaussianBlur stdDeviation={big ? "1.2" : "0.6"} />
          </filter>
        </defs>
        {/* 외곽 글로우 */}
        <motion.path
          d={path1}
          fill="none"
          stroke={color}
          strokeWidth={big ? 3.5 : 2.2}
          strokeLinecap="round"
          filter={`url(#slashGlow-${color.replace("#", "")}-${big})`}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: [0, 1, 1], opacity: [0, 1, 0] }}
          transition={{ duration: 0.6, times: [0, 0.4, 1], ease: "easeOut" }}
        />
        <motion.path
          d={path2}
          fill="none"
          stroke={color}
          strokeWidth={big ? 3.5 : 2.2}
          strokeLinecap="round"
          filter={`url(#slashGlow-${color.replace("#", "")}-${big})`}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: [0, 1, 1], opacity: [0, 1, 0] }}
          transition={{ duration: 0.6, delay: 0.15, times: [0, 0.4, 1], ease: "easeOut" }}
        />
        {/* 코어 (하얀 중심) */}
        <motion.path
          d={path1}
          fill="none"
          stroke={color2}
          strokeWidth={big ? 1.4 : 0.9}
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: [0, 1, 1], opacity: [0, 1, 0] }}
          transition={{ duration: 0.6, times: [0, 0.4, 1] }}
        />
        <motion.path
          d={path2}
          fill="none"
          stroke={color2}
          strokeWidth={big ? 1.4 : 0.9}
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: [0, 1, 1], opacity: [0, 1, 0] }}
          transition={{ duration: 0.6, delay: 0.15, times: [0, 0.4, 1] }}
        />
        {/* 시전자 → 타겟 잔상 streak */}
        <motion.line
          x1={ax}
          y1={ay}
          x2={tx}
          y2={ty}
          stroke={color}
          strokeOpacity="0.7"
          strokeWidth={big ? 1.4 : 0.8}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.7, 0] }}
          transition={{ duration: 0.35 }}
        />
      </svg>
      {/* 임팩트 — 작은 비원형 빛 폭발 (4-point 별 모양) */}
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{ left: target.left, top: target.top }}
        initial={{ opacity: 0, scale: 0.3, rotate: 0 }}
        animate={{ opacity: [0, 1, 0], scale: [0.3, big ? 2.2 : 1.4, big ? 2.6 : 1.6], rotate: 45 }}
        transition={{ duration: 0.6, delay: 0.3 }}
      >
        <svg width={big ? 200 : 120} height={big ? 200 : 120} viewBox="-50 -50 100 100">
          <polygon
            points="0,-50 12,-12 50,0 12,12 0,50 -12,12 -50,0 -12,-12"
            fill={color2}
            opacity="0.95"
            style={{ filter: `drop-shadow(0 0 16px ${color})` }}
          />
          <polygon
            points="0,-30 8,-8 30,0 8,8 0,30 -8,8 -30,0 -8,-8"
            fill="#ffffff"
          />
        </svg>
      </motion.div>
    </div>
  );
}

// — 연타 (multi_strike) — 빠른 가로 슬래시 4-5번 staggered —
function MultiStrikeFx({
  actor,
  target,
  color,
  color2,
}: {
  actor: { left: string; top: string };
  target: { left: string; top: string };
  color: string;
  color2: string;
}) {
  const hits = 5;
  const ax = parseFloat(actor.left);
  const ay = parseFloat(actor.top);
  const tx = parseFloat(target.left);
  const ty = parseFloat(target.top);
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <defs>
          <filter id="multiGlow">
            <feGaussianBlur stdDeviation="0.7" />
          </filter>
        </defs>
        {/* 시전자 streak (한 번) */}
        <motion.line
          x1={ax}
          y1={ay}
          x2={tx}
          y2={ty}
          stroke={color}
          strokeOpacity="0.5"
          strokeWidth="1.2"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.5, 0] }}
          transition={{ duration: 0.3 }}
        />
        {/* N개 chevron 슬래시 — 각자 다른 각도 */}
        {Array.from({ length: hits }).map((_, i) => {
          const angle = -30 + i * 15;
          const len = 14;
          const ox = Math.cos((angle * Math.PI) / 180) * len;
          const oy = Math.sin((angle * Math.PI) / 180) * len;
          const dy = (i - hits / 2) * 1.5;
          return (
            <motion.line
              key={i}
              x1={tx - ox}
              y1={ty - oy + dy}
              x2={tx + ox}
              y2={ty + oy + dy}
              stroke={color2}
              strokeWidth="2.4"
              strokeLinecap="round"
              filter="url(#multiGlow)"
              initial={{ opacity: 0, pathLength: 0 }}
              animate={{ opacity: [0, 1, 0], pathLength: [0, 1, 1] }}
              transition={{ duration: 0.3, delay: i * 0.11 }}
            />
          );
        })}
      </svg>
      {/* N개 임팩트 sparks */}
      {Array.from({ length: hits }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{
            left: target.left,
            top: `calc(${target.top} + ${(i - hits / 2) * 8}px)`,
          }}
          initial={{ opacity: 0, scale: 0.3 }}
          animate={{ opacity: [0, 1, 0], scale: [0.3, 1.2, 0.6] }}
          transition={{ duration: 0.4, delay: i * 0.11 }}
        >
          <svg width="50" height="50" viewBox="-25 -25 50 50">
            <polygon
              points="0,-22 5,-5 22,0 5,5 0,22 -5,5 -22,0 -5,-5"
              fill={color}
              style={{ filter: `drop-shadow(0 0 8px ${color2})` }}
            />
            <circle cx="0" cy="0" r="5" fill="#ffffff" />
          </svg>
        </motion.div>
      ))}
    </div>
  );
}

// — 필살기 fullscreen burst — 화면 전체 dramatic 연출 —
function UltimateBurstFx({
  actor,
  color,
  color2,
  role,
}: {
  actor: { left: string; top: string };
  color: string;
  color2: string;
  role: "tank" | "dealer" | "supporter" | "boss";
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {/* 화면 전체 진동/플래시 */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at ${actor.left} ${actor.top}, ${color2}cc 0%, ${color}66 30%, ${color}33 60%, #000000ee 100%)`,
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.95, 0.6, 0] }}
        transition={{ duration: 2.0, times: [0, 0.2, 0.6, 1] }}
      />
      {/* 흰색 강력 플래시 */}
      <motion.div
        className="absolute inset-0 bg-white"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.8, 0] }}
        transition={{ duration: 0.45, delay: 0.15 }}
      />
      {/* 시전자 위 거대 sigil */}
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{ left: actor.left, top: actor.top }}
        initial={{ opacity: 0, scale: 0.4, rotate: -180 }}
        animate={{ opacity: [0, 1, 0.7, 0], scale: [0.4, 1.6, 2.0, 2.4], rotate: 360 }}
        transition={{ duration: 1.6, times: [0, 0.3, 0.7, 1] }}
      >
        <div style={{ filter: `drop-shadow(0 0 30px ${color}) drop-shadow(0 0 60px ${color})` }}>
          <RoleSigil role={role} size={160} color={color} />
        </div>
      </motion.div>
      {/* 동심 ring storm */}
      {[0, 0.18, 0.36, 0.54].map((delay, i) => (
        <motion.div
          key={i}
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: actor.left,
            top: actor.top,
            borderWidth: 6,
            borderStyle: "solid",
            borderColor: i % 2 === 0 ? color : color2,
            boxShadow: `0 0 60px ${color}, inset 0 0 40px ${color2}`,
          }}
          initial={{ width: 40, height: 40, opacity: 0 }}
          animate={{
            width: [40, 1400],
            height: [40, 1400],
            opacity: [0, 1, 0],
          }}
          transition={{ duration: 2.0, delay, ease: "easeOut" }}
        />
      ))}
      {/* 회전 광선 spokes */}
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{ left: actor.left, top: actor.top }}
        initial={{ rotate: 0 }}
        animate={{ rotate: 720 }}
        transition={{ duration: 2.0, ease: "linear" }}
      >
        {Array.from({ length: 12 }).map((_, i) => {
          const deg = (i * 360) / 12;
          return (
            <motion.div
              key={i}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{
                width: 6,
                height: 240,
                background: `linear-gradient(to top, transparent, ${color}, ${color2}, ${color}, transparent)`,
                boxShadow: `0 0 18px ${color}, 0 0 30px ${color2}`,
                transform: `rotate(${deg}deg)`,
                transformOrigin: "center",
              }}
              initial={{ opacity: 0, scaleY: 0 }}
              animate={{ opacity: [0, 1, 0.7, 0], scaleY: [0, 1.5, 2.2, 2.8] }}
              transition={{ duration: 1.8, delay: 0.2 }}
            />
          );
        })}
      </motion.div>
      {/* 파티클 storm — 화면 전체 */}
      {Array.from({ length: 24 }).map((_, i) => {
        const deg = (i * 360) / 24;
        const dist = 180 + ((i * 41) % 240);
        return (
          <motion.div
            key={i}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: actor.left,
              top: actor.top,
              width: 18,
              height: 18,
              background: `radial-gradient(circle, #ffffff, ${color2}, ${color})`,
              boxShadow: `0 0 16px ${color2}`,
            }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.3 }}
            animate={{
              x: Math.cos((deg * Math.PI) / 180) * dist,
              y: Math.sin((deg * Math.PI) / 180) * dist,
              opacity: [0, 1, 0],
              scale: [0.3, 2.0, 0.2],
            }}
            transition={{ duration: 1.8, delay: 0.3 + (i % 6) * 0.04, ease: "easeOut" }}
          />
        );
      })}
      {/* ULTIMATE 텍스트 */}
      <motion.div
        className="absolute left-1/2 top-[22%] -translate-x-1/2"
        initial={{ opacity: 0, scale: 0.5, y: 20 }}
        animate={{ opacity: [0, 1, 1, 0], scale: [0.5, 1.3, 1.1, 1.4], y: [20, 0, -10, -30] }}
        transition={{ duration: 1.6, delay: 0.25 }}
      >
        <div
          className="text-3xl font-black tracking-[0.3em]"
          style={{
            color,
            WebkitTextStroke: `2px ${color2}`,
            textShadow: `0 0 30px ${color}, 0 0 60px ${color}, 0 4px 8px rgba(0,0,0,0.95)`,
          }}
        >
          ULTIMATE
        </div>
      </motion.div>
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
    kind?: string;
    fx?: { color?: string | null };
  };
  const name = f.skill_name;
  if (!name) return null;
  const color = f.fx?.color ?? "#ffffff";
  const isBoss = f.actor === "boss";
  const isUltimate = f.kind === "ultimate";

  // 시전자 이름 + 시전자 위치 (banner 위치 결정)
  let casterLabel = "보스";
  const pos = posOf(f.actor ?? "boss", participants);
  let role: "tank" | "dealer" | "supporter" | "boss" = "boss";
  if (!isBoss && f.actor?.startsWith("slot")) {
    const slot = parseInt(f.actor.slice(4), 10);
    const p = participants.find((x) => x.slot === slot);
    if (p) {
      casterLabel = p.starter.nickname;
      role = p.role;
    }
  }

  // 캐릭터 머리 위 배너 (sprite 위쪽 약 56-70px)
  const offsetY = isBoss ? -110 : role === "tank" ? -74 : -58;

  return (
    <AnimatePresence>
      <motion.div
        key={`skill-${frame.t}`}
        className="pointer-events-none absolute z-30 -translate-x-1/2"
        style={{ left: pos.left, top: pos.top }}
        initial={{ opacity: 0, y: offsetY + 8, scale: 0.85 }}
        animate={{ opacity: 1, y: offsetY, scale: 1 }}
        exit={{ opacity: 0, y: offsetY - 6 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
      >
        <div
          className={`relative flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-bold backdrop-blur-md ${
            isUltimate ? "ring-2" : "ring-1"
          }`}
          style={{
            background: `linear-gradient(135deg, ${color}26, #00000080)`,
            borderColor: color,
            boxShadow: `0 0 12px ${color}aa, 0 0 24px ${color}55`,
            ["--tw-ring-color" as never]: color,
          }}
        >
          {/* 시전 화살표 (꼬리) */}
          <div
            className="absolute left-1/2 -translate-x-1/2 -bottom-1 h-2 w-2 rotate-45"
            style={{
              background: `${color}40`,
              borderRight: `1px solid ${color}`,
              borderBottom: `1px solid ${color}`,
            }}
          />
          <RoleSigil role={isBoss ? "boss" : role} size={14} color={color} />
          {isUltimate && (
            <span
              className="rounded-sm px-1 text-[9px] font-black tracking-wider"
              style={{ background: color, color: "#000" }}
            >
              ULT
            </span>
          )}
          <span
            className="text-[11px]"
            style={{ color, textShadow: `0 0 6px ${color}, 0 1px 2px rgba(0,0,0,0.9)` }}
          >
            {name}
          </span>
          <span className="text-[9px] text-zinc-400">{casterLabel}</span>
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
  const isCounter = frame.type === "counter_reflect";
  const targets = (frame as { targets?: FrameTarget[] }).targets;
  const hits = (frame as { hits?: number }).hits;

  // ★ targets[] 가 있으면 각 타겟마다 데미지/회복 표시 (AOE / multi_hit / heal_all)
  if (Array.isArray(targets) && targets.length > 0) {
    return (
      <AnimatePresence>
        {targets.map((t, idx) => {
          if (!t.target) return null;
          let pos: { left: string; top: string } = POS.boss;
          if (t.target === "boss") pos = POS.boss;
          else if (t.target.startsWith("slot")) pos = posOf(t.target, participants);
          const dmg = t.damage;
          const heal = t.heal;
          if (!dmg && !heal) return null;
          let label = "";
          let color = "#ffffff";
          if (heal) {
            label = `+${heal.toLocaleString()}`;
            color = "#34d399";
          } else if (dmg) {
            label = `-${dmg.toLocaleString()}`;
            if (t.crit) color = "#f87171";
            else if (t.resist) color = "#94a3b8";
            else color = "#fde68a";
          }
          // multi_hit 의 경우 hit_index 로 staggered delay
          const delay = typeof t.hit_index === "number" ? (t.hit_index - 1) * 0.12 : idx * 0.04;
          return (
            <motion.div
              key={`dmg-${frame.t}-${idx}`}
              className="pointer-events-none absolute z-40 -translate-x-1/2"
              style={{ left: pos.left, top: pos.top }}
              initial={{ y: 12, opacity: 0, scale: 0.5 }}
              animate={{ y: -70, opacity: 1, scale: t.crit ? 1.6 : 1.15 }}
              exit={{ opacity: 0, y: -100 }}
              transition={{ duration: 1.2, delay, ease: "easeOut" }}
            >
              <div
                className="text-center text-2xl font-black tabular-nums"
                style={{
                  color,
                  textShadow: `0 0 12px ${color}, 0 2px 6px rgba(0,0,0,0.95)`,
                  WebkitTextStroke: "1.2px rgba(0,0,0,0.7)",
                }}
              >
                {label}
              </div>
            </motion.div>
          );
        })}
        {/* multi_hit 카운터 (×N) */}
        {hits && hits > 1 && (
          <motion.div
            key={`hits-${frame.t}`}
            className="pointer-events-none absolute left-1/2 top-[40%] z-40 -translate-x-1/2"
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: [0, 1, 1, 0], scale: [0.4, 1.4, 1.2, 1.6] }}
            transition={{ duration: 1.4 }}
          >
            <div
              className="text-3xl font-black tracking-wider text-amber-300"
              style={{
                textShadow: "0 0 14px #fbbf24, 0 0 28px #f59e0b, 0 2px 6px rgba(0,0,0,0.95)",
              }}
            >
              × {hits} HIT
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  // 단일 타겟 (legacy)
  const damage = (frame as { damage?: number }).damage;
  const heal = (frame as { heal?: number }).heal;
  const target = (frame as { target?: string }).target;
  if (!damage && !heal) return null;
  let pos: { left: string; top: string } = { left: "50%", top: "30%" };
  if (isCounter || target === "boss") pos = POS.boss;
  else if (target?.startsWith("slot")) pos = posOf(target, participants);

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
        animate={{ y: -90, opacity: 1, scale: crit ? 1.8 : weak ? 1.5 : 1.25 }}
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
