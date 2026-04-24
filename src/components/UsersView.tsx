"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { useAuth } from "@/lib/auth";
import { fetchUserRankings, type RankingRow } from "@/lib/db";
import { getCard, SETS } from "@/lib/sets";
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

const PSA_TIER_BONUS: Record<number, number> = {
  10: 50000,
  9: 30000,
  8: 10000,
  7: 3000,
  6: 3000,
};

const GRADE_COLOR: Record<number, string> = {
  10: "text-amber-300",
  9: "text-slate-100",
  8: "text-teal-200",
  7: "text-sky-200",
  6: "text-indigo-200",
};

const GRADE_RING: Record<number, string> = {
  10: "border-amber-400/60 bg-amber-400/10",
  9: "border-slate-300/40 bg-slate-200/10",
  8: "border-teal-400/40 bg-teal-500/10",
  7: "border-sky-400/40 bg-sky-500/10",
  6: "border-indigo-400/40 bg-indigo-500/10",
};

export default function UsersView() {
  const { user: currentUser } = useAuth();
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  // { userId: grade } — which grade accordion is expanded for which user
  const [expanded, setExpanded] = useState<Record<string, number | null>>({});

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
      rows.slice().sort((a, b) => {
        if (a.rank_score !== b.rank_score) return b.rank_score - a.rank_score;
        return b.points - a.points;
      }),
    [rows]
  );

  const toggleGrade = (userId: string, grade: number) => {
    setExpanded((prev) => ({
      ...prev,
      [userId]: prev[userId] === grade ? null : grade,
    }));
  };

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

      {/* Quick guide */}
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
            팩을 열어{" "}
            <span className="font-bold text-white">
              AR · MA · SAR · MUR · UR
            </span>{" "}
            카드를 확보하세요.
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
            등급별 점수 지급,{" "}
            <span className="text-rose-300 font-bold">실패(70%)</span> 시 카드
            소실.
          </li>
        </ol>
      </div>

      {/* Scoring legend */}
      <div className="mt-3 rounded-xl bg-white/5 border border-white/10 p-3">
        <p className="text-[11px] uppercase tracking-wider text-zinc-400 mb-2">
          PSA 등급 → 랭킹 점수 · 지갑 보너스
        </p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
          {[10, 9, 8, 7, 6].map((g) => (
            <div
              key={g}
              className="rounded-lg bg-black/30 border border-white/5 px-2.5 py-1.5"
            >
              <div className="flex items-center justify-between">
                <span className={clsx("font-bold", GRADE_COLOR[g])}>PSA {g}</span>
                <span className="text-zinc-200 tabular-nums font-semibold">
                  +{PSA_TIER_POINTS[g]}점
                </span>
              </div>
              <p className="mt-0.5 text-[10px] text-zinc-500 tabular-nums text-right">
                🪙 +{PSA_TIER_BONUS[g].toLocaleString("ko-KR")}p
              </p>
            </div>
          ))}
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
        <ul className="mt-6 space-y-2.5">
          {entries.map((e, rank) => {
            const isMe = currentUser?.id === e.id;
            const openGrade = expanded[e.id] ?? null;
            const gradeCounts: { grade: number; count: number }[] = [
              { grade: 10, count: e.psa_10 },
              { grade: 9, count: e.psa_9 },
              { grade: 8, count: e.psa_8 },
              { grade: 7, count: e.psa_7 },
              { grade: 6, count: e.psa_6 },
            ].filter((g) => g.count > 0);

            return (
              <motion.li
                key={e.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(rank * 0.03, 0.3) }}
                className={clsx(
                  "rounded-2xl border overflow-hidden",
                  isMe
                    ? "bg-amber-400/5 border-amber-400/50 shadow-[0_0_24px_-6px_rgba(251,191,36,0.4)]"
                    : "bg-white/5 border-white/10"
                )}
              >
                {/* Header row */}
                <div className="p-3 md:p-4 flex items-center gap-3 md:gap-4">
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
                        {e.display_name}
                      </h2>
                      {isMe && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-400 text-zinc-900">
                          나
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] md:text-xs text-zinc-400 mt-0.5">
                      감별 {e.psa_count}회 성공
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
                </div>

                {/* Grade chips row — click to expand */}
                {gradeCounts.length > 0 && (
                  <div className="px-3 md:px-4 pb-3 flex flex-wrap gap-1.5">
                    {gradeCounts.map(({ grade, count }) => {
                      const active = openGrade === grade;
                      return (
                        <button
                          key={grade}
                          onClick={() => toggleGrade(e.id, grade)}
                          style={{ touchAction: "manipulation" }}
                          className={clsx(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border transition",
                            active
                              ? "bg-white text-zinc-900 border-white"
                              : clsx(
                                  GRADE_RING[grade],
                                  GRADE_COLOR[grade],
                                  "hover:brightness-125"
                                )
                          )}
                          aria-expanded={active}
                        >
                          <span>PSA {grade}</span>
                          <span className="opacity-80">×{count}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Expanded card list for the selected grade */}
                <AnimatePresence initial={false}>
                  {openGrade !== null && (
                    <motion.div
                      key={`exp-${openGrade}`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden border-t border-white/5 bg-black/20"
                    >
                      <div className="px-3 md:px-4 py-3">
                        <p className="text-[10px] uppercase tracking-wider text-zinc-400 mb-2">
                          PSA {openGrade} 카드 ({gradeCounts.find((g) => g.grade === openGrade)?.count ?? 0}장)
                        </p>
                        <ul className="space-y-1.5">
                          {e.gradings
                            .filter((g) => g.grade === openGrade)
                            .map((g) => {
                              const card = getCard(g.card_id);
                              if (!card) return null;
                              return (
                                <li
                                  key={g.id}
                                  className="flex items-center gap-3 p-2 rounded-lg bg-white/5"
                                >
                                  <div className="shrink-0 w-8 h-11 rounded overflow-hidden bg-zinc-900 ring-1 ring-white/10">
                                    {card.imageUrl && (
                                      <img
                                        src={card.imageUrl}
                                        alt=""
                                        className="w-full h-full object-cover"
                                      />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs text-white font-semibold truncate">
                                      {card.name}
                                    </p>
                                    <p className="text-[10px] text-zinc-400">
                                      {SETS[card.setCode].name} · #{card.number}
                                    </p>
                                  </div>
                                  <span
                                    className={clsx(
                                      "shrink-0 text-xs font-black tabular-nums",
                                      GRADE_COLOR[g.grade]
                                    )}
                                  >
                                    PSA {g.grade}
                                  </span>
                                </li>
                              );
                            })}
                        </ul>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
