"use client";

import PokeLoader, { CenteredPokeLoader } from "./PokeLoader";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useSearchParams } from "next/navigation";
import clsx from "clsx";
import {
  RARITY_ORDER,
  RARITY_STYLE,
  compareRarity,
} from "@/lib/rarity";
import type { Card, GiftQuota, Rarity } from "@/lib/types";
import { SETS, getCard } from "@/lib/sets";
import { useAuth } from "@/lib/auth";
import {
  bulkDeletePclByGrade,
  createGift,
  fetchAllGradingsWithDisplay,
  fetchGiftQuota,
  fetchWallet,
  type PclGradingWithDisplay,
  type WalletSnapshot,
} from "@/lib/db";
import { CARD_CAP_LABEL, PCL_CAP_LABEL } from "@/lib/limits";
import Link from "next/link";
import { fetchProfile } from "@/lib/profile";
import { fetchMyDefensePetIds } from "@/lib/gym/db";
import { notifyGift } from "@/lib/discord";
import PokeCard from "./PokeCard";
import PclSlab from "./PclSlab";
import CoinIcon from "./CoinIcon";
import PageHeader from "./PageHeader";
import PageBackdrop from "./PageBackdrop";
import Portal from "./Portal";
import UserSelect from "./UserSelect";
import { groupGradings } from "@/lib/cards/group-gradings";

type Mode = "cards" | "pcl";
type RarityFilter = "ALL" | Rarity;

