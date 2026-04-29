"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import clsx from "clsx";
import { useAuth } from "@/lib/auth";
import {
  bulkRegisterPokedex,
  fetchPokedex,
  getAllCatalogCards,
  pokedexCompletionBonus,
  pokedexPowerBonus,
  POKEDEX_RARITY_SCORE,
  RARITY_COMPLETION_BONUS,
  RARITY_TOTALS,
  type PokedexEntry,
} from "@/lib/pokedex";
import { RARITY_ORDER, RARITY_STYLE, RARITY_LABEL } from "@/lib/rarity";
import { SETS } from "@/lib/sets";
import type { Card, Rarity } from "@/lib/types";
import PageBackdrop from "./PageBackdrop";
import PageHeader from "./PageHeader";
import Portal from "./Portal";
import PokeCard from "./PokeCard";
import RarityBadge from "./RarityBadge";
import { CenteredPokeLoader } from "./PokeLoader";

// spec 0-2: 카드 리스트는 무한 스크롤. 페이지 버튼/이전 다음 버튼 금지.
// 첫 60장 노출, 스크롤 하단 도달 시 +60.
const CARDS_PER_BATCH = 60;

const RARITY_TABS: Rarity[] = RARITY_ORDER;

export default function PokedexView() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<PokedexEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeRarity, setActiveRarity] = useState<Rarity>("MUR");
  const [visibleCount, setVisibleCount] = useState(CARDS_PER_BATCH);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewCard, setPreviewCard] = useState<Card | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const list = await fetchPokedex(user.id);
    setEntries(list);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const catalog = useMemo(() => getAllCatalogCards(), []);

  const groupedByRarity = useMemo(() => {
    const map = new Map<Rarity, Card[]>();
    for (const r of RARITY_TABS) map.set(r, []);
    for (const c of catalog) {
      const arr = map.get(c.rarity);
      if (arr) arr.push(c);
    }
    return map;
  }, [catalog]);

  const registeredIds = useMemo(
    () => new Set(entries.map((e) => e.card_id)),
    [entries]
  );

  const cardsForTab = groupedByRarity.get(activeRarity) ?? [];
  const visibleCards = cardsForTab.slice(0, visibleCount);
  const hasMore = visibleCount < cardsForTab.length;

  // 희귀도 탭 전환 시 visibleCount 리셋.
  useEffect(() => {
    setVisibleCount(CARDS_PER_BATCH);
  }, [activeRarity]);

  // sentinel intersection → 다음 batch 로드. 현재 batch 가 한도일 때만
  // observer 작동.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((v) => v + CARDS_PER_BATCH);
        }
      },
      { rootMargin: "320px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, visibleCount, activeRarity]);

  const count = entries.length;
  // 등록 정액 합 + 세트효과(부분 진행도 비례) 합. 서버 pokedex_power_bonus +
  // pokedex_completion_bonus 와 동일 공식의 클라 mirror — 도감 페이지에서
  // 추가 RPC 없이 즉시 갱신.
  const bonus = pokedexPowerBonus(entries);
  const completion = pokedexCompletionBonus(entries);
  const totalBonus = bonus + completion;

  const handleBulk = async () => {
    if (!user || submitting) return;
    setSubmitting(true);
    setConfirmOpen(false);
    const res = await bulkRegisterPokedex(user.id);
    setSubmitting(false);
    if (!res.ok) {
      setToast(res.error ?? "도감 등록에 실패했어요.");
      return;
    }
    const n = res.registered_count ?? 0;
    if (n === 0) {
      setToast("등록 가능한 PCL10 슬랩이 없어요.");
    } else {
      setToast(`도감에 ${n}장 추가됨!`);
    }
    refresh();
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="relative max-w-5xl mx-auto px-3 md:px-6 py-3 md:py-6 fade-in">
      <PageBackdrop tone="parchment" />
      <PageHeader
        title="PCL 도감"
        icon="📔"
        subtitle="모든 카드를 한눈에. PCL10 슬랩을 영구 박제해 모으는 컬렉션."
        tone="amber"
        stats={
          <>
            <span className="px-2 py-1 rounded-full bg-amber-400/15 border border-amber-400/40 text-amber-100 text-[11px] font-bold">
              등록 {count}장
            </span>
            <span className="px-2 py-1 rounded-full bg-emerald-400/15 border border-emerald-400/40 text-emerald-100 text-[11px] font-bold">
              등록 +{bonus.toLocaleString("ko-KR")}p
            </span>
            <span className="px-2 py-1 rounded-full bg-cyan-400/15 border border-cyan-400/40 text-cyan-100 text-[11px] font-bold">
              세트효과 +{completion.toLocaleString("ko-KR")}p
            </span>
            <span className="px-2 py-1 rounded-full bg-fuchsia-400/15 border border-fuchsia-400/40 text-fuchsia-100 text-[11px] font-bold">
              합계 +{totalBonus.toLocaleString("ko-KR")}p
            </span>
          </>
        }
      />

      <div className="rounded-xl border border-white/10 bg-gradient-to-r from-amber-500/10 via-fuchsia-500/5 to-indigo-500/10 p-3 md:p-4 mb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[12px] md:text-[13px] text-zinc-200">
            희귀도별 정액 — MUR{" "}
            <b className="text-amber-200">+{POKEDEX_RARITY_SCORE.MUR}</b>·UR{" "}
            <b className="text-amber-200">+{POKEDEX_RARITY_SCORE.UR}</b>·SAR{" "}
            <b className="text-amber-200">+{POKEDEX_RARITY_SCORE.SAR}</b>·SR{" "}
            <b className="text-amber-200">+{POKEDEX_RARITY_SCORE.SR}</b>·R{" "}
            <b className="text-amber-200">+{POKEDEX_RARITY_SCORE.R}</b>{" "}
            (현재 합계 +{bonus.toLocaleString("ko-KR")})
          </div>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={submitting}
            style={{ touchAction: "manipulation" }}
            className={clsx(
              "h-10 px-4 rounded-xl font-bold text-sm transition shadow-[0_10px_30px_-10px_rgba(251,191,36,0.7)]",
              submitting
                ? "bg-amber-400/40 text-zinc-900 cursor-wait"
                : "bg-gradient-to-r from-amber-400 to-fuchsia-500 text-zinc-950 hover:scale-[1.02] active:scale-[0.98]"
            )}
          >
            {submitting ? "등록 중..." : "📔 도감 일괄 등록"}
          </button>
        </div>
      </div>

      {/* 도감 세트효과(완전 컬렉션 보너스) 안내 — 한 카드 희귀도의
          모든 카드를 박제하면 추가 전투력. 신규 세트 추가 시 totals 가
          늘어 미완성으로 바뀌면 보너스도 자동 회수. */}
      <div className="rounded-xl border border-fuchsia-400/30 bg-fuchsia-500/5 p-3 md:p-4 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span aria-hidden className="text-base">✨</span>
          <h2 className="text-sm font-bold text-fuchsia-100">
            도감 세트효과 (희귀도별 완전 컬렉션)
          </h2>
          <span className="ml-auto px-2 py-0.5 rounded-full bg-cyan-400/15 border border-cyan-400/40 text-cyan-100 text-[10px] font-bold tabular-nums">
            누적 +{completion.toLocaleString("ko-KR")}p
          </span>
        </div>
        <p className="text-[12px] text-zinc-300 leading-relaxed mb-2">
          카드 희귀도별 <b className="text-white">진행률 비례</b>로 전투력
          보너스가 즉시 적립돼요. 한 희귀도의 모든 카드를 박제하면 아래
          표시된 <b className="text-fuchsia-200">최대 보너스</b>를 받습니다.
          부분 진행도 비례 가산 (예: 절반 모으면 절반 보너스).
        </p>
        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1 text-[11px] tabular-nums">
          {RARITY_ORDER.map((r) => (
            <li
              key={r}
              className="px-2 py-1 rounded bg-white/5 border border-white/10 flex items-center justify-between gap-1"
            >
              <span
                className={clsx(
                  "text-[10px] font-black px-1 py-0.5 rounded",
                  RARITY_STYLE[r].badge
                )}
              >
                {r}
              </span>
              <span className="text-zinc-200">
                <b className="text-white">{RARITY_TOTALS[r]}</b>장 →
                <b className="text-fuchsia-300 ml-0.5">
                  최대 +{RARITY_COMPLETION_BONUS[r].toLocaleString("ko-KR")}
                </b>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center gap-1.5 mb-3 overflow-x-auto py-2 -my-1 px-1 -mx-1">
        {RARITY_TABS.map((r) => {
          const totalInTab = groupedByRarity.get(r)?.length ?? 0;
          const dexedInTab = (groupedByRarity.get(r) ?? []).filter((c) =>
            registeredIds.has(c.id)
          ).length;
          return (
            <RarityTab
              key={r}
              rarity={r}
              active={activeRarity === r}
              dexed={dexedInTab}
              total={totalInTab}
              complete={totalInTab > 0 && dexedInTab >= totalInTab}
              onClick={() => setActiveRarity(r)}
            />
          );
        })}
        <span className="ml-auto shrink-0 text-[11px] text-zinc-400 tabular-nums pl-2">
          {visibleCards.length} / {cardsForTab.length}
        </span>
      </div>

      <Book
        loading={loading}
        visibleCards={visibleCards}
        totalForTab={cardsForTab.length}
        registeredIds={registeredIds}
        emptyForRarity={cardsForTab.length === 0}
        rarityLabel={RARITY_LABEL[activeRarity]}
        onSelect={setPreviewCard}
        sentinelRef={sentinelRef}
        hasMore={hasMore}
      />

      <AnimatePresence>
        {toast && (
          <motion.div
            key="toast"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed left-1/2 -translate-x-1/2 bottom-8 z-[200] px-4 py-3 rounded-xl bg-zinc-950 border border-amber-400/50 text-amber-100 font-bold text-sm shadow-2xl"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmOpen && (
          <BulkConfirm
            onCancel={() => setConfirmOpen(false)}
            onConfirm={handleBulk}
            submitting={submitting}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {previewCard && (
          <CardPreview
            card={previewCard}
            registered={registeredIds.has(previewCard.id)}
            onClose={() => setPreviewCard(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function RarityTab({
  rarity,
  active,
  dexed,
  total,
  complete,
  onClick,
}: {
  rarity: Rarity;
  active: boolean;
  dexed: number;
  total: number;
  complete: boolean;
  onClick: () => void;
}) {
  const style = RARITY_STYLE[rarity];
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ touchAction: "manipulation" }}
      className={clsx(
        "shrink-0 h-10 px-3 rounded-full text-[11px] font-bold transition border inline-flex items-center gap-1.5 ring-offset-0",
        active
          ? clsx("ring-2", style.frame, "bg-white text-zinc-900 border-white")
          : "bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10"
      )}
    >
      <span>{rarity}</span>
      <span
        className={clsx(
          "tabular-nums text-[10px] px-1.5 py-0.5 rounded-full",
          active ? "bg-zinc-900/15 text-zinc-700" : "bg-white/10 text-zinc-400"
        )}
      >
        {dexed}/{total}
      </span>
      {complete && (
        <span className="tabular-nums text-[10px] px-1.5 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-fuchsia-500 text-zinc-950 font-black">
          ✨ 완성
        </span>
      )}
    </button>
  );
}

function Book({
  loading,
  visibleCards,
  totalForTab,
  registeredIds,
  emptyForRarity,
  rarityLabel,
  onSelect,
  sentinelRef,
  hasMore,
}: {
  loading: boolean;
  visibleCards: Card[];
  totalForTab: number;
  registeredIds: Set<string>;
  emptyForRarity: boolean;
  rarityLabel: string;
  onSelect: (c: Card) => void;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  hasMore: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <div
      className="relative rounded-2xl overflow-hidden border border-amber-900/40 bg-[linear-gradient(160deg,#3a2410_0%,#1a0e07_55%,#0a0604_100%)] p-2 md:p-5"
      style={{ minHeight: 380 }}
    >
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-30"
        style={{
          background:
            "radial-gradient(closest-side at 50% 0%, rgba(251,191,36,0.25), rgba(251,191,36,0) 60%)",
        }}
      />
      {loading ? (
        <CenteredPokeLoader label="도감을 펼치는 중..." />
      ) : emptyForRarity ? (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <div className="text-5xl mb-3">📖</div>
          <p className="text-sm text-zinc-300 font-bold">
            {rarityLabel} 카드가 없어요
          </p>
          <p className="mt-1 text-[12px] text-zinc-500">
            다른 희귀도 탭을 눌러 보세요.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-6 sm:grid-cols-6 md:grid-cols-10 gap-1 md:gap-1.5">
            {visibleCards.map((c) => (
              <DexCell
                key={c.id}
                card={c}
                registered={registeredIds.has(c.id)}
                onClick={() => onSelect(c)}
                reduce={!!reduce}
              />
            ))}
          </div>
          {hasMore && (
            <div
              ref={sentinelRef}
              className="py-4 text-center text-[11px] text-amber-200/70 font-bold"
            >
              더 펼치는 중… ({visibleCards.length} / {totalForTab})
            </div>
          )}
          {!hasMore && totalForTab > CARDS_PER_BATCH && (
            <p className="py-3 text-center text-[11px] text-amber-200/60">
              모두 표시됨 ({totalForTab}장)
            </p>
          )}
        </>
      )}
    </div>
  );
}

const DexCell = memo(function DexCell({
  card,
  registered,
  onClick,
  reduce,
}: {
  card: Card;
  registered: boolean;
  onClick: () => void;
  reduce: boolean;
}) {
  const rarity = card.rarity;
  const style = RARITY_STYLE[rarity];

  return (
    <motion.button
      type="button"
      onClick={onClick}
      style={{ touchAction: "manipulation" }}
      aria-label={`${card.name} 카드 보기`}
      variants={{
        hidden: reduce
          ? { opacity: 0 }
          : { opacity: 0, y: 6, scale: 0.96 },
        visible: reduce
          ? { opacity: 1, transition: { duration: 0.15 } }
          : {
              opacity: 1,
              y: 0,
              scale: 1,
              transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] },
            },
      }}
      whileHover={reduce ? undefined : { scale: 1.04 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 380, damping: 26 }}
      className={clsx(
        "group relative w-full aspect-[5/7] rounded-md overflow-hidden ring-1 bg-zinc-950",
        style.frame,
        !registered && "ring-zinc-700/30"
      )}
      title={`${card.name} · ${rarity}`}
    >
      <div
        className={clsx(
          "absolute inset-0",
          !registered && "opacity-30 saturate-50 grayscale"
        )}
      >
        {card.imageUrl ? (
          <img
            src={card.imageUrl}
            alt={card.name}
            loading="lazy"
            // Async decode keeps the page-flip animation smooth — without
            // it, decoding 30 card thumbnails on the main thread caused a
            // visible hitch right as the flip transition started.
            decoding="async"
            draggable={false}
            className="w-full h-full object-contain bg-zinc-950 select-none pointer-events-none"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-500 text-[8px] px-0.5 text-center leading-tight">
            {card.name}
          </div>
        )}
      </div>
      <AnimatePresence>
        {registered && (
          <motion.div
            key="check"
            className="absolute top-0.5 right-0.5"
            initial={reduce ? { opacity: 0 } : { scale: 0, rotate: -45, opacity: 0 }}
            animate={
              reduce
                ? { opacity: 1 }
                : { scale: [0, 1.3, 1], rotate: [-45, 8, 0], opacity: 1 }
            }
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: reduce ? 0.15 : 0.4, ease: [0.4, 0, 0.2, 1] }}
          >
            <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[8px] font-black bg-emerald-400 text-zinc-950 shadow-[0_0_6px_rgba(74,222,128,0.6)]">
              ✓
            </span>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="absolute bottom-0 left-0">
        <RarityBadge rarity={rarity} size="xs" />
      </div>
    </motion.button>
  );
});

function CardPreview({
  card,
  registered,
  onClose,
}: {
  card: Card;
  registered: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const setName = SETS[card.setCode]?.name ?? card.setCode;

  return (
    <Portal>
      <motion.div
        key="dex-preview"
        className="fixed inset-0 z-[180] bg-black/90 backdrop-blur-md flex items-center justify-center"
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
          className="relative w-full max-w-sm bg-zinc-950 border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
          style={{ maxHeight: "calc(100dvh - 24px)" }}
          initial={{ y: 16, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 16, opacity: 0, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 240, damping: 26 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="absolute top-2 right-2 z-10 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
            style={{ touchAction: "manipulation" }}
          >
            ✕
          </button>
          <div className="px-4 pt-4 pb-3 flex flex-col items-center gap-3">
            <div className={clsx(!registered && "opacity-60 saturate-50")}>
              <PokeCard card={card} revealed size="md" />
            </div>
            <div className="w-full text-center">
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <h3 className="text-lg font-black text-white">{card.name}</h3>
                <RarityBadge rarity={card.rarity} size="sm" />
              </div>
              <p className="mt-1 text-[11px] text-zinc-400">
                {setName} · #{card.number}
              </p>
              <p className="mt-2 text-[11px] font-bold">
                {registered ? (
                  <span className="text-emerald-300">✓ 도감 등록 완료</span>
                ) : (
                  <span className="text-zinc-500">아직 미등록</span>
                )}
              </p>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </Portal>
  );
}

function BulkConfirm({
  onCancel,
  onConfirm,
  submitting,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  submitting: boolean;
}) {
  return (
    <Portal>
      <motion.div
        key="bulk-confirm"
        className="fixed inset-0 z-[190] bg-black/85 backdrop-blur-md flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onCancel}
        style={{
          paddingTop: "max(env(safe-area-inset-top, 0px), 12px)",
          paddingBottom: "max(env(safe-area-inset-bottom, 0px), 12px)",
          paddingLeft: 12,
          paddingRight: 12,
        }}
      >
        <motion.div
          className="w-full max-w-md bg-zinc-950 border border-amber-400/40 rounded-2xl overflow-y-auto shadow-2xl"
          style={{ maxHeight: "calc(100dvh - 24px)" }}
          initial={{ y: 16, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 16, opacity: 0, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 220, damping: 24 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-4 pt-4 pb-2 text-center">
            <div className="text-4xl mb-1">📔</div>
            <h3 className="text-base font-black text-white">
              도감 일괄 등록할까요?
            </h3>
            <p className="mt-1 text-[12px] text-zinc-300 leading-relaxed">
              보유 중인 PCL10 슬랩 중{" "}
              <b className="text-emerald-200">전시 중·펫·도감 등록·선물 대기</b>{" "}
              가 아닌 카드만 박제돼요. 해당 슬랩은{" "}
              <b className="text-amber-200">카드지갑에서 영구 삭제</b>되며 다시
              꺼낼 수 없어요.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 p-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              style={{ touchAction: "manipulation" }}
              className="h-11 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-sm disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={submitting}
              style={{ touchAction: "manipulation" }}
              className={clsx(
                "h-11 rounded-xl font-bold text-sm transition",
                submitting
                  ? "bg-amber-400/40 text-zinc-900 cursor-wait"
                  : "bg-gradient-to-r from-amber-400 to-fuchsia-500 text-zinc-950 hover:scale-[1.02] active:scale-[0.98]"
              )}
            >
              {submitting ? "등록 중..." : "전부 등록"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </Portal>
  );
}
