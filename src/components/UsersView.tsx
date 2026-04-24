"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { useAuth } from "@/lib/auth";
import { fetchUserRankings, sendTaunt, type RankingRow } from "@/lib/db";
import { getCard, SETS } from "@/lib/sets";
import PointsChip from "./PointsChip";
import PageHeader from "./PageHeader";
import Portal from "./Portal";

/**
 * Ranking is driven entirely by PSA success points. Card ownership
 * (even an MUR) doesn't affect rank by itself — users must successfully
 * PSA-grade cards to climb.
 */
const PSA_TIER_POINTS: Record<number, number> = {
  10: 500,
  9: 350,
  8: 150,
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

/** Rank points awarded to the attacker per successful sabotage. */
const SABOTAGE_WIN_POINTS = 100;

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

type RankingMode = "rank" | "power";

export default function UsersView() {
  const { user: currentUser } = useAuth();
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  // { userId: grade } — which grade accordion is expanded for which user
  const [expanded, setExpanded] = useState<Record<string, number | null>>({});
  const [helpOpen, setHelpOpen] = useState(false);
  const [mode, setMode] = useState<RankingMode>("rank");
  const [tauntTarget, setTauntTarget] = useState<RankingRow | null>(null);

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
        if (mode === "power") {
          const ap = a.center_power ?? 0;
          const bp = b.center_power ?? 0;
          if (ap !== bp) return bp - ap;
        } else {
          if (a.rank_score !== b.rank_score) return b.rank_score - a.rank_score;
        }
        return b.points - a.points;
      }),
    [rows, mode]
  );

  const toggleGrade = (userId: string, grade: number) => {
    setExpanded((prev) => ({
      ...prev,
      [userId]: prev[userId] === grade ? null : grade,
    }));
  };

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-5 md:py-8 fade-in">
      <PageHeader
        title="사용자 랭킹"
        subtitle="PCL 감별 성공 + 센터 전시로 점수를 쌓아 올라가세요"
        stats={
          <button
            onClick={() => setHelpOpen((v) => !v)}
            className="h-7 px-2.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-semibold text-zinc-300 hover:bg-white/10"
          >
            {helpOpen ? "도움말 ▲" : "도움말 ▼"}
          </button>
        }
      />

      <AnimatePresence initial={false}>
        {helpOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl bg-white/5 border border-white/10 p-3 mb-3">
              <p className="text-[11px] uppercase tracking-wider text-zinc-400 mb-2">
                PCL 등급 → 랭킹 점수 · 지갑 보너스
              </p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                {[10, 9, 8, 7, 6].map((g) => (
                  <div
                    key={g}
                    className="rounded-lg bg-black/30 border border-white/5 px-2.5 py-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className={clsx("font-bold", GRADE_COLOR[g])}>
                        PCL {g}
                      </span>
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
              <p className="mt-2 text-[10px] text-zinc-400 leading-snug">
                <Link
                  href="/grading"
                  className="underline underline-offset-2 text-amber-300 hover:text-amber-200"
                >
                  PCL 감별
                </Link>{" "}
                성공 시 등급별 점수 획득. 전시는 랭킹 가산 없음. 전시 중에
                상대에게 부서지면 그 카드로 얻은 점수가 사라지고, 남의 카드를
                부수면 <b className="text-rose-300">+{SABOTAGE_WIN_POINTS}점</b>
                {" "}획득.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tab switcher: 랭킹 점수 / 전투력 */}
      <div className="mt-3 inline-flex items-stretch rounded-xl bg-white/5 border border-white/10 p-1">
        <button
          type="button"
          onClick={() => setMode("rank")}
          className={clsx(
            "px-4 py-1.5 rounded-lg text-xs font-bold transition-colors",
            mode === "rank"
              ? "bg-white text-zinc-900"
              : "text-zinc-300 hover:text-white"
          )}
        >
          🏆 랭킹 점수
        </button>
        <button
          type="button"
          onClick={() => setMode("power")}
          className={clsx(
            "px-4 py-1.5 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1",
            mode === "power"
              ? "bg-rose-500 text-white"
              : "text-zinc-300 hover:text-white"
          )}
        >
          ⚔️ 전투력
        </button>
      </div>
      {mode === "power" && (
        <p className="mt-2 text-[11px] text-zinc-400 leading-snug">
          전투력 = 센터에 전시된 슬랩마다{" "}
          <b className="text-zinc-200">희귀도 점수</b>(SR 5·MA 6·SAR 7·UR 8·MUR
          10) × <b className="text-zinc-200">PCL 점수</b>(9→9, 10→10) 를 모두
          합산.
        </p>
      )}

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
                      <Link
                        href={`/center/${encodeURIComponent(e.user_id)}`}
                        aria-label={`${e.display_name}님의 포켓몬센터`}
                        className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-gradient-to-r from-fuchsia-500/80 to-indigo-500/80 hover:from-fuchsia-500 hover:to-indigo-500 text-white text-[10px] font-bold transition"
                      >
                        🏛️ 센터
                      </Link>
                      {!isMe && mode === "power" && (
                        <button
                          type="button"
                          onClick={() => setTauntTarget(e)}
                          aria-label={`${e.display_name}에게 조롱 보내기`}
                          className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-gradient-to-r from-rose-500/80 to-amber-500/80 hover:from-rose-500 hover:to-amber-500 text-white text-[10px] font-bold transition"
                        >
                          🔥 조롱
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] md:text-xs text-zinc-400 mt-0.5">
                      감별 {e.psa_count}회 · 전시 {e.showcase_count ?? 0}장 ·
                      부수기 {e.sabotage_wins ?? 0}승
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {mode === "power" ? (
                      <>
                        <div className="text-xl md:text-2xl font-black text-rose-300 tabular-nums leading-none inline-flex items-center gap-1">
                          <span aria-hidden>⚔️</span>
                          {(e.center_power ?? 0).toLocaleString("ko-KR")}
                        </div>
                        <div className="mt-1 text-[10px] text-zinc-500 uppercase tracking-wider">
                          전투력
                        </div>
                        <div className="mt-1 text-[10px] text-zinc-400 tabular-nums">
                          랭킹 {e.rank_score.toLocaleString("ko-KR")}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-xl md:text-2xl font-black text-amber-300 tabular-nums leading-none">
                          {e.rank_score.toLocaleString("ko-KR")}
                        </div>
                        <div className="mt-1 text-[10px] text-zinc-500 uppercase tracking-wider">
                          랭킹 점수
                        </div>
                        <div className="mt-1">
                          <PointsChip points={e.points} size="sm" />
                        </div>
                      </>
                    )}
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
                          <span>PCL {grade}</span>
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
                          PCL {openGrade} 카드 ({gradeCounts.find((g) => g.grade === openGrade)?.count ?? 0}장)
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
                                    PCL {g.grade}
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

      <AnimatePresence>
        {tauntTarget && (
          <TauntComposer
            target={tauntTarget}
            onClose={() => setTauntTarget(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

const TAUNT_PRESETS = [
  "네 센터는 장식용이야?",
  "다음엔 내가 부수러 간다",
  "그 등급 그거밖에 안 나와?",
  "랭킹 올라오는 거 구경만 하지 말고 덤벼!",
  "오늘도 나한테 한 방 먹을 준비됐지?",
];

function TauntComposer({
  target,
  onClose,
}: {
  target: RankingRow;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = useCallback(async () => {
    if (!user || sending) return;
    const text = msg.trim();
    if (text.length < 1) {
      setError("메시지를 입력하세요.");
      return;
    }
    setSending(true);
    setError(null);
    const res = await sendTaunt(user.id, target.user_id, text);
    setSending(false);
    if (!res.ok) {
      setError(res.error ?? "전송 실패");
      return;
    }
    setDone(true);
    setTimeout(onClose, 900);
  }, [user, msg, sending, target.user_id, onClose]);

  return (
    <Portal>
      <motion.div
        className="fixed inset-0 z-[150] bg-black/85 backdrop-blur-md flex items-center justify-center overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          paddingTop: "max(env(safe-area-inset-top, 0px), 12px)",
          paddingBottom: "max(env(safe-area-inset-bottom, 0px), 12px)",
          paddingLeft: "12px",
          paddingRight: "12px",
        }}
      >
        <motion.div
          className="relative w-full max-w-md bg-zinc-900 border border-rose-500/40 rounded-2xl overflow-hidden shadow-2xl"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-white/10 bg-rose-500/10">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white">
                🔥 {target.display_name}에게 조롱 보내기
              </h3>
              <p className="text-[10px] text-rose-200/80 truncate">
                받는 사람 페이지에 강제 팝업으로 떠요
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="닫기"
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
            >
              ✕
            </button>
          </div>
          <div className="p-4">
            <textarea
              value={msg}
              onChange={(e) => setMsg(e.target.value.slice(0, 200))}
              rows={3}
              maxLength={200}
              placeholder="던질 말을 적어주세요..."
              style={{ fontSize: "16px" }}
              className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-rose-400/60 resize-none"
            />
            <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-500">
              <span>1~200자</span>
              <span className="tabular-nums">{msg.length} / 200</span>
            </div>

            <div className="mt-3">
              <p className="text-[10px] uppercase tracking-wider text-zinc-400 mb-1.5">
                빠른 선택
              </p>
              <div className="flex flex-wrap gap-1.5">
                {TAUNT_PRESETS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setMsg(t)}
                    className="text-[11px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/10"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="mt-3 text-xs text-rose-300">{error}</p>
            )}
            {done && (
              <p className="mt-3 text-xs text-emerald-300">전송 완료!</p>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={sending}
                className="h-11 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm font-semibold"
              >
                취소
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={sending || done || msg.trim().length < 1}
                className={clsx(
                  "h-11 rounded-lg font-black text-sm",
                  sending || done || msg.trim().length < 1
                    ? "bg-white/5 text-zinc-500"
                    : "bg-gradient-to-r from-rose-500 to-amber-500 text-zinc-950 active:scale-[0.98]"
                )}
              >
                {sending ? "보내는 중..." : done ? "전송됨" : "🔥 보내기"}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </Portal>
  );
}
