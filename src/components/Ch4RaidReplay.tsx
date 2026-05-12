"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  bossSpriteUrl,
  speciesSpriteUrl,
  roleLabel,
  roleColor,
  SPECIES_NAME_KO,
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

interface EntityHp {
  boss: number;
  slots: [number, number, number];
}

/**
 * Phase 2 baseline 재생기 — 프레임 시퀀스 step-through 로 HP 바 + 액션 로그만.
 * Phase 3 에서 fx 템플릿 (dash_strike / beam_ray / aoe_wave 등) 풀 도입.
 */
export default function Ch4RaidReplay({ raid, boss, participants, onBack }: Props) {
  const frames = useMemo<Ch4Frame[]>(
    () => (Array.isArray(raid.replay_data) ? raid.replay_data : []),
    [raid.replay_data]
  );
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);  // 진입 시 자동 재생
  const [speed, setSpeed] = useState<1 | 2 | 4>(1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 슬롯별 최대 HP (battle_start frame 의 참가자 max_hp 에서)
  const maxHps = useMemo(() => {
    const start = frames.find((f) => f.type === "battle_start") as
      | { boss: { max_hp: number }; participants: { slot: number; max_hp: number }[] }
      | undefined;
    if (!start) {
      return {
        boss: boss.base_hp,
        slots: [0, 0, 0] as [number, number, number],
      };
    }
    const slots: [number, number, number] = [0, 0, 0];
    for (const p of start.participants) {
      if (p.slot >= 1 && p.slot <= 3) slots[p.slot - 1] = p.max_hp;
    }
    return { boss: start.boss.max_hp, slots };
  }, [frames, boss.base_hp]);

  // 현재 프레임까지의 HP 상태 누적 계산
  const hpState = useMemo<EntityHp>(() => {
    let bossHp = maxHps.boss;
    const slots: [number, number, number] = [
      maxHps.slots[0],
      maxHps.slots[1],
      maxHps.slots[2],
    ];
    for (let i = 0; i <= idx && i < frames.length; i++) {
      const f = frames[i];
      if ("boss_hp" in f && typeof f.boss_hp === "number") bossHp = f.boss_hp;
      if (f.type === "skill" && f.target?.startsWith("slot") && typeof f.target_hp === "number") {
        const s = parseInt(f.target.slice(4), 10);
        if (s >= 1 && s <= 3) slots[s - 1] = f.target_hp;
      }
      if (
        (f.type === "boss_skill" || f.type === "skill") &&
        f.target?.startsWith("slot") &&
        typeof f.target_hp === "number"
      ) {
        const s = parseInt(f.target.slice(4), 10);
        if (s >= 1 && s <= 3) slots[s - 1] = f.target_hp;
      }
      if (f.type === "turn_end" && f.participants_hp) {
        slots[0] = f.participants_hp[0] ?? slots[0];
        slots[1] = f.participants_hp[1] ?? slots[1];
        slots[2] = f.participants_hp[2] ?? slots[2];
      }
      if (f.type === "battle_end" && f.participants_hp) {
        slots[0] = f.participants_hp[0] ?? slots[0];
        slots[1] = f.participants_hp[1] ?? slots[1];
        slots[2] = f.participants_hp[2] ?? slots[2];
      }
    }
    return { boss: bossHp, slots };
  }, [idx, frames, maxHps]);

  const currentFrame = frames[idx];
  const currentRound = useMemo(() => {
    for (let i = idx; i >= 0; i--) {
      const f = frames[i];
      if (f.type === "turn_start") return f.round;
      if (f.type === "battle_end") return f.final_round;
    }
    return 1;
  }, [idx, frames]);

  // 자동 재생
  useEffect(() => {
    if (!playing || idx >= frames.length - 1) {
      if (timer.current) clearTimeout(timer.current);
      return;
    }
    const delay = 1500 / speed;
    timer.current = setTimeout(() => {
      setIdx((v) => Math.min(v + 1, frames.length - 1));
    }, delay);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [idx, playing, speed, frames.length]);

  useEffect(() => {
    if (idx >= frames.length - 1) setPlaying(false);
  }, [idx, frames.length]);

  if (raid.status === "resolving") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-zinc-300">
        <div className="text-center">
          <div className="mb-2 text-xl font-bold text-purple-400">
            전투 시뮬레이션 중...
          </div>
          <div className="text-sm text-zinc-500">
            결과가 곧 표시됩니다
          </div>
        </div>
      </div>
    );
  }

  const ended = idx >= frames.length - 1;
  const isWin = raid.result === "win";

  return (
    <div className="mx-auto w-full max-w-4xl px-3 py-5">
      {/* 상단: 보스 + 라운드 + 결과 */}
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm text-zinc-400">
          STAGE {boss.stage_order} · {boss.name}
        </div>
        <div className="font-mono text-sm text-zinc-300">
          Round {currentRound} / {raid.total_turns ?? "?"}
        </div>
      </div>

      {/* 배틀 무대 (3 슬롯 좌측 + 보스 우측) */}
      <div className="mb-4 grid grid-cols-12 gap-3 rounded-2xl border border-zinc-800 bg-gradient-to-b from-purple-950/30 via-zinc-950 to-zinc-950 p-4">
        {/* 좌측: 3 슬롯 */}
        <div className="col-span-5 space-y-3">
          {[1, 2, 3].map((s) => {
            const p = participants.find((x) => x.slot === s);
            const max = maxHps.slots[s - 1];
            const hp = hpState.slots[s - 1];
            const pct = max > 0 ? Math.max(0, (hp / max) * 100) : 0;
            const dead = hp <= 0;
            return (
              <div
                key={s}
                className={`rounded-lg border p-2 transition ${
                  dead
                    ? "border-zinc-900 bg-black/50 opacity-40"
                    : "border-zinc-800 bg-zinc-950/70"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="h-12 w-12 shrink-0" style={{ imageRendering: "pixelated" }}>
                    {p ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={speciesSpriteUrl(p.starter.species, p.starter.evolution_stage)}
                        alt={p.starter.species}
                        className="h-full w-full object-contain"
                        style={{ imageRendering: "pixelated" }}
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      {p && (
                        <span className={`text-[10px] font-bold ${roleColor(p.role)}`}>
                          {roleLabel(p.role)}
                        </span>
                      )}
                      <span className="truncate text-xs text-zinc-300">
                        {p?.starter.nickname ?? "—"}
                      </span>
                    </div>
                    <div className="truncate text-[10px] text-zinc-500">
                      {p && (SPECIES_NAME_KO[p.starter.species] ?? p.starter.species)}{" "}
                      Lv.{p?.starter.level}
                    </div>
                  </div>
                </div>
                <HpBar pct={pct} hp={hp} max={max} variant="ally" />
              </div>
            );
          })}
        </div>

        {/* 우측: 보스 */}
        <div className="col-span-7 flex flex-col items-center">
          <div
            className="relative h-44 w-44 md:h-56 md:w-56"
            style={{ imageRendering: "pixelated" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={bossSpriteUrl(boss.sprite_key)}
              alt={boss.name}
              className={`h-full w-full object-contain transition ${
                hpState.boss === 0 ? "opacity-30 grayscale" : ""
              }`}
              style={{ imageRendering: "pixelated" }}
            />
          </div>
          <div className="mt-2 w-full max-w-sm">
            <div className="mb-1 text-center text-xs font-bold text-purple-200">
              {boss.name}
            </div>
            <HpBar
              pct={maxHps.boss > 0 ? Math.max(0, (hpState.boss / maxHps.boss) * 100) : 0}
              hp={hpState.boss}
              max={maxHps.boss}
              variant="boss"
            />
          </div>
        </div>
      </div>

      {/* 액션 로그 (현재 프레임) */}
      <div className="mb-3 min-h-[56px] rounded-xl border border-zinc-800 bg-zinc-950/70 p-3 text-sm">
        <FrameLabel frame={currentFrame} />
      </div>

      {/* 컨트롤 */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIdx(0)}
          className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
          aria-label="처음으로"
        >
          ⏮
        </button>
        <button
          type="button"
          onClick={() => setIdx((v) => Math.max(0, v - 1))}
          className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
        >
          ◀
        </button>
        <button
          type="button"
          onClick={() => setPlaying((v) => !v)}
          disabled={ended}
          className="flex-1 rounded-lg bg-purple-600 px-4 py-2 font-bold text-white shadow shadow-purple-900/30 hover:bg-purple-500 disabled:opacity-40"
        >
          {playing ? "❚❚ 일시정지" : ended ? "재생 완료" : "▶ 재생"}
        </button>
        <button
          type="button"
          onClick={() => setIdx((v) => Math.min(frames.length - 1, v + 1))}
          className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
        >
          ▶
        </button>
        <button
          type="button"
          onClick={() => setSpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1))}
          className="rounded-lg bg-zinc-800 px-3 py-2 text-sm font-mono text-zinc-200 hover:bg-zinc-700"
        >
          ×{speed}
        </button>
      </div>

      {/* 진행률 */}
      <input
        type="range"
        min={0}
        max={Math.max(0, frames.length - 1)}
        value={idx}
        onChange={(e) => setIdx(parseInt(e.target.value, 10))}
        className="mt-3 w-full accent-purple-500"
      />
      <div className="mt-1 text-center font-mono text-[11px] text-zinc-500">
        프레임 {idx + 1} / {frames.length}
      </div>

      {/* 결과 + 뒤로 */}
      {ended && raid.result && (
        <div
          className={`mt-4 rounded-2xl border-2 p-5 text-center ${
            isWin
              ? "border-emerald-700 bg-emerald-950/30"
              : "border-red-900 bg-red-950/30"
          }`}
        >
          <div
            className={`text-3xl font-extrabold ${
              isWin ? "text-emerald-300" : "text-red-300"
            }`}
          >
            {isWin ? "VICTORY" : "DEFEAT"}
          </div>
          <div className="mt-1 text-sm text-zinc-400">
            {raid.total_turns} 라운드 · {boss.name}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onBack}
        className="mt-4 w-full rounded-xl bg-zinc-800 py-3 font-bold text-zinc-200 hover:bg-zinc-700"
      >
        체육관으로 돌아가기
      </button>
    </div>
  );
}

function HpBar({
  pct,
  hp,
  max,
  variant,
}: {
  pct: number;
  hp: number;
  max: number;
  variant: "ally" | "boss";
}) {
  const color =
    variant === "ally"
      ? pct > 50
        ? "bg-emerald-500"
        : pct > 25
        ? "bg-amber-400"
        : "bg-red-500"
      : "bg-rose-600";
  return (
    <div className="mt-1">
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-900">
        <div
          className={`h-full ${color} transition-all duration-300`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-0.5 text-right font-mono text-[10px] text-zinc-500">
        {hp.toLocaleString()} / {max.toLocaleString()}
      </div>
    </div>
  );
}

function FrameLabel({ frame }: { frame: Ch4Frame | undefined }) {
  if (!frame) return <span className="text-zinc-500">—</span>;

  if (frame.type === "battle_start") {
    return <span className="text-zinc-300">전투 시작!</span>;
  }
  if (frame.type === "turn_start") {
    return (
      <span className="text-zinc-300">
        Round {frame.round}
        {frame.phase > 1 && (
          <span className="ml-2 text-red-400">[광폭화]</span>
        )}
      </span>
    );
  }
  if (frame.type === "turn_end") {
    return <span className="text-zinc-500">Round {frame.round} 종료</span>;
  }
  if (frame.type === "battle_end") {
    return (
      <span className={frame.result === "win" ? "text-emerald-300" : "text-red-300"}>
        전투 종료 · {frame.result === "win" ? "승리" : "패배"}
      </span>
    );
  }
  if (frame.type === "phase_transition") {
    return (
      <span className="font-bold text-red-300">
        ⚠ 광폭화 페이즈 진입!
      </span>
    );
  }
  if (frame.type === "skip") {
    return (
      <span className="text-zinc-500">
        {frame.actor.toUpperCase()} 행동 불가
      </span>
    );
  }
  if (frame.type === "counter_reflect") {
    return (
      <span className="text-amber-300">
        🔄 카운터! {frame.actor.toUpperCase()} → 보스에게{" "}
        {frame.damage.toLocaleString()} 반사 데미지
      </span>
    );
  }
  if (frame.type === "skill" || frame.type === "boss_skill") {
    const actorLabel = frame.actor === "boss" ? "보스" : frame.actor.toUpperCase();
    const dmg = frame.damage ? ` ${frame.damage.toLocaleString()} 데미지` : "";
    const heal = frame.heal ? ` ${frame.heal.toLocaleString()} 회복` : "";
    const weak = frame.weakness ? " · 약점!" : "";
    const resist = frame.resist ? " · 저항" : "";
    const crit = (frame as { crit?: boolean }).crit ? " · 크리티컬!" : "";
    return (
      <span>
        <span className="font-bold text-purple-200">{actorLabel}</span>{" "}
        <span className="text-zinc-300">{frame.skill_name}</span>
        <span className="text-zinc-400">
          {dmg}
          {heal}
          {weak && <span className="text-amber-400">{weak}</span>}
          {resist && <span className="text-zinc-500">{resist}</span>}
          {crit && <span className="text-rose-400">{crit}</span>}
        </span>
      </span>
    );
  }
  return <span className="text-zinc-500">—</span>;
}
