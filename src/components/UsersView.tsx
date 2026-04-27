"use client";

import PokeLoader from "./PokeLoader";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import clsx from "clsx";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "@/lib/useIsMobile";
import {
  fetchUserActivity,
  fetchUserRankings,
  sendTaunt,
  type RankingMainCard,
  type RankingRow,
  type UserActivityEvent,
} from "@/lib/db";
import { notifyRankChange, notifyTaunt } from "@/lib/discord";
import { usePresence } from "@/lib/usePresence";
import { getCard, SETS } from "@/lib/sets";
import {
  RARITY_LABEL,
  RARITY_STYLE,
  cardFxClass,
  compareRarity,
} from "@/lib/rarity";
import type { Rarity } from "@/lib/types";
import PageBackdrop from "./PageBackdrop";
import Portal from "./Portal";
import { getCharacter } from "@/lib/profile";
import { CharacterAvatar } from "./ProfileView";

type RankingMode = "rank" | "power" | "pet";

export default function UsersView() {
  const { user: currentUser } = useAuth();
  const reduce = useReducedMotion();
  const isMobile = useIsMobile();
  const onlineSet = usePresence(currentUser?.id);
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<RankingMode>("rank");
  // 탭 전환 시 랭킹 리스트 전체 재정렬 + framer-motion layout 애니메이션이
  // 메인 스레드를 막아 클릭이 끊겨 보이는 문제 → useTransition 으로
  // 우선순위를 낮춰서 탭 버튼 시각 피드백이 즉시 반영되게 한다.
  const [, startTabTransition] = useTransition();
  const switchMode = useCallback(
    (next: RankingMode) => {
      if (next === mode) return;
      startTabTransition(() => setMode(next));
    },
    [mode]
  );
  const [tauntTarget, setTauntTarget] = useState<RankingRow | null>(null);
  const [petDetail, setPetDetail] = useState<RankingMainCard | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activityCache, setActivityCache] = useState<
    Record<string, UserActivityEvent[]>
  >({});
  const [activityLoading, setActivityLoading] = useState<
    Record<string, boolean>
  >({});

  // 캐시/in-flight 상태는 ref 로 관리. 이전엔 deps 에 activityCache /
  // activityLoading state 객체가 있어서 setState 마다 effect 가 4회 재실행
  // 됐었음 — 모바일에서 탭/펼치기 응답이 끊겨 보이는 보조 원인이었음.
  // 이제 effect 는 expandedId / mode 변경에만 반응.
  const cacheRef = useRef<Record<string, UserActivityEvent[]>>({});
  const loadingRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    if (!expandedId) return;
    const key = `${expandedId}::${mode}`;
    if (cacheRef.current[key] !== undefined) return;
    if (loadingRef.current[key]) return;
    loadingRef.current[key] = true;
    setActivityLoading((prev) => ({ ...prev, [key]: true }));
    let cancelled = false;
    fetchUserActivity(expandedId, mode)
      .then((events) => {
        if (cancelled) return;
        cacheRef.current[key] = events;
        loadingRef.current[key] = false;
        setActivityCache((prev) => ({ ...prev, [key]: events }));
        setActivityLoading((prev) => ({ ...prev, [key]: false }));
      })
      .catch(() => {
        if (cancelled) return;
        cacheRef.current[key] = [];
        loadingRef.current[key] = false;
        setActivityCache((prev) => ({ ...prev, [key]: [] }));
        setActivityLoading((prev) => ({ ...prev, [key]: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [expandedId, mode]);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetchUserRankings();
    setRows(r);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Detect ranking-position changes for the current user across all 3 tabs
  // and fire a Discord webhook on first observation.
  useEffect(() => {
    if (!currentUser || rows.length === 0) return;
    const sortBy = (
      m: RankingMode,
      arr: RankingRow[]
    ): RankingRow[] =>
      arr.slice().sort((a, b) => {
        if (m === "power") {
          const ap = a.center_power ?? 0;
          const bp = b.center_power ?? 0;
          if (ap !== bp) return bp - ap;
        } else if (m === "pet") {
          const ap = a.pet_score ?? 0;
          const bp = b.pet_score ?? 0;
          if (ap !== bp) return bp - ap;
        } else if (a.rank_score !== b.rank_score) {
          return b.rank_score - a.rank_score;
        }
        return b.points - a.points;
      });
    const findRank = (m: RankingMode) => {
      const sorted = sortBy(m, rows);
      const idx = sorted.findIndex((r) => r.id === currentUser.id);
      return idx < 0 ? 0 : idx + 1;
    };
    const tabs: RankingMode[] = ["rank", "power", "pet"];
    for (const m of tabs) {
      const next = findRank(m);
      if (next === 0) continue;
      const key = `rank-pos:${currentUser.id}:${m}`;
      const prevRaw =
        typeof window !== "undefined"
          ? window.localStorage.getItem(key)
          : null;
      const prev = prevRaw ? parseInt(prevRaw, 10) : 0;
      if (prev > 0 && prev !== next) {
        notifyRankChange(currentUser.display_name, m, prev, next);
      }
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(key, String(next));
        }
      } catch {
        // ignore quota
      }
    }
  }, [rows, currentUser]);

  // Pre-sort once per `rows` change for all three modes. Switching tabs
  // now just swaps a reference instead of re-sorting (and recreating)
  // the array — cheaper and lets React preserve referential equality
  // across mode switches so motion.li keys with stable ids actually
  // match prior children.
  const sortedByMode = useMemo(() => {
    const rankSort = (a: RankingRow, b: RankingRow) => {
      if (a.rank_score !== b.rank_score) return b.rank_score - a.rank_score;
      return b.points - a.points;
    };
    const powerSort = (a: RankingRow, b: RankingRow) => {
      const ap = a.center_power ?? 0;
      const bp = b.center_power ?? 0;
      if (ap !== bp) return bp - ap;
      return b.points - a.points;
    };
    const petSort = (a: RankingRow, b: RankingRow) => {
      const ap = a.pet_score ?? 0;
      const bp = b.pet_score ?? 0;
      if (ap !== bp) return bp - ap;
      return b.points - a.points;
    };
    return {
      rank: rows.slice().sort(rankSort),
      power: rows.slice().sort(powerSort),
      pet: rows.slice().sort(petSort),
    } as Record<RankingMode, RankingRow[]>;
  }, [rows]);
  const entries = sortedByMode[mode];

  return (
    <div className="relative max-w-3xl mx-auto px-4 md:px-6 py-3 md:py-6 fade-in">
      <PageBackdrop tone="stadium" />
      <div className="inline-flex items-stretch rounded-xl bg-white/5 border border-white/10 p-1">
        <button
          type="button"
          onClick={() => switchMode("rank")}
          style={{ touchAction: "manipulation" }}
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
          onClick={() => switchMode("power")}
          style={{ touchAction: "manipulation" }}
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
          onClick={() => switchMode("pet")}
          style={{ touchAction: "manipulation" }}
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
          전투력 = <b className="text-zinc-200">전시 슬랩</b>(희귀도×PCL) +{" "}
          <b className="text-emerald-200">도감 보너스</b> +{" "}
          <b className="text-fuchsia-200">펫 점수</b>. 펫 슬랩이 강할수록(MUR
          최강) 전투력이 함께 올라요.
        </p>
      )}
      {mode === "pet" && (
        <p className="mt-2 text-[11px] text-zinc-400 leading-snug">
          펫 점수 = 등록한 PCL10 펫 슬랩 (최대 10장) 의{" "}
          <b className="text-zinc-200">희귀도 점수</b>(SR 5·MA 6·SAR 7·UR 8·MUR
          10) × 10 합산. 최대{" "}
          <b className="text-fuchsia-300">1,000</b>점.
        </p>
      )}

      {loading ? (
        <div className="mt-12 flex items-center justify-center">
          <PokeLoader size="md" label="랭킹 불러오는 중..." />
        </div>
      ) : entries.length === 0 ? (
        <p className="mt-16 text-center text-zinc-400 text-sm">
          아직 사용자가 없습니다.
        </p>
      ) : (
        // Stable LayoutGroup id — previously `rankings-${mode}` so every
        // tab change rebuilt the layout context and re-mounted every
        // motion.li with a fresh spring, which is what caused the
        // "뚝뚝" jank. Stable id lets framer reuse the layout cache and
        // morph rows in place.
        <LayoutGroup id="rankings">
        <ul className="mt-6 space-y-2.5">
          {entries.map((e, rank) => {
            const isMe = currentUser?.id === e.id;
            const def = getCharacter(e.character);
            // 온라인 dot 발화: 실시간 presence channel OR 5분 이내
            // last_seen_at heartbeat. presence 가 RLS / 네트워크로
            // 실패해도 last_seen 으로 fallback.
            const isOnline =
              onlineSet.has(e.id) ||
              (typeof e.seconds_since_seen === "number" &&
                e.seconds_since_seen < 300);
            const isExpanded = expandedId === e.id;
            const isTopThree = rank < 3;
            const trophy = rank === 0 ? "🏆" : rank === 1 ? "🥈" : rank === 2 ? "🥉" : null;

            return (
              <motion.li
                key={e.id}
                // 모바일에서는 layout="position" 을 끈다. 50+ 행을 한꺼번에
                // 측정/리페인트하는 비용이 mid-tier 모바일 GPU 에서 200~400ms
                // 스톨을 만들어 탭 응답이 끊겨 보이는 주범이었음. CSS 위치
                // 점프로 즉시 재정렬되고, 데스크탑은 부드럽게 morph.
                layout={reduce || isMobile ? false : "position"}
                initial={reduce || isMobile ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: reduce || isMobile ? 0 : Math.min(rank * 0.015, 0.2),
                  layout: { duration: 0.18, ease: "easeOut" },
                }}
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
                  <motion.div
                    whileHover={
                      reduce || !isTopThree
                        ? undefined
                        : {
                            rotate: [0, -10, 10, -8, 8, 0],
                            scale: 1.1,
                            transition: { duration: 0.5, ease: "easeInOut" },
                          }
                    }
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
                  </motion.div>
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
                          MAX 1,000
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
                      key="activity"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className="overflow-hidden"
                    >
                      {/* 자산 요약 — 사용자 요청으로 포인트/랭킹점수/전투력/
                          펫점수 노출 제거. 도감만 모든 탭에서 공통 표시. */}
                      <div className="px-3 md:px-4 pt-1 pb-2">
                        <ProfileStatChip
                          label="도감"
                          value={`${e.pokedex_count ?? 0}`}
                          tone="emerald"
                        />
                      </div>
                      {/* 펫 탭 — 등록된 펫 슬랩 카드 이미지 썸네일.
                          탭하면 카드 정보 모달이 뜸. 희귀도 내림차순
                          정렬 (MUR → C). */}
                      {mode === "pet" &&
                        (e.main_cards?.length ?? 0) > 0 && (
                          <div className="px-3 md:px-4 pt-2 pb-3">
                            <div
                              className="grid gap-2"
                              style={{
                                gridTemplateColumns:
                                  "repeat(auto-fill, minmax(72px, 1fr))",
                              }}
                            >
                              {[...(e.main_cards ?? [])]
                                .sort((a, b) =>
                                  compareRarity(a.rarity as Rarity, b.rarity as Rarity)
                                )
                                .map((mc) => {
                                const rstyle =
                                  RARITY_STYLE[mc.rarity as Rarity];
                                const card = getCard(mc.card_id);
                                return (
                                  <button
                                    key={mc.id}
                                    type="button"
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      setPetDetail(mc);
                                    }}
                                    aria-label={`${card?.name ?? mc.card_id} 카드 정보 보기`}
                                    style={{ touchAction: "manipulation" }}
                                    className={clsx(
                                      "relative aspect-[5/7] rounded-lg overflow-hidden ring-2 bg-zinc-900 active:scale-95 transition-transform",
                                      rstyle?.frame ?? "ring-zinc-500/30"
                                    )}
                                  >
                                    {card?.imageUrl ? (
                                      <img
                                        src={card.imageUrl}
                                        alt={card.name}
                                        loading="lazy"
                                        decoding="async"
                                        draggable={false}
                                        className="absolute inset-0 w-full h-full object-contain bg-zinc-900 select-none pointer-events-none"
                                        style={{
                                          WebkitTouchCallout: "none",
                                          WebkitUserSelect: "none",
                                        }}
                                      />
                                    ) : (
                                      <div className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-500 px-1 text-center">
                                        {card?.name ?? mc.card_id}
                                      </div>
                                    )}
                                    <span className="absolute top-1 left-1 text-[9px] font-black px-1 py-0.5 rounded bg-black/70 text-white">
                                      PCL{mc.grade}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      <ActivityFeed
                        events={activityCache[`${e.id}::${mode}`]}
                        loading={activityLoading[`${e.id}::${mode}`] === true}
                        mode={mode}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

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
        </LayoutGroup>
      )}

      <AnimatePresence>
        {tauntTarget && (
          <TauntComposer
            target={tauntTarget}
            onClose={() => setTauntTarget(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {petDetail && (
          <PetCardModal
            entry={petDetail}
            onClose={() => setPetDetail(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function PetCardModal({
  entry,
  onClose,
}: {
  entry: RankingMainCard;
  onClose: () => void;
}) {
  const card = getCard(entry.card_id);
  const rarity = entry.rarity as Rarity;
  const rstyle = RARITY_STYLE[rarity];
  const fx = cardFxClass(rarity);
  const setName = card ? SETS[card.setCode]?.name : null;

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
          className="relative w-full max-w-sm bg-zinc-900 border border-fuchsia-500/40 rounded-2xl overflow-hidden shadow-2xl"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={(ev) => ev.stopPropagation()}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="absolute top-2 right-2 z-10 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center text-base"
          >
            ✕
          </button>

          <div className="p-4">
            <div
              className={clsx(
                "relative mx-auto rounded-xl overflow-hidden isolate ring-2 bg-zinc-900",
                rstyle?.frame ?? "ring-zinc-500/30"
              )}
              style={{ aspectRatio: "5 / 7", maxWidth: "260px" }}
            >
              {card?.imageUrl ? (
                <img
                  src={card.imageUrl}
                  alt={card.name}
                  draggable={false}
                  className="absolute inset-0 w-full h-full object-contain bg-zinc-900 select-none pointer-events-none"
                  style={{
                    WebkitTouchCallout: "none",
                    WebkitUserSelect: "none",
                  }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-400">
                  이미지 없음
                </div>
              )}
              {fx && <div className={fx} />}
              <span className="absolute top-2 left-2 text-[11px] font-black px-2 py-0.5 rounded bg-black/75 text-white shadow-lg">
                PCL{entry.grade}
              </span>
            </div>

            <div className="mt-4 text-center">
              <h3 className="text-base md:text-lg font-bold text-white break-words">
                {card?.name ?? entry.card_id}
              </h3>
              <div className="mt-2 flex items-center justify-center gap-2 flex-wrap">
                <span
                  className={clsx(
                    "text-[11px] font-black px-2 py-0.5 rounded",
                    rstyle?.badge ?? "bg-white/10 text-zinc-200"
                  )}
                >
                  {rarity}
                </span>
                <span className="text-[11px] text-zinc-400">
                  {RARITY_LABEL[rarity] ?? rarity}
                </span>
                {card && (
                  <span className="text-[11px] text-zinc-500">
                    · #{card.number}
                  </span>
                )}
              </div>
              {setName && (
                <p className="mt-1 text-[11px] text-zinc-500">{setName}</p>
              )}
            </div>

            {card && (
              <Link
                href={`/card/${encodeURIComponent(card.id)}`}
                onClick={onClose}
                className="mt-4 w-full inline-flex items-center justify-center h-10 rounded-xl bg-gradient-to-r from-fuchsia-500/90 to-violet-500/90 hover:from-fuchsia-500 hover:to-violet-500 active:scale-[0.98] text-white text-sm font-bold transition"
              >
                카드 상세 페이지
              </Link>
            )}
          </div>
        </motion.div>
      </motion.div>
    </Portal>
  );
}

function formatRelativeKo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diffMs = Date.now() - t;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "방금 전";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  const d = new Date(t);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function modeAccent(mode: RankingMode): string {
  if (mode === "power") return "text-rose-300";
  if (mode === "pet") return "text-fuchsia-300";
  return "text-amber-300";
}

const STAT_TONES: Record<string, { bg: string; text: string }> = {
  amber: { bg: "bg-amber-400/10 border-amber-400/30", text: "text-amber-200" },
  rose: { bg: "bg-rose-400/10 border-rose-400/30", text: "text-rose-200" },
  violet: { bg: "bg-violet-400/10 border-violet-400/30", text: "text-violet-200" },
  emerald: { bg: "bg-emerald-400/10 border-emerald-400/30", text: "text-emerald-200" },
};

function ProfileStatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "amber" | "rose" | "violet" | "emerald";
}) {
  const t = STAT_TONES[tone];
  return (
    <div
      className={clsx(
        "rounded-lg border px-2 py-1.5 text-center min-w-0",
        t.bg
      )}
    >
      <div className="text-[9px] uppercase tracking-wider text-zinc-400 leading-tight">
        {label}
      </div>
      <div
        className={clsx(
          "mt-0.5 text-[11px] md:text-xs font-black tabular-nums truncate",
          t.text
        )}
      >
        {value}
      </div>
    </div>
  );
}

const ActivityFeed = memo(function ActivityFeed({
  events,
  loading,
  mode,
}: {
  events: UserActivityEvent[] | undefined;
  loading: boolean;
  mode: RankingMode;
}) {
  if (loading || events === undefined) {
    return (
      <div className="px-3 md:px-4 pb-3 space-y-1.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-9 rounded-lg bg-white/[0.04] border border-white/10 animate-pulse"
          />
        ))}
      </div>
    );
  }
  if (events.length === 0) {
    return (
      <div className="px-3 md:px-4 pb-3">
        <p className="text-center text-xs text-zinc-500 py-3">
          최근 활동 없음
        </p>
      </div>
    );
  }
  const accent = modeAccent(mode);
  return (
    <div className="px-3 md:px-4 pb-3">
      <ul className="space-y-1">
        {events.map((ev, idx) => {
          // 카드 코드(m2-086) → 포켓몬 한글 이름 치환. card_id 가 없거나
          // (예: "?") 카드 카탈로그에 없으면 라벨만 노출.
          const card = ev.card_id ? getCard(ev.card_id) : null;
          const subject = card?.name ?? null;
          const sign = ev.points >= 0 ? "+" : "";
          const isLoss = ev.points < 0;
          return (
            <li
              key={`${ev.source}-${ev.occurred_at}-${idx}`}
              className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-white/[0.03] border border-white/10"
            >
              <span className="flex-1 min-w-0 text-[12px] text-zinc-200 truncate">
                {subject ? `${ev.label} · ${subject}` : ev.label}
              </span>
              <span
                className={clsx(
                  "shrink-0 text-[12px] font-black tabular-nums",
                  isLoss ? "text-rose-300" : accent
                )}
              >
                {sign}
                {ev.points.toLocaleString("ko-KR")}p
              </span>
              <span className="shrink-0 text-[10px] text-zinc-500 tabular-nums">
                {formatRelativeKo(ev.occurred_at)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
});

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
    notifyTaunt(user.display_name, target.display_name, text);
    setDone(true);
    setTimeout(onClose, 900);
  }, [user, msg, sending, target.user_id, target.display_name, onClose]);

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
