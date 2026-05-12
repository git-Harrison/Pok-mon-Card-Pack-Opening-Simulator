"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/utils/supabase/client";
import {
  getCh4Raid,
  leaveCh4Raid,
  startCh4Raid,
  addBotToCh4Raid,
  bossSpriteUrl,
  speciesSpriteUrl,
  roleLabel,
  roleColor,
  SPECIES_NAME_KO,
  type Ch4FullRaid,
} from "@/lib/gym/ch4-db";
import Ch4RaidReplay from "./Ch4RaidReplay";

export default function Ch4RaidLobby({ raidId }: { raidId: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<Ch4FullRaid | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);

  const refresh = useCallback(async () => {
    const d = await getCh4Raid(raidId);
    setData(d);
    setLoading(false);
  }, [raidId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ── Realtime: ch4_raid_participants 변동 + ch4_raids status 변경 ──
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`ch4_raid:${raidId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ch4_raid_participants",
          filter: `raid_id=eq.${raidId}`,
        },
        () => {
          refresh();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "ch4_raids",
          filter: `id=eq.${raidId}`,
        },
        () => {
          refresh();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [raidId, refresh]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-zinc-400">
        불러오는 중...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 text-center">
        <div className="mb-3 text-zinc-300">레이드를 찾을 수 없어요.</div>
        <button
          type="button"
          onClick={() => router.replace("/gym/ch4")}
          className="rounded-lg bg-zinc-800 px-4 py-2 text-zinc-100 hover:bg-zinc-700"
        >
          돌아가기
        </button>
      </div>
    );
  }

  const { raid, boss, participants } = data;
  const userId = user?.id ?? null;
  const me = participants.find((p) => p.user_id === userId) ?? null;
  const isHost = raid.host_user_id === userId;
  const slotByNum = new Map<number, (typeof participants)[number]>();
  participants.forEach((p) => slotByNum.set(p.slot, p));

  // resolved → 재생 화면으로
  if (raid.status === "resolved" || raid.status === "resolving") {
    return (
      <Ch4RaidReplay
        raid={raid}
        boss={boss}
        participants={participants}
        onBack={() => router.replace("/gym/ch4")}
      />
    );
  }

  if (raid.status === "cancelled") {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 text-center">
        <div className="mb-3 text-zinc-300">취소된 레이드예요.</div>
        <button
          type="button"
          onClick={() => router.replace("/gym/ch4")}
          className="rounded-lg bg-zinc-800 px-4 py-2 text-zinc-100 hover:bg-zinc-700"
        >
          돌아가기
        </button>
      </div>
    );
  }

  const handleLeave = async () => {
    if (!userId) return;
    setBusy(true);
    await leaveCh4Raid(userId, raidId);
    setBusy(false);
    router.replace("/gym/ch4");
  };

  const handleAddBot = async () => {
    if (!userId) return;
    setBusy(true);
    setError(null);
    const r = await addBotToCh4Raid(userId, raidId);
    setBusy(false);
    if (!r.ok) {
      setError(r.error || "봇 추가에 실패했어요.");
      return;
    }
    refresh();
  };

  const handleStart = async () => {
    if (!userId || !isHost) return;
    if (participants.length !== 3) {
      setError("참가자 3명이 모여야 시작할 수 있어요.");
      return;
    }
    setStarting(true);
    setError(null);
    const r = await startCh4Raid(userId, raidId);
    if (!r.ok) {
      setStarting(false);
      setError(r.error || "시작에 실패했어요.");
      return;
    }
    // 결정론 시뮬레이션이라 응답 시점에 이미 resolved + replay_data 있음.
    // Realtime 만 기다리지 말고 즉시 fetch 해서 재생 화면으로 전환.
    await refresh();
    setStarting(false);
  };

  const handleCopyCode = () => {
    if (typeof window !== "undefined" && raid.room_code) {
      navigator.clipboard?.writeText(raid.room_code).catch(() => undefined);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      {/* 보스 정보 */}
      <div className="mb-4 rounded-2xl border-2 border-purple-900/50 bg-gradient-to-b from-purple-950/40 to-zinc-950/70 p-4">
        <div className="flex items-center gap-3">
          <div
            className="h-24 w-24 shrink-0"
            style={{ imageRendering: "pixelated" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={bossSpriteUrl(boss.sprite_key)}
              alt={boss.name}
              className="h-full w-full object-contain"
              style={{ imageRendering: "pixelated" }}
            />
          </div>
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wider text-purple-400">
              STAGE {boss.stage_order}
            </div>
            <div className="text-xl font-bold text-zinc-100">{boss.name}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {boss.types.map((t) => (
                <span
                  key={t}
                  className="rounded-md bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300"
                >
                  {t}
                </span>
              ))}
              {boss.weak_to.length > 0 && (
                <span className="rounded-md bg-red-950/60 px-1.5 py-0.5 text-[10px] text-red-300">
                  약점: {boss.weak_to.join(" · ")}
                </span>
              )}
            </div>
            <div className="mt-1 text-xs text-zinc-400">
              HP {boss.base_hp.toLocaleString()} · ATK{" "}
              {boss.base_atk.toLocaleString()}
            </div>
          </div>
        </div>
        {boss.description && (
          <p className="mt-3 text-sm text-zinc-400">{boss.description}</p>
        )}
      </div>

      {/* 룸 코드 */}
      <div className="mb-4 flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-zinc-500">
            방 코드
          </div>
          <div className="font-mono text-2xl font-bold tracking-widest text-purple-300">
            {raid.room_code}
          </div>
        </div>
        <button
          type="button"
          onClick={handleCopyCode}
          className="rounded-lg bg-zinc-800 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-700"
        >
          복사
        </button>
      </div>

      {/* 참가자 3 슬롯 */}
      <h2 className="mb-2 text-lg font-bold text-zinc-100">
        참가자 ({participants.length}/3)
      </h2>
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        {[1, 2, 3].map((slot) => {
          const p = slotByNum.get(slot);
          if (!p) {
            return (
              <div
                key={slot}
                className="flex h-36 flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-800 bg-zinc-950/30 p-3"
              >
                <div className="mb-2 text-xs text-zinc-600">
                  슬롯 {slot} 비어있음
                </div>
                {isHost && (
                  <button
                    type="button"
                    onClick={handleAddBot}
                    disabled={busy}
                    className="rounded-lg border border-purple-700/50 bg-purple-950/30 px-3 py-1.5 text-xs font-bold text-purple-200 transition hover:bg-purple-900/50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    🤖 봇 추가
                  </button>
                )}
              </div>
            );
          }
          const isMe = p.user_id === userId;
          return (
            <div
              key={slot}
              className={`rounded-xl border-2 p-3 ${
                isMe
                  ? "border-purple-500/70 bg-purple-950/20"
                  : p.is_bot
                  ? "border-zinc-700 bg-zinc-900/60"
                  : "border-zinc-800 bg-zinc-950/70"
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className="h-14 w-14 shrink-0"
                  style={{ imageRendering: "pixelated" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={speciesSpriteUrl(
                      p.starter.species,
                      p.starter.evolution_stage
                    )}
                    alt={p.starter.species}
                    className="h-full w-full object-contain"
                    style={{ imageRendering: "pixelated" }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className={`text-xs font-bold ${roleColor(p.role)}`}>
                      {roleLabel(p.role)}
                    </span>
                    {p.is_bot && (
                      <span className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-bold text-zinc-400">
                        BOT
                      </span>
                    )}
                  </div>
                  <div className="truncate text-sm font-bold text-zinc-100">
                    {p.starter.nickname}
                  </div>
                  <div className="truncate text-[11px] text-zinc-500">
                    {SPECIES_NAME_KO[p.starter.species] ?? p.starter.species} ·
                    Lv.{p.starter.level}
                  </div>
                </div>
              </div>
              <div className="mt-2 text-[11px] text-zinc-400">
                {p.is_bot ? "🤖 " : "@"}
                {p.is_bot ? p.display_name : p.user_name} · ⚔{" "}
                {p.center_power.toLocaleString()}
              </div>
              <div className="mt-1 text-[10px] text-zinc-500">
                HP×{p.hp_scale.toFixed(2)} · 스킬×{p.skill_mul.toFixed(2)}
              </div>
            </div>
          );
        })}
      </div>

      {/* 내 역할 표시 (서버 랜덤 배정 — 변경 불가) */}
      {me && (
        <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-950/70 p-3 text-center">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500">
            내 역할
          </div>
          <div className={`text-xl font-bold ${roleColor(me.role)}`}>
            {roleLabel(me.role)}
          </div>
          <div className="mt-0.5 text-[10px] text-zinc-500">
            랜덤 배정 · 변경 불가
          </div>
        </div>
      )}

      {/* 시작 / 나가기 */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleLeave}
          disabled={busy || starting}
          className="rounded-xl bg-zinc-800 px-5 py-3 font-bold text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
        >
          {isHost ? "방 취소" : "나가기"}
        </button>
        {isHost && (
          <button
            type="button"
            onClick={handleStart}
            disabled={participants.length !== 3 || starting}
            className="flex-1 rounded-xl bg-purple-600 py-3 font-bold text-white shadow-lg shadow-purple-900/30 transition hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {starting
              ? "전투 시뮬레이션 중..."
              : participants.length === 3
              ? "전투 시작"
              : `참가자 ${3 - participants.length}명 더 필요`}
          </button>
        )}
        {!isHost && (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950/50 text-sm text-zinc-400">
            방장이 시작할 때까지 대기 중
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-lg bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