export default function WalletView() {
  const { user } = useAuth();
  const params = useSearchParams();
  const initialMode: Mode = params.get("tab") === "cards" ? "cards" : "pcl";
  const [mode, setMode] = useState<Mode>(initialMode);

  const [snap, setSnap] = useState<WalletSnapshot>({
    items: [],
    packsOpenedBySet: { m2a: 0, m2: 0, sv8: 0, sv2a: 0, sv8a: 0, sv5a: 0, sv10: 0, sv11b: 0, sv11w: 0, m1l: 0, m1s: 0, m3: 0, m4: 0, s4a: 0, s6a: 0, s7r: 0, s8ap: 0, s8b: 0, s9a: 0 },
    totalCards: 0,
  });
  const [pcl, setPcl] = useState<PclGradingWithDisplay[]>([]);
  const [petIds, setPetIds] = useState<Set<string>>(new Set());
  // grading_id → 펫 등록된 type. 사용 위치 라벨 ("펫 (물)") 용.
  const [petTypeMap, setPetTypeMap] = useState<Map<string, string>>(new Map());
  const [defenseIds, setDefenseIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>("ALL");

  const userId = user?.id ?? null;
  const refresh = useCallback(async () => {
    if (!userId) return;
    const [w, g, p, def] = await Promise.all([
      fetchWallet(userId),
      fetchAllGradingsWithDisplay(userId),
      fetchProfile(userId),
      fetchMyDefensePetIds(userId),
    ]);
    setSnap(w);
    setPcl(g);
    // spec 2-1: 펫은 main_cards_by_type 으로 옮겨감. legacy main_card_ids
    // 와 union 으로 펫 표시. type 정보는 별도 Map 으로 보존 (사용 위치
    // 라벨에 "펫 (물)" 처럼 type 표기 위해).
    const petSet = new Set<string>(p.main_card_ids ?? []);
    const typeMap = new Map<string, string>();
    for (const [type, arr] of Object.entries(p.main_cards_by_type ?? {})) {
      for (const c of arr) {
        petSet.add(c.id);
        typeMap.set(c.id, type);
      }
    }
    setPetIds(petSet);
    setPetTypeMap(typeMap);
    setDefenseIds(def);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const items = useMemo(() => {
    return snap.items
      .filter((e) =>
        rarityFilter === "ALL" ? true : e.card.rarity === rarityFilter
      )
      .sort((a, b) => {
        const rd = compareRarity(a.card.rarity, b.card.rarity);
        if (rd !== 0) return rd;
        return a.card.number.localeCompare(b.card.number);
      });
  }, [snap.items, rarityFilter]);

  const pclItems = useMemo(() => {
    return pcl
      .map((g) => {
        const card = getCard(g.card_id);
        if (!card) return null;
        const isPet = petIds.has(g.id);
        const isDefense = defenseIds.has(g.id);
        const petType = isPet ? petTypeMap.get(g.id) ?? null : null;
        return {
          grading: g,
          card,
          isPet,
          isDisplayed: g.displayed,
          isDefense,
          petType,
        };
      })
      .filter(
        (v): v is {
          grading: PclGradingWithDisplay;
          card: Card;
          isPet: boolean;
          isDisplayed: boolean;
          isDefense: boolean;
          petType: string | null;
        } => v !== null
      )
      .sort((a, b) => {
        const aBusy = a.isDisplayed || a.isPet || a.isDefense ? 1 : 0;
        const bBusy = b.isDisplayed || b.isPet || b.isDefense ? 1 : 0;
        if (aBusy !== bBusy) return aBusy - bBusy;
        const rd = compareRarity(a.card.rarity, b.card.rarity);
        if (rd !== 0) return rd;
        return b.grading.grade - a.grading.grade;
      });
  }, [pcl, petIds, petTypeMap, defenseIds]);

  const rarityCounts = useMemo(() => {
    const counts = new Map<Rarity, number>();
    for (const it of snap.items) {
      counts.set(
        it.card.rarity,
        (counts.get(it.card.rarity) ?? 0) + it.count
      );
    }
    return counts;
  }, [snap.items]);

  const totalPacks = useMemo(
    () =>
      Object.values(snap.packsOpenedBySet).reduce((s, n) => s + n, 0),
    [snap.packsOpenedBySet]
  );


  return (
    <div className="relative max-w-6xl mx-auto px-4 md:px-6 py-3 md:py-6 fade-in">
      <PageBackdrop tone="amber" />
      <PageHeader title="내 카드지갑" />

      <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
        <div className="inline-flex items-stretch rounded-xl bg-white/5 border border-white/10 p-1">
          <ModeTab active={mode === "pcl"} onClick={() => setMode("pcl")}>
            PCL 감별
            <CountBadge value={pclItems.length} cap={PCL_CAP_LABEL} />
          </ModeTab>
          <ModeTab active={mode === "cards"} onClick={() => setMode("cards")}>
            보유 카드
            <CountBadge value={snap.totalCards} cap={CARD_CAP_LABEL} />
          </ModeTab>
        </div>
        {/* 일괄 판매 기능 제거됨 — 카드 처리는 감별 페이지에서 자동 삭제로 일원화. */}
      </div>

      {loading ? (
        <CenteredPokeLoader />
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          {mode === "cards" ? (
            <motion.div
              key="cards"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              <CardsMode
                items={items}
                rarityCounts={rarityCounts}
                rarityFilter={rarityFilter}
                setRarityFilter={setRarityFilter}
              />
            </motion.div>
          ) : (
            <motion.div
              key="pcl"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              <PclMode
                items={pclItems}
                userId={user?.id ?? null}
                onAfterGift={refresh}
                onAfterBulkDelete={refresh}
              />
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}

function CardsMode({
  items,
  rarityCounts,
  rarityFilter,
  setRarityFilter,
}: {
  items: { card: Card; count: number }[];
  rarityCounts: Map<Rarity, number>;
  rarityFilter: RarityFilter;
  setRarityFilter: (r: RarityFilter) => void;
}) {
  const reduce = useReducedMotion();

  // 무한 스크롤 — 30종씩 점진 로드. PclMode 와 동일 패턴.
  const [visibleCount, setVisibleCount] = useState(WALLET_PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // items 또는 rarityFilter 가 바뀌면 첫 페이지로 리셋.
  useEffect(() => {
    setVisibleCount(WALLET_PAGE_SIZE);
  }, [items, rarityFilter]);

  useEffect(() => {
    if (items.length <= WALLET_PAGE_SIZE) return;
    const node = sentinelRef.current;
    if (!node) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisibleCount((n) =>
              n >= items.length ? n : Math.min(n + WALLET_PAGE_SIZE, items.length)
            );
          }
        }
      },
      { rootMargin: "200px 0px" }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [items.length]);

  const visibleItems = useMemo(
    () => items.slice(0, visibleCount),
    [items, visibleCount]
  );
  const hasMore = visibleCount < items.length;

  return (
    <>
      <div className="mt-4 flex items-center gap-1.5 flex-wrap">
        <FilterPill
          active={rarityFilter === "ALL"}
          onClick={() => setRarityFilter("ALL")}
        >
          전체
        </FilterPill>
        {RARITY_ORDER.map((r) => {
          const count = rarityCounts.get(r) ?? 0;
          if (count === 0 && rarityFilter !== r) return null;
          return (
            <FilterPill
              key={r}
              active={rarityFilter === r}
              onClick={() => setRarityFilter(r)}
            >
              <span
                className={clsx(
                  "inline-block w-1.5 h-1.5 rounded-full mr-1",
                  RARITY_STYLE[r].badge
                )}
              />
              {r}
              <span className="ml-1 text-[10px] opacity-60 tabular-nums">
                {count}
              </span>
            </FilterPill>
          );
        })}
      </div>

      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <motion.div
          key={`cards-${rarityFilter}`}
          className="mt-4 md:mt-5 grid grid-cols-3 gap-2 md:gap-3"
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: {
              transition: {
                staggerChildren: reduce ? 0 : 0.02,
                delayChildren: reduce ? 0 : 0.04,
              },
            },
          }}
        >
          {visibleItems.map(({ card, count }) => (
            <motion.div
              key={card.id}
              variants={{
                hidden: reduce
                  ? { opacity: 1, y: 0 }
                  : { opacity: 0, y: 8, scale: 0.97 },
                show: {
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  transition: { duration: 0.26, ease: [0.2, 0.8, 0.2, 1] },
                },
              }}
            >
              <Link
                href={`/card/${encodeURIComponent(card.id)}`}
                className="relative flex flex-col items-center gap-1.5 rounded-xl p-1.5 active:scale-[0.97] transition-transform"
                style={{ touchAction: "manipulation" }}
              >
                <PokeCard card={card} revealed size="md" />
                {count > 1 && (
                  <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur text-white font-bold text-[10px] ring-1 ring-white/20 pointer-events-none">
                    ×{count}
                  </span>
                )}
                <div className="w-full text-center px-1 pointer-events-none">
                  <p className="text-[11px] text-zinc-300 leading-tight line-clamp-2">
                    {card.name}
                  </p>
                  <p className="text-[10px] text-zinc-500">
                    {SETS[card.setCode].name} · #{card.number}
                  </p>
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      )}
      {hasMore && (
        <div
          ref={sentinelRef}
          className="mt-6 flex items-center justify-center text-[11px] text-zinc-500"
        >
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 border-2 border-amber-400/40 border-t-amber-300 rounded-full animate-spin" />
            더 불러오는 중… ({visibleCount.toLocaleString("ko-KR")} /{" "}
            {items.length.toLocaleString("ko-KR")})
          </span>
        </div>
      )}
      {!hasMore && items.length > WALLET_PAGE_SIZE && (
        <p className="mt-6 text-center text-[10px] text-zinc-600">
          전체 {items.length.toLocaleString("ko-KR")}종 모두 표시
        </p>
      )}
    </>
  );
}

// 한 페이지에 보일 카드/슬랩 수. 무한 스크롤로 30개씩 추가.
const WALLET_PAGE_SIZE = 30;

function PclMode({
  items,
  userId,
  onAfterGift,
  onAfterBulkDelete,
}: {
  items: {
    grading: PclGradingWithDisplay;
    card: Card;
    isPet: boolean;
    isDisplayed: boolean;
    isDefense: boolean;
    petType: string | null;
  }[];
  userId: string | null;
  onAfterGift: () => void | Promise<void>;
  onAfterBulkDelete: () => void | Promise<void>;
}) {
  const reduce = useReducedMotion();
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [previewTarget, setPreviewTarget] = useState<{
    grading: PclGradingWithDisplay;
    card: Card;
  } | null>(null);
  const [giftTarget, setGiftTarget] = useState<{
    grading: PclGradingWithDisplay;
    card: Card;
  } | null>(null);

  // 무한 스크롤 — 30장씩 점진적 로드.
  const [visibleCount, setVisibleCount] = useState(WALLET_PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // PCL 슬랩은 (card_id, grade) 기준으로 그룹화 — 같은 카드의 같은
  // 등급 슬랩 여러 장은 한 칸으로 묶고 ×N 뱃지로 수량 표시.
  // 그룹 내 잠금 상태가 섞여 있으면 사용 가능한 첫 슬랩에 액션 적용.
  const groups = useMemo(
    () =>
      groupGradings(items, (it) => ({
        cardId: it.card.id,
        grade: it.grading.grade,
      })),
    [items]
  );
  const visibleGroups = useMemo(
    () => groups.slice(0, visibleCount),
    [groups, visibleCount]
  );
  const hasMore = visibleCount < groups.length;

  // items 가 바뀌면 (gift / refresh / 정렬 변경 등) 첫 페이지로 리셋.
  useEffect(() => {
    setVisibleCount(WALLET_PAGE_SIZE);
  }, [items]);

  // IntersectionObserver: sentinel 이 viewport 에 들어오면 다음 페이지 로드.
  // 그룹 단위로 페이지네이션 (중복 그룹화 후 길이 기준).
  useEffect(() => {
    const groupCount = groups.length;
    if (groupCount <= WALLET_PAGE_SIZE) return;
    const node = sentinelRef.current;
    if (!node) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisibleCount((n) =>
              n >= groupCount ? n : Math.min(n + WALLET_PAGE_SIZE, groupCount)
            );
          }
        }
      },
      { rootMargin: "200px 0px" }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [groups.length]);

  if (items.length === 0) {
    return (
      <div className="mt-12 rounded-2xl border border-dashed border-white/10 bg-white/5 py-12 md:py-14 flex flex-col items-center gap-3 text-center px-4">
        <span className="text-5xl">🧿</span>
        <p className="text-lg text-white font-semibold">
          아직 감별한 카드가 없습니다
        </p>
        <p className="text-sm text-zinc-400">
          PCL 감별 페이지에서 카드를 맡기고 등급을 받아보세요.
        </p>
        <Link
          href="/grading"
          className="mt-2 inline-flex items-center h-11 px-5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-indigo-500 text-white font-bold text-sm hover:scale-[1.03] transition"
        >
          감별 받으러 가기
        </Link>
      </div>
    );
  }
  return (
    <>
      {/* PCL 등급별 일괄 삭제 toolbar — 카드지갑 정리용. */}
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => setBulkDeleteOpen(true)}
          style={{ touchAction: "manipulation" }}
          className="h-9 px-3 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-200 text-[12px] font-bold hover:bg-rose-500/25 transition"
        >
          🗑️ PCL 일괄 삭제
        </button>
      </div>
      <motion.div
        className="mt-4 grid grid-cols-3 gap-2 md:gap-3 place-items-stretch"
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: {
            transition: {
              staggerChildren: reduce ? 0 : 0.025,
              delayChildren: reduce ? 0 : 0.04,
            },
          },
        }}
      >
        {visibleGroups.map((group) => {
          // 그룹 안에서 액션 가능한 첫 슬랩 선택 — 펫/전시/방어덱
          // 어디에도 안 묶인 것.
          const available = group.all.find(
            (it) => !it.isPet && !it.isDisplayed && !it.isDefense
          );
          const rep = available ?? group.rep;
          const { grading, card } = rep;
          const allLocked = !available;
          const lockedCount = group.all.filter(
            (it) => it.isPet || it.isDisplayed || it.isDefense
          ).length;
          const availableCount = group.count - lockedCount;
          const giftable = !allLocked && grading.grade >= 6;
          // 사용 위치 요약 — 그룹 내 모든 슬랩의 사용 위치를 카테고리별로
          // 카운트. "펫 (물 1, 불 1) · 체육관 1 · 전시 1" 같이 노출.
          const petLocations = new Map<string, number>();
          let defenseCount = 0;
          let displayCount = 0;
          for (const it of group.all) {
            if (it.isPet && it.petType) {
              petLocations.set(
                it.petType,
                (petLocations.get(it.petType) ?? 0) + 1
              );
            } else if (it.isPet) {
              petLocations.set("?", (petLocations.get("?") ?? 0) + 1);
            }
            if (it.isDefense) defenseCount += 1;
            if (it.isDisplayed) displayCount += 1;
          }
          const usageParts: string[] = [];
          if (petLocations.size > 0) {
            const inner = Array.from(petLocations.entries())
              .map(([t, n]) => (n > 1 ? `${t} ${n}` : t))
              .join(", ");
            usageParts.push(`펫(${inner})`);
          }
          if (defenseCount > 0)
            usageParts.push(`체육관${defenseCount > 1 ? ` ${defenseCount}` : ""}`);
          if (displayCount > 0)
            usageParts.push(`전시${displayCount > 1 ? ` ${displayCount}` : ""}`);
          const usageSummary = usageParts.join(" · ");
          // 우선순위: 체육관 > 펫 > 센터 (사용자 명시). 펫이면 type 도 함께.
          const badge = allLocked
            ? rep.isDefense
              ? { text: "⚔️ 체육관 사용중", cls: "bg-rose-500 text-white" }
              : rep.isPet
              ? {
                  text: rep.petType
                    ? `🐾 펫 (${rep.petType})`
                    : "🐾 펫 사용중",
                  cls: "bg-amber-400 text-zinc-950",
                }
              : rep.isDisplayed
              ? { text: "🏛️ 센터 사용중", cls: "bg-fuchsia-500 text-white" }
              : null
            : null;
          return (
            <motion.button
              key={`${card.id}@${grading.grade}`}
              type="button"
              onClick={() =>
                !allLocked && giftable && setPreviewTarget({ grading, card })
              }
              disabled={allLocked || !giftable}
              style={{ touchAction: "manipulation" }}
              variants={{
                hidden: reduce
                  ? { opacity: 1, y: 0 }
                  : { opacity: 0, y: 8, scale: 0.97 },
                show: {
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  transition: { duration: 0.26, ease: [0.2, 0.8, 0.2, 1] },
                },
              }}
              className={clsx(
                "relative flex flex-col items-center gap-1 w-full text-left active:scale-[0.98] transition",
                allLocked && "cursor-not-allowed",
                !allLocked && !giftable && "cursor-not-allowed"
              )}
              aria-disabled={allLocked || !giftable}
              title={
                lockedCount > 0
                  ? `총 ${group.count}장 · 사용가능 ${availableCount}장${
                      usageSummary ? ` · ${usageSummary}` : ""
                    }`
                  : `${group.count}장 보유 · 모두 사용가능`
              }
            >
              <div className="relative w-full">
                <div
                  className={clsx(
                    "transition",
                    allLocked && "opacity-45 grayscale saturate-50"
                  )}
                >
                  <PclSlab
                    card={card}
                    grade={grading.grade}
                    size="sm"
                    compact
                    quantity={group.count}
                  />
                </div>
                {allLocked && (
                  <div
                    aria-hidden
                    className="absolute inset-0 rounded-md bg-zinc-950/35 ring-1 ring-inset ring-white/10 pointer-events-none"
                  />
                )}
                {badge && (
                  <span
                    className={clsx(
                      "absolute -top-1.5 left-1/2 -translate-x-1/2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-black shadow-md whitespace-nowrap z-10",
                      badge.cls
                    )}
                  >
                    {badge.text}
                  </span>
                )}
              </div>
              <p
                className={clsx(
                  "w-full text-center text-[10px] leading-tight line-clamp-1 px-0.5",
                  allLocked ? "text-zinc-500" : "text-zinc-300"
                )}
              >
                {card.name}
              </p>
              <p className="w-full text-center text-[9px] leading-tight line-clamp-1 px-0.5 text-zinc-500">
                {SETS[card.setCode]?.name ?? card.setCode} · #{card.number}
              </p>
              {group.count > 1 && (
                <p
                  className={clsx(
                    "w-full text-center text-[9px] leading-tight line-clamp-1 px-0.5 tabular-nums",
                    availableCount > 0 ? "text-emerald-300/90" : "text-rose-300/80"
                  )}
                >
                  사용가능 {availableCount}/{group.count}
                  {usageSummary ? ` · ${usageSummary}` : ""}
                </p>
              )}
              {group.count === 1 && lockedCount === 1 && usageSummary && (
                <p className="w-full text-center text-[9px] leading-tight line-clamp-1 px-0.5 text-zinc-400">
                  {usageSummary}
                </p>
              )}
            </motion.button>
          );
        })}
      </motion.div>

      {hasMore && (
        <div
          ref={sentinelRef}
          className="mt-6 flex items-center justify-center text-[11px] text-zinc-500"
        >
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 border-2 border-fuchsia-400/40 border-t-fuchsia-300 rounded-full animate-spin" />
            더 불러오는 중… ({visibleCount.toLocaleString("ko-KR")} /{" "}
            {groups.length.toLocaleString("ko-KR")})
          </span>
        </div>
      )}
      {!hasMore && groups.length > WALLET_PAGE_SIZE && (
        <p className="mt-6 text-center text-[10px] text-zinc-600">
          전체 {items.length.toLocaleString("ko-KR")}장 ·{" "}
          {groups.length.toLocaleString("ko-KR")}종 표시
        </p>
      )}

      <SlabPreview
        target={previewTarget}
        onClose={() => setPreviewTarget(null)}
        onGift={() => {
          if (previewTarget) {
            setGiftTarget(previewTarget);
            setPreviewTarget(null);
          }
        }}
      />

      <SlabGiftComposer
        target={giftTarget}
        onClose={() => setGiftTarget(null)}
        onSuccess={async () => {
          setGiftTarget(null);
          await onAfterGift();
        }}
      />

      <AnimatePresence>
        {bulkDeleteOpen && userId && (
          <BulkDeletePclModal
            items={items}
            userId={userId}
            onClose={() => setBulkDeleteOpen(false)}
            onAfterDelete={async () => {
              setBulkDeleteOpen(false);
              await onAfterBulkDelete();
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function SlabPreview({
  target,
  onClose,
  onGift,
}: {
  target: { grading: PclGradingWithDisplay; card: Card } | null;
  onClose: () => void;
  onGift: () => void;
}) {
  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [target, onClose]);

  return (
    <AnimatePresence>
      {target && (
        <Portal>
          <motion.div
            key="preview-backdrop"
            className="fixed inset-0 z-[145] bg-black/85 backdrop-blur-md flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              paddingTop: "max(env(safe-area-inset-top, 0px), 12px)",
              paddingBottom: "max(env(safe-area-inset-bottom, 0px), 12px)",
              paddingLeft: 12,
              paddingRight: 12,
            }}
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-xs bg-zinc-950 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
              initial={{ scale: 0.94, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 12 }}
              transition={{ type: "spring", stiffness: 240, damping: 26 }}
            >
              <button
                onClick={onClose}
                aria-label="닫기"
                className="absolute top-2 right-2 z-10 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
                style={{ touchAction: "manipulation" }}
              >
                ✕
              </button>
              <div className="px-4 pt-5 pb-4 flex flex-col items-center gap-3">
                <PclSlab
                  card={target.card}
                  grade={target.grading.grade}
                  size="sm"
                />
                <div className="w-full text-center">
                  <h3 className="text-base font-black text-white">
                    {target.card.name}
                  </h3>
                  <p className="mt-0.5 text-[11px] text-zinc-400">
                    {SETS[target.card.setCode]?.name ?? target.card.setCode} · #
                    {target.card.number}
                  </p>
                  <p className="mt-1 text-[11px] font-bold text-fuchsia-200">
                    PCL {target.grading.grade} · {target.card.rarity}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onGift}
                  style={{ touchAction: "manipulation" }}
                  className="w-full h-11 rounded-xl bg-gradient-to-r from-amber-400 to-rose-500 text-zinc-950 font-black text-sm hover:scale-[1.02] active:scale-[0.98] transition"
                >
                  🎁 선물하기
                </button>
              </div>
            </motion.div>
          </motion.div>
        </Portal>
      )}
    </AnimatePresence>
  );
}

function SlabGiftComposer({
  target,
  onClose,
  onSuccess,
}: {
  target: { grading: PclGradingWithDisplay; card: Card } | null;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
}) {
  const { user } = useAuth();
  const [recipient, setRecipient] = useState("");
  const [priceRaw, setPriceRaw] = useState("0");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [quota, setQuota] = useState<GiftQuota | null>(null);

  useEffect(() => {
    if (!target) {
      setRecipient("");
      setPriceRaw("0");
      setMessage("");
      setError(null);
      setSuccess(false);
      setSending(false);
      return;
    }
    if (user) fetchGiftQuota(user.id).then(setQuota);
  }, [target, user]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [target, onClose]);

  const submit = async () => {
    if (!user || !target || !recipient.trim() || sending) return;
    const price = Math.max(0, Math.floor(Number(priceRaw) || 0));
    setSending(true);
    setError(null);
    const trimmedMsg = message.trim();
    const res = await createGift(
      user.id,
      recipient.trim(),
      target.grading.id,
      price,
      trimmedMsg || undefined
    );
    setSending(false);
    if (!res.ok) {
      setError(res.error ?? "선물 전송 실패");
      return;
    }
    notifyGift(
      user.display_name,
      recipient.trim(),
      target.card.id,
      target.grading.grade,
      price
    );
    setSuccess(true);
    setTimeout(onSuccess, 900);
  };

  return (
    <AnimatePresence>
      {target && (
        <Portal>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-[150] bg-black/85 backdrop-blur-md flex items-center justify-center"
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
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md bg-zinc-950/95 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{ maxHeight: "calc(100dvh - 24px)", height: "auto" }}
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.94, opacity: 0 }}
            transition={{ type: "tween", ease: [0.2, 0.8, 0.2, 1], duration: 0.22 }}
          >
            <div className="flex items-center justify-between gap-2 px-4 h-12 border-b border-white/10 shrink-0">
              <h2 className="text-sm font-black text-white truncate">
                🎁 {target.card.name} 선물
              </h2>
              <button
                onClick={onClose}
                aria-label="닫기"
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center shrink-0"
                style={{ touchAction: "manipulation" }}
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain min-h-0 p-4 space-y-3">
                  <label className="block">
                    <span className="text-xs text-zinc-300 mb-1.5 block">
                      받는 사람
                    </span>
                    <UserSelect
                      value={recipient || null}
                      excludeSelf
                      placeholder="받는 사람 고르기"
                      onChange={(u) => setRecipient(u.user_id)}
                    />
                  </label>

                  <label className="block">
                    <span className="text-xs text-zinc-300 mb-1.5 block">
                      받는 사람이 지불할 포인트
                    </span>
                    <input
                      value={priceRaw}
                      onChange={(e) =>
                        setPriceRaw(e.target.value.replace(/[^0-9]/g, ""))
                      }
                      inputMode="numeric"
                      style={{ fontSize: "16px" }}
                      className="w-full h-11 px-3 rounded-lg bg-black/40 border border-white/10 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-400/60 tabular-nums"
                      placeholder="0"
                    />
                  </label>

                  <label className="block">
                    <span className="text-xs text-zinc-300 mb-1.5 block">
                      메시지 <span className="text-zinc-500">(선택)</span>
                    </span>
                    <textarea
                      value={message}
                      onChange={(e) =>
                        setMessage(e.target.value.slice(0, 140))
                      }
                      rows={2}
                      maxLength={140}
                      placeholder="짧은 메시지"
                      style={{ fontSize: "16px" }}
                      className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-400/60 resize-none"
                    />
                    <div className="mt-0.5 text-right text-[10px] text-zinc-500 tabular-nums">
                      {message.length} / 140
                    </div>
                  </label>

                  <p className="text-[11px] text-zinc-500 leading-snug">
                    24시간 내 수락 안 하면 슬랩은 내 지갑에 남아요.
                    {quota && (
                      <span className="block text-zinc-400">
                        오늘 {quota.used}/{quota.limit} 사용 · 남은{" "}
                        {quota.remaining}회
                      </span>
                    )}
                  </p>

                  {error && (
                    <p className="text-xs text-rose-400">{error}</p>
                  )}
                  {success && (
                    <p className="text-xs text-emerald-300">
                      선물이 전송되었어요!
                    </p>
                  )}

                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={submit}
                      disabled={sending || success || !recipient.trim()}
                      style={{ touchAction: "manipulation" }}
                      className="flex-1 h-12 rounded-lg bg-gradient-to-r from-amber-400 to-rose-500 text-zinc-950 font-bold text-sm disabled:opacity-50 active:scale-[0.98] transition"
                    >
                      {sending
                        ? "보내는 중..."
                        : success
                        ? "전송 완료"
                        : "선물 보내기"}
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      disabled={sending}
                      style={{ touchAction: "manipulation" }}
                      className="flex-1 h-12 rounded-lg bg-white/10 hover:bg-white/15 text-white font-semibold text-sm"
                    >
                      취소
                    </button>
                  </div>
            </div>
          </motion.div>
          </motion.div>
        </Portal>
      )}
    </AnimatePresence>
  );
}

function Kpi({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={clsx(
        "rounded-lg border px-3 py-1.5",
        highlight
          ? "bg-amber-400/10 border-amber-400/40"
          : "bg-white/5 border-white/10"
      )}
    >
      <div className="text-[10px] uppercase tracking-wider text-zinc-400">
        {label}
      </div>
      <div
        className={clsx(
          "text-sm font-bold",
          highlight ? "text-amber-200" : "text-white"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function CountBadge({ value, cap }: { value: number; cap?: string }) {
  const reduce = useReducedMotion();
  return (
    <span className="ml-1.5 text-[10px] opacity-70 inline-block tabular-nums">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={reduce ? false : { y: -6, opacity: 0, scale: 0.85 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { y: 6, opacity: 0, scale: 0.85 }}
          transition={{ type: "spring", stiffness: 420, damping: 22 }}
          className="inline-block"
        >
          {value}
        </motion.span>
      </AnimatePresence>
      {cap && <span className="opacity-60"> / {cap}</span>}
    </span>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{ touchAction: "manipulation" }}
      className={clsx(
        "px-4 py-2 rounded-lg text-sm font-semibold transition-colors",
        active ? "bg-white text-zinc-900" : "text-zinc-300 hover:text-white"
      )}
    >
      {children}
    </button>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "shrink-0 inline-flex items-center px-2 py-1 rounded-full text-[11px] font-semibold border transition whitespace-nowrap",
        active
          ? "bg-white text-zinc-900 border-white"
          : "bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10 hover:text-white"
      )}
    >
      {children}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="mt-12 rounded-2xl border border-dashed border-white/10 bg-white/5 py-12 md:py-14 flex flex-col items-center gap-3 text-center px-4">
      <span className="text-5xl">🎴</span>
      <p className="text-lg text-white font-semibold">
        아직 수집한 카드가 없습니다
      </p>
      <p className="text-sm text-zinc-400">
        팩을 열고 카드를 뽑으면 여기에 모입니다.
      </p>
      <Link
        href="/"
        className="mt-2 inline-flex items-center h-11 px-5 rounded-xl bg-gradient-to-r from-amber-400 to-rose-500 text-zinc-950 font-bold text-sm hover:scale-[1.03] transition"
      >
        팩 열러 가기
      </Link>
    </div>
  );
}

/* ─────────────── PCL 일괄 삭제 모달 ─────────────── */

interface PclItemForDelete {
  grading: PclGradingWithDisplay;
  card: Card;
  isPet: boolean;
  isDisplayed: boolean;
  isDefense: boolean;
}

const DELETE_GRADES = [6, 7, 8, 9, 10] as const;

function BulkDeletePclModal({
  items,
  userId,
  onClose,
  onAfterDelete,
}: {
  items: PclItemForDelete[];
  userId: string;
  onClose: () => void;
  onAfterDelete: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // 등급별 보유/사용가능 수량 — 사용가능 = 전시/펫/방어덱 아닌 슬랩.
  // 대기 선물 정보는 클라에 없어 server 재검증으로만 반영 (오차 가능,
  // 정상). 토스트로 server 응답 그대로 노출.
  const counts = useMemo(() => {
    const m: Record<number, { total: number; deletable: number }> = {};
    for (const g of DELETE_GRADES) m[g] = { total: 0, deletable: 0 };
    for (const it of items) {
      const g = it.grading.grade;
      if (!m[g]) continue;
      m[g].total += 1;
      if (!it.isPet && !it.isDisplayed && !it.isDefense) {
        m[g].deletable += 1;
      }
    }
    return m;
  }, [items]);

  // ESC 닫기 + body 스크롤 잠금.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && busy === null) onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, busy]);

  const runDelete = useCallback(
    async (grade: number) => {
      const c = counts[grade];
      if (!c) return;
      const isPcl10 = grade === 10;
      const warnPrefix = isPcl10
        ? "⚠️ 위험: PCL 10 슬랩은 최상위 등급입니다.\n\n"
        : "";
      const confirmMsg =
        warnPrefix +
        `정말 PCL ${grade} 등급 카드를 전부 삭제하시겠습니까?\n\n` +
        `· 보유 ${c.total}장 중 사용 가능 ${c.deletable}장 삭제 예정\n` +
        `· 전시/펫/방어덱/대기 선물 등 사용 중인 카드는 자동 보호\n` +
        `· 삭제된 슬랩은 복구할 수 없습니다.`;
      if (!window.confirm(confirmMsg)) return;
      setBusy(grade);
      const res = await bulkDeletePclByGrade(userId, grade);
      setBusy(null);
      if (!res.ok) {
        setToast(res.error ?? "삭제 실패");
        return;
      }
      const deleted = res.deleted ?? 0;
      const locked = res.locked ?? 0;
      setToast(
        `PCL ${grade}: ${deleted}장 삭제됨` +
          (locked > 0 ? ` · ${locked}장은 사용중이라 보호됨` : "")
      );
      await onAfterDelete();
    },
    [counts, userId, onAfterDelete]
  );

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <Portal>
      <motion.div
        className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-md flex items-center justify-center px-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={busy === null ? onClose : undefined}
      >
        <motion.div
          className="relative w-full max-w-md bg-zinc-950 border border-rose-500/40 rounded-2xl overflow-hidden shadow-2xl"
          initial={{ scale: 0.94, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.94, opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-rose-500/10">
            <div>
              <h3 className="text-sm font-bold text-white">
                🗑️ PCL 일괄 삭제
              </h3>
              <p className="text-[10px] text-rose-200/80 mt-0.5">
                등급을 선택해 카드지갑에서 한 번에 삭제
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy !== null}
              aria-label="닫기"
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center disabled:opacity-50"
            >
              ✕
            </button>
          </div>

          <div className="p-4 space-y-2">
            <p className="text-[12px] text-zinc-300 leading-snug">
              사용 중 (전시 / 펫 / 방어덱 / 대기 선물) 슬랩은 자동 보호됩니다.
              삭제된 슬랩은 <b className="text-rose-300">복구할 수 없어요.</b>
            </p>
            <ul className="space-y-1.5">
              {DELETE_GRADES.map((g) => {
                const c = counts[g];
                const total = c?.total ?? 0;
                const deletable = c?.deletable ?? 0;
                const disabled = total === 0 || busy !== null;
                const isPcl10 = g === 10;
                return (
                  <li key={g}>
                    <button
                      type="button"
                      onClick={() => runDelete(g)}
                      disabled={disabled}
                      style={{ touchAction: "manipulation" }}
                      className={clsx(
                        "w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border transition",
                        disabled
                          ? "bg-white/[0.02] border-white/5 text-zinc-600 cursor-not-allowed"
                          : isPcl10
                          ? "bg-rose-500/10 border-rose-500/50 text-rose-100 hover:bg-rose-500/20"
                          : "bg-white/5 border-white/15 text-white hover:bg-white/10"
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={clsx(
                            "shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-[12px] font-black",
                            isPcl10
                              ? "bg-amber-400 text-zinc-950"
                              : "bg-zinc-800 text-zinc-100 border border-white/10"
                          )}
                        >
                          PCL{g}
                        </span>
                        {isPcl10 && (
                          <span className="text-[10px] font-bold text-amber-300">
                            ⚠️ 최상위 등급
                          </span>
                        )}
                      </span>
                      <span className="text-right">
                        <span className="block text-[11px] text-zinc-400 tabular-nums">
                          보유 {total}장
                        </span>
                        <span className="block text-[12px] font-black tabular-nums">
                          {busy === g ? (
                            <span className="text-zinc-400">삭제 중…</span>
                          ) : total === 0 ? (
                            <span className="text-zinc-600">없음</span>
                          ) : (
                            <span className="text-rose-200">
                              삭제 가능 {deletable}장
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {toast && (
              <div className="mt-2 text-[12px] text-emerald-200 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
                {toast}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </Portal>
  );
}
