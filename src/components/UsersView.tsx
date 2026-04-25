"use client";

import PokeLoader, { CenteredPokeLoader } from "./PokeLoader";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { useAuth } from "@/lib/auth";
import { fetchUserRankings, sendTaunt, type RankingRow } from "@/lib/db";
import { usePresence } from "@/lib/usePresence";
import { getCard } from "@/lib/sets";
import { RARITY_STYLE } from "@/lib/rarity";
import type { Rarity } from "@/lib/types";
import Portal from "./Portal";
import { getCharacter } from "@/lib/profile";
import { CharacterAvatar } from "./ProfileView";

type RankingMode = "rank" | "power" | "pet";

export default function UsersView() {
  const { user: currentUser } = useAuth();
  const onlineSet = usePresence(currentUser?.id);
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<RankingMode>("rank");
  const [tauntTarget, setTauntTarget] = useState<RankingRow | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
        } else if (mode === "pet") {
          const ap = a.pet_score ?? 0;
          const bp = b.pet_score ?? 0;
          if (ap !== bp) return bp - ap;
        } else {
          if (a.rank_score !== b.rank_score) return b.rank_score - a.rank_score;
        }
        return b.points - a.points;
      }),
    [rows, mode]
  );

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-3 md:py-6 fade-in">
      <div className="inline-flex items-stretch rounded-xl bg-white/5 border border-white/10 p-1">
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
        <button
          type="button"
          onClick={() => setMode("pet")}
          className={clsx(
            "px-4 py-1.5 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1",
            mode === "pet"
              ? "bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white"
              : "text-zinc-300 hover:text-white"
          )}
        >
          🐾 펫 랭킹
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
      {mode === "pet" && (
        <p className="mt-2 text-[11px] text-zinc-400 leading-snug">
          펫 점수 = 등록한 PCL10 펫 슬랩 (최대 5장) 의{" "}
          <b className="text-zinc-200">희귀도 점수</b>(SR 5·MA 6·SAR 7·UR 8·MUR
          10) × 10 합산. 최대{" "}
          <b className="text-fuchsia-300">500</b>점.
        </p>
      )}

      {loading ? (
        <CenteredPokeLoader />
      ) : entries.length === 0 ? (
        <p className="mt-16 text-center text-zinc-400 text-sm">
          아직 사용자가 없습니다.
        </p>
      ) : (
        <ul className="mt-6 space-y-2.5">
          {entries.map((e, rank) => {
            const isMe = currentUser?.id === e.id;
            const def = getCharacter(e.character);
            const isOnline = onlineSet.has(e.id);
            const isExpanded = expandedId === e.id;
            const petCount = e.main_card_ids?.length ?? 0;
            const isTopThree = rank < 3;
            const trophy = rank === 0 ? "🏆" : rank === 1 ? "🥈" : rank === 2 ? "🥉" : null;

            return (
              <motion.li
                key={e.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(rank * 0.03, 0.3) }}
                onClick={() =>
                  setExpandedId((cur) => (cur === e.id ? null : e.id))
                }
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                aria-label={`${e.display_name} 상세 통계 ${isExpanded ? "닫기" : "열기"}`}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    setExpandedId((cur) => (cur === e.id ? null : e.id));
                  }
                }}
                style={{ touchAction: "manipulation" }}
                className={clsx(
                  "rounded-2xl border overflow-hidden cursor-pointer hover:bg-white/5 hover:border-white/20 transition-colors",
                  isMe
                    ? "bg-amber-400/5 border-amber-400/50 shadow-[0_0_24px_-6px_rgba(251,191,36,0.4)]"
                    : "bg-white/5 border-white/10"
                )}
              >
                <div className="p-3 md:p-4 flex items-center gap-3 md:gap-4">
                  <div
                    className={clsx(
                      "shrink-0 rounded-full flex items-center justify-center font-black border",
                      isTopThree
                        ? "w-12 h-12 md:w-14 md:h-14 text-xl md:text-2xl"
                        : "w-10 h-10 md:w-12 md:h-12 text-sm md:text-base",
                      rank === 0
                        ? "bg-amber-400/20 text-amber-200 border-amber-400/60 shadow-[0_0_16px_-4px_rgba(251,191,36,0.7)]"
                        : rank === 1
                        ? "bg-zinc-300/10 text-zinc-200 border-zinc-300/40"
                        : rank === 2
                        ? "bg-orange-500/10 text-orange-200 border-orange-500/40"
                        : "bg-white/5 text-zinc-400 border-white/10"
                    )}
                    aria-label={`${rank + 1}위`}
                  >
                    {trophy ?? rank + 1}
                  </div>
                  {def ? (
                    <div className="shrink-0 flex items-center justify-center">
                      <CharacterAvatar def={def} size="sm" />
                    </div>
                  ) : null}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isOnline && (
                        <span
                          aria-label="온라인"
                          title="5분 이내 활동"
                          className="inline-block w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                        />
                      )}
                      <h2 className="text-base md:text-lg font-bold text-white break-words">
                        {e.display_name}
                      </h2>
                    </div>
                    <p className="text-[11px] md:text-xs text-zinc-400 mt-0.5 whitespace-nowrap">
                      전시 {e.showcase_count ?? 0}장 · 부수기{" "}
                      {e.sabotage_wins ?? 0}회
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
                      </>
                    ) : mode === "pet" ? (
                      <>
                        <div className="text-2xl md:text-3xl font-black text-fuchsia-300 tabular-nums leading-none inline-flex items-center gap-1">
                          <span aria-hidden>🐾</span>
                          {(e.pet_score ?? 0).toLocaleString("ko-KR")}
                        </div>
                        <div className="mt-1 text-[10px] text-fuchsia-300/70 uppercase tracking-wider">
                          MAX 500
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
                      </>
                    )}
                  </div>
                  <span
                    aria-hidden
                    className={clsx(
                      "shrink-0 w-6 h-6 rounded-full flex items-center justify-center bg-white/5 border border-white/10 text-zinc-300 text-[11px] transition-transform",
                      isExpanded ? "rotate-180" : "rotate-0"
                    )}
                  >
                    ▾
                  </span>
                </div>

                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      key="stats"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 md:px-4 pb-3 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        {mode === "rank" && (
                          <>
                            <StatChip
                              icon="🏆"
                              label="PCL10"
                              value={e.psa_10 ?? 0}
                              accent="text-amber-300"
                            />
                            <StatChip
                              icon="💥"
                              label="부수기 승"
                              value={e.sabotage_wins ?? 0}
                              accent="text-rose-300"
                            />
                            <StatChip
                              icon="🛡️"
                              label="전시 중"
                              value={e.showcase_count ?? 0}
                              accent="text-emerald-300"
                            />
                          </>
                        )}
                        {mode === "power" && (
                          <>
                            <StatChip
                              icon="⚔️"
                              label="전투력"
                              value={e.center_power ?? 0}
                              accent="text-rose-300"
                            />
                            <StatChip
                              icon="📖"
                              label="도감"
                              value={e.pokedex_count ?? 0}
                              accent="text-emerald-300"
                            />
                            <StatChip
                              icon="🛡️"
                              label="전시 중"
                              value={e.showcase_count ?? 0}
                              accent="text-amber-300"
                            />
                          </>
                        )}
                        {mode === "pet" && (
                          <>
                            <StatChip
                              icon="🐾"
                              label="펫 점수"
                              value={e.pet_score ?? 0}
                              accent="text-fuchsia-300"
                            />
                            <StatChip
                              icon="🃏"
                              label="펫 슬롯"
                              value={petCount}
                              suffix=" / 5"
                              accent="text-amber-300"
                            />
                            <StatChip
                              icon="🏆"
                              label="PCL10"
                              value={e.psa_10 ?? 0}
                              accent="text-emerald-300"
                            />
                          </>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {mode === "pet" && (e.main_cards?.length ?? 0) > 0 && (
                  <div className="px-3 md:px-4 pb-3 -mt-1 flex flex-wrap gap-1.5">
                    {(e.main_cards ?? []).map((mc) => {
                      const rstyle = RARITY_STYLE[mc.rarity as Rarity];
                      return (
                        <span
                          key={mc.id}
                          className={clsx(
                            "text-[10px] font-black px-2 py-1 rounded-md",
                            rstyle?.badge ?? "bg-white/10 text-zinc-200"
                          )}
                          title={`${mc.rarity} PCL${mc.grade}`}
                        >
                          {mc.rarity}
                        </span>
                      );
                    })}
                  </div>
                )}

                <div
                  className="px-3 md:px-4 pb-3 flex items-center gap-2"
                  onClick={(ev) => ev.stopPropagation()}
                >
                  <Link
                    href={`/center/${encodeURIComponent(e.user_id)}`}
                    aria-label={`${e.display_name}님의 포켓몬센터 방문`}
                    style={{ touchAction: "manipulation" }}
                    onClick={(ev) => ev.stopPropagation()}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 px-3 rounded-xl bg-gradient-to-r from-fuchsia-500/90 to-indigo-500/90 hover:from-fuchsia-500 hover:to-indigo-500 active:scale-[0.98] text-white text-sm font-bold transition"
                  >
                    🏛️ 센터 방문
                  </Link>
                  {!isMe && (
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setTauntTarget(e);
                      }}
                      aria-label={`${e.display_name}에게 조롱 보내기`}
                      style={{ touchAction: "manipulation" }}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 px-3 rounded-xl bg-gradient-to-r from-rose-500/90 to-amber-500/90 hover:from-rose-500 hover:to-amber-500 active:scale-[0.98] text-white text-sm font-bold transition"
                    >
                      🔥 조롱하기
                    </button>
                  )}
                </div>
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

function StatChip({
  icon,
  label,
  value,
  suffix,
  accent,
}: {
  icon: string;
  label: string;
  value: number;
  suffix?: string;
  accent: string;
}) {
  return (
    <div className="flex flex-col items-start gap-0.5 px-2.5 py-2 rounded-xl bg-white/[0.03] border border-white/10">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500">
        {icon} {label}
      </span>
      <span className={clsx("text-sm md:text-base font-black tabular-nums", accent)}>
        {value.toLocaleString("ko-KR")}
        {suffix && (
          <span className="text-[10px] text-zinc-500 font-semibold">
            {suffix}
          </span>
        )}
      </span>
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
