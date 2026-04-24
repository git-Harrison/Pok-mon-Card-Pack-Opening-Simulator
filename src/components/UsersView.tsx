"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import clsx from "clsx";
import { useAuth } from "@/lib/auth";
import { fetchUserRankings, type RankingRow } from "@/lib/db";
import PointsChip from "./PointsChip";

/**
 * Ranking is driven entirely by PSA success points. Card ownership
 * (even an MUR) doesn't affect rank by itself — users must successfully
 * PSA-grade cards to climb.
 */
const PSA_TIER_POINTS: Record<number, number> = {
  10: 1000,
  9: 500,
  8: 200,
  7: 100,
  6: 100,
};

export default function UsersView() {
  const { user: currentUser } = useAuth();
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetchUserRankings();
    setRows(r);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const entries = useMemo(
    () =>
      rows
        .slice()
        .sort((a, b) => {
          if (a.rank_score !== b.rank_score)
            return b.rank_score - a.rank_score;
          return b.points - a.points;
        }),
    [rows]
  );

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-10 fade-in">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-4xl font-black text-white tracking-tight">
            사용자 랭킹
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            PSA 감별 성공 시 등급별 랭킹 점수를 얻어요. 카드 보유만으로는
            점수가 오르지 않아요.
          </p>
        </div>
      </div>

      {/* How to rank up — brief guide */}
      <div className="mt-4 rounded-xl bg-gradient-to-br from-amber-500/10 via-fuchsia-500/5 to-transparent border border-amber-400/30 p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">📈</span>
          <h2 className="text-sm font-bold text-amber-200">
            랭킹 점수 올리는 법
          </h2>
        </div>
        <ol className="space-y-1 text-xs text-zinc-200 leading-relaxed">
          <li>
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-400 text-zinc-950 text-[10px] font-black mr-1.5 tabular-nums">
              1
            </span>
            팩을 열어 <span className="font-bold text-white">AR · MA · SAR · MUR · UR</span> 카드를 확보하세요.
          </li>
          <li>
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-400 text-zinc-950 text-[10px] font-black mr-1.5 tabular-nums">
              2
            </span>
            <Link
              href="/grading"
              className="underline underline-offset-2 text-amber-300 hover:text-amber-200 font-semibold"
            >
              PSA 감별
            </Link>
            {" "}페이지에서 카드 감정을 맡기세요.
          </li>
          <li>
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-400 text-zinc-950 text-[10px] font-black mr-1.5 tabular-nums">
              3
            </span>
            <span className="text-emerald-300 font-bold">성공(30%)</span> 시
            등급별 점수 지급, <span className="text-rose-300 font-bold">실패(70%)</span> 시
            카드 소실 — 쫄깃하게 즐기세요.
          </li>
        </ol>
        <p className="mt-2 pt-2 border-t border-white/10 text-[10px] text-zinc-400">
          💡 카드 보유만으로는 점수가 오르지 않아요. 감별에 성공해야 랭킹이 올라갑니다.
        </p>
      </div>

      {/* Scoring legend */}
      <div className="mt-3 rounded-xl bg-white/5 border border-white/10 p-3">
        <p className="text-[11px] uppercase tracking-wider text-zinc-400 mb-2">
          PSA 등급 → 랭킹 점수 · 지갑 보너스
        </p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
          {Object.entries(PSA_TIER_POINTS)
            .sort(([a], [b]) => Number(b) - Number(a))
            .map(([g, pts]) => {
              const bonus =
                Number(g) === 10
                  ? 50000
                  : Number(g) === 9
                  ? 30000
                  : Number(g) === 8
                  ? 10000
                  : 3000;
              return (
                <div
                  key={g}
                  className="rounded-lg bg-black/30 border border-white/5 px-2.5 py-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={clsx(
                        "font-bold",
                        Number(g) === 10
                          ? "text-amber-300"
                          : Number(g) === 9
                          ? "text-slate-100"
                          : Number(g) === 8
                          ? "text-teal-200"
                          : "text-sky-200"
                      )}
                    >
                      PSA {g}
                    </span>
                    <span className="text-zinc-200 tabular-nums font-semibold">
                      +{pts}점
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px] text-zinc-500 tabular-nums text-right">
                    🪙 +{bonus.toLocaleString("ko-KR")}p
                  </p>
                </div>
              );
            })}
        </div>
      </div>

      {loading ? (
        <div className="mt-16 flex justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <p className="mt-16 text-center text-zinc-400 text-sm">
          아직 사용자가 없습니다.
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {entries.map((e, rank) => {
            const isMe = currentUser?.id === e.id;
            return (
              <motion.li
                key={e.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(rank * 0.03, 0.3) }}
                className={clsx(
                  "rounded-2xl border p-3 md:p-4 flex items-center gap-3 md:gap-4",
                  isMe
                    ? "bg-amber-400/5 border-amber-400/50 shadow-[0_0_24px_-6px_rgba(251,191,36,0.4)]"
                    : "bg-white/5 border-white/10"
                )}
              >
                <div
                  className={clsx(
                    "shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center font-black text-sm md:text-base border",
                    rank === 0
                      ? "bg-amber-400/20 text-amber-200 border-amber-400/60"
                      : rank === 1
                      ? "bg-zinc-300/10 text-zinc-200 border-zinc-300/40"
                      : rank === 2
                      ? "bg-orange-500/10 text-orange-200 border-orange-500/40"
                      : "bg-white/5 text-zinc-400 border-white/10"
                  )}
                >
                  {rank + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base md:text-lg font-bold text-white">
                      {e.user_id}
                    </h2>
                    {isMe && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-400 text-zinc-900">
                        나
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] md:text-xs text-zinc-400 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span>감별 {e.psa_count}회</span>
                    {e.psa_10 > 0 && (
                      <span className="text-amber-300 font-semibold">
                        · PSA 10 ×{e.psa_10}
                      </span>
                    )}
                    {e.psa_9 > 0 && (
                      <span className="text-slate-200 font-semibold">
                        · PSA 9 ×{e.psa_9}
                      </span>
                    )}
                    {e.psa_8 > 0 && (
                      <span className="text-teal-200 font-semibold">
                        · PSA 8 ×{e.psa_8}
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xl md:text-2xl font-black text-amber-300 tabular-nums leading-none">
                    {e.rank_score.toLocaleString("ko-KR")}
                  </div>
                  <div className="mt-1 text-[10px] text-zinc-500 uppercase tracking-wider">
                    랭킹 점수
                  </div>
                  <div className="mt-1">
                    <PointsChip points={e.points} size="sm" />
                  </div>
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
