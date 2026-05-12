"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import {
  ch4UserStats,
  listCh4Bosses,
  listMyCh4Clears,
  createCh4Raid,
  lookupCh4RaidByCode,
  joinCh4Raid,
  getMyCh4WaitingRaid,
  bossSpriteUrl,
  roleLabel,
  type Ch4Boss,
  type Ch4Role,
  type Ch4UserStats,
} from "@/lib/gym/ch4-db";
import PageHeader from "./PageHeader";

const ROLES: Ch4Role[] = ["tank", "dealer", "supporter"];

export default function Ch4View() {
  const { user } = useAuth();
  const router = useRouter();

  const [bosses, setBosses] = useState<Ch4Boss[]>([]);
  const [clears, setClears] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState<Ch4UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedBoss, setSelectedBoss] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<Ch4Role>("tank");

  const [joinCode, setJoinCode] = useState("");
  const [joinRole, setJoinRole] = useState<Ch4Role>("dealer");

  const userId = user?.id ?? null;

  const refresh = useCallback(async () => {
    if (!userId) return;
    const [b, c, s, w] = await Promise.all([
      listCh4Bosses(),
      listMyCh4Clears(userId),
      ch4UserStats(userId),
      getMyCh4WaitingRaid(userId),
    ]);
    setBosses(b);
    setClears(new Set(c));
    setStats(s);
    setLoading(false);

    // 이미 대기 중인 레이드 있으면 자동 이동
    if (w && w.has_raid && w.raid_id) {
      router.replace(`/gym/ch4/raid/${w.raid_id}`);
    }
  }, [userId, router]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isUnlocked = useMemo(
    () => (b: Ch4Boss) =>
      b.unlock_requires_clear === null || clears.has(b.unlock_requires_clear),
    [clears]
  );

  const handleCreate = async () => {
    if (!userId || !selectedBoss) {
      setError("보스를 선택해주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    const r = await createCh4Raid(userId, selectedBoss, selectedRole);
    setBusy(false);
    if (!r.ok || !r.raid_id) {
      setError(r.error || "레이드 생성에 실패했어요.");
      return;
    }
    router.push(`/gym/ch4/raid/${r.raid_id}`);
  };

  const handleJoin = async () => {
    if (!userId) return;
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) {
      setError("룸 코드는 6자리예요.");
      return;
    }
    setBusy(true);
    setError(null);
    // 먼저 룸 코드 lookup → 자격 확인 등은 server-side
    const look = await lookupCh4RaidByCode(code);
    if (!look.ok || !look.raid_id) {
      setBusy(false);
      setError(look.error || "룸 코드를 찾을 수 없어요.");
      return;
    }
    const r = await joinCh4Raid(userId, code, joinRole);
    setBusy(false);
    if (!r.ok || !r.raid_id) {
      setError(r.error || "참가에 실패했어요.");
      return;
    }
    router.push(`/gym/ch4/raid/${r.raid_id}`);
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-zinc-400">
        불러오는 중...
      </div>
    );
  }

  const eligible = stats?.eligible ?? false;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
      <PageHeader
        title="미지의 영역"
        subtitle="모든 체육관 메달을 흭득한 트레이너들의 마지막 시련"
      />

      {/* 자격 표시 */}
      <div className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <Stat
            label="체육관 메달"
            value={`${stats?.medal_count ?? 0} / 18`}
            ok={(stats?.medal_count ?? 0) >= 18}
          />
          <Stat
            label="내 포켓몬"
            value={stats?.has_starter ? "✓" : "미등록"}
            ok={!!stats?.has_starter}
          />
          <Stat label="전투력" value={fmt(stats?.center_power ?? 0)} />
          <Stat
            label="스탯 배율"
            value={`HP/ATK ×${(stats?.hp_scale ?? 1).toFixed(2)}`}
          />
        </div>
        {!eligible && (
          <div className="mt-3 rounded-lg bg-red-950/30 px-3 py-2 text-xs text-red-300">
            {stats?.medal_count !== undefined && stats.medal_count < 18
              ? `메달이 ${18 - stats.medal_count}개 더 필요해요.`
              : "내 포켓몬을 먼저 등록해야 해요."}
          </div>
        )}
      </div>

      {/* 보스 4 단계 */}
      <h2 className="mb-3 text-lg font-bold text-zinc-100">보스 단계 선택</h2>
      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        {bosses.map((b) => {
          const unlocked = isUnlocked(b);
          const cleared = clears.has(b.id);
          const selected = selectedBoss === b.id;
          return (
            <button
              key={b.id}
              type="button"
              disabled={!unlocked || !eligible}
              onClick={() => setSelectedBoss(b.id)}
              className={`group relative overflow-hidden rounded-2xl border-2 p-4 text-left transition ${
                selected
                  ? "border-purple-500 bg-purple-950/30"
                  : unlocked
                  ? "border-zinc-800 bg-zinc-950/70 hover:border-zinc-700"
                  : "border-zinc-900 bg-black/50 opacity-50"
              }`}
            >
              <div className="flex items-start gap-3">
                {unlocked ? (
                  <div
                    className="relative h-20 w-20 shrink-0"
                    style={{ imageRendering: "pixelated" }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={bossSpriteUrl(b.sprite_key)}
                      alt={b.name}
                      className="h-full w-full object-contain"
                      style={{ imageRendering: "pixelated" }}
                    />
                  </div>
                ) : (
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-2xl">
                    ?
                  </div>
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">
                      STAGE {b.stage_order}
                    </span>
                    {cleared && (
                      <span className="rounded-full bg-emerald-900/60 px-2 py-0.5 text-[10px] text-emerald-300">
                        ✓ 클리어
                      </span>
                    )}
                  </div>
                  <div className="font-bold text-zinc-100">
                    {unlocked ? b.name : "???"}
                  </div>
                  {unlocked && (
                    <>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {b.types.map((t) => (
                          <span
                            key={t}
                            className="rounded-md bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                      <div className="mt-2 text-xs text-zinc-400">
                        HP {fmt(b.base_hp)} · ATK {fmt(b.base_atk)}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* 룸 만들기 */}
      <h2 className="mb-3 text-lg font-bold text-zinc-100">방 만들기</h2>
      <div className="mb-3 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
        <div className="mb-2 text-xs text-zinc-400">내 역할</div>
        <div className="mb-4 flex gap-2">
          {ROLES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setSelectedRole(r)}
              className={`flex-1 rounded-lg border py-2 text-sm transition ${
                selectedRole === r
                  ? "border-purple-500 bg-purple-950/50 text-purple-200"
                  : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700"
              }`}
            >
              {roleLabel(r)}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={!eligible || !selectedBoss || busy}
          onClick={handleCreate}
          className="w-full rounded-xl bg-purple-600 py-3 font-bold text-white shadow-lg shadow-purple-900/30 transition hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          방 만들기
        </button>
      </div>

      {/* 룸 코드로 참가 */}
      <h2 className="mb-3 mt-6 text-lg font-bold text-zinc-100">방 코드로 참가</h2>
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
        <input
          type="text"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          placeholder="6자리 코드 (예: A3F2KZ)"
          maxLength={6}
          className="mb-3 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-3 text-center font-mono text-lg uppercase tracking-widest text-zinc-100 outline-none focus:border-purple-500"
        />
        <div className="mb-2 text-xs text-zinc-400">내 역할</div>
        <div className="mb-3 flex gap-2">
          {ROLES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setJoinRole(r)}
              className={`flex-1 rounded-lg border py-2 text-sm transition ${
                joinRole === r
                  ? "border-purple-500 bg-purple-950/50 text-purple-200"
                  : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700"
              }`}
            >
              {roleLabel(r)}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={!eligible || joinCode.length !== 6 || busy}
          onClick={handleJoin}
          className="w-full rounded-xl bg-zinc-800 py-3 font-bold text-zinc-100 transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          참가하기
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div
        className={`mt-0.5 font-bold ${
          ok === undefined ? "text-zinc-100" : ok ? "text-emerald-400" : "text-red-400"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function fmt(n: number): string {
  return n.toLocaleString();
}
