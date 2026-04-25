"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { useAuth } from "@/lib/auth";
import {
  bulkRegisterPokedex,
  fetchPokedex,
  getAllCatalogCards,
  nextBreakpoint,
  pokedexPowerBonus,
  POKEDEX_BREAKPOINTS,
  type PokedexEntry,
} from "@/lib/pokedex";
import { RARITY_ORDER, RARITY_STYLE, RARITY_LABEL } from "@/lib/rarity";
import type { Card, Rarity } from "@/lib/types";
import HelpButton, { type HelpSection } from "./HelpButton";
import PageHeader from "./PageHeader";
import RarityBadge from "./RarityBadge";

const HELP_SECTIONS: HelpSection[] = [
  {
    heading: "도감이란",
    icon: "📔",
    body: (
      <>
        모든 카드가 표시되며, 도감에 등록되지 않은 카드는 어둡게 보여요. 한 번
        등록하면 그 슬랩은 카드지갑에서 사라지고 도감에 박제돼요. 카드 한 종류는
        한 번만 등록할 수 있어요.
      </>
    ),
  },
  {
    heading: "등록 조건",
    icon: "✅",
    body: (
      <ul>
        <li>PCL 10등급으로 감별된 카드만 등록 가능 (센터에 전시 중이 아닌 슬랩)</li>
        <li>같은 카드(card_id)는 한 번만 등록 가능</li>
        <li>등록된 카드는 카드지갑에서 영구 삭제 — 다시 꺼낼 수 없어요</li>
      </ul>
    ),
  },
  {
    heading: "일괄 등록",
    icon: "📦",
    body: (
      <>
        <b>📔 도감 일괄 등록</b> 버튼을 누르면 보유 중인 모든 PCL10 슬랩 (전시
        중이 아니고 도감에 없는 카드) 이 한 번에 도감에 등록되고, 해당 슬랩들은
        카드지갑에서 영구 삭제돼요.
      </>
    ),
  },
  {
    heading: "전투력 보너스",
    icon: "⚡",
    body: (
      <>
        도감 보유 수에 따라 <b>센터 전투력</b>에 보너스가 붙어 사용자 랭킹에
        자동 반영돼요.
        <ul className="mt-1.5">
          <li>5장 → +500</li>
          <li>10장 → +1,200</li>
          <li>15장 → +2,000</li>
          <li>20장 → +3,000</li>
          <li>30장 → +5,000 (이후 1장당 +100)</li>
        </ul>
      </>
    ),
  },
  {
    heading: "책 넘기기",
    icon: "📖",
    body: (
      <>
        도감은 책처럼 한 페이지에 6장씩 펼쳐져요. 좌우 화살표로 페이지를 넘기면
        3D 페이지 플립 애니메이션이 재생돼요.
      </>
    ),
  },
];

const CARDS_PER_PAGE = 6;

const RARITY_TABS: Rarity[] = RARITY_ORDER;

export default function PokedexView() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<PokedexEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeRarity, setActiveRarity] = useState<Rarity>("MUR");
  const [pageIndex, setPageIndex] = useState(0);
  const [flipDir, setFlipDir] = useState<1 | -1>(1);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

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
  const totalPages = Math.max(1, Math.ceil(cardsForTab.length / CARDS_PER_PAGE));
  const safePageIndex = Math.min(pageIndex, totalPages - 1);
  const pageCards = cardsForTab.slice(
    safePageIndex * CARDS_PER_PAGE,
    safePageIndex * CARDS_PER_PAGE + CARDS_PER_PAGE
  );

  useEffect(() => {
    setPageIndex(0);
  }, [activeRarity]);

  const goPrev = () => {
    if (safePageIndex <= 0) return;
    setFlipDir(-1);
    setPageIndex((i) => Math.max(0, i - 1));
  };
  const goNext = () => {
    if (safePageIndex >= totalPages - 1) return;
    setFlipDir(1);
    setPageIndex((i) => Math.min(totalPages - 1, i + 1));
  };

  const count = entries.length;
  const bonus = pokedexPowerBonus(count);
  const next = nextBreakpoint(count);

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
    <div className="max-w-5xl mx-auto px-3 md:px-6 py-4 md:py-8 fade-in">
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
            <span className="px-2 py-1 rounded-full bg-fuchsia-400/15 border border-fuchsia-400/40 text-fuchsia-100 text-[11px] font-bold">
              전투력 +{bonus.toLocaleString("ko-KR")}p
            </span>
            <HelpButton size="sm" title="PCL 도감" sections={HELP_SECTIONS} />
          </>
        }
      />

      <div className="rounded-xl border border-white/10 bg-gradient-to-r from-amber-500/10 via-fuchsia-500/5 to-indigo-500/10 p-3 md:p-4 mb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[12px] md:text-[13px] text-zinc-200">
            {next ? (
              <>
                앞으로 <b className="text-amber-200">{next.remaining}장</b> 더
                등록하면{" "}
                <b className="text-fuchsia-200">
                  +{next.bonusAtNext.toLocaleString("ko-KR")}
                </b>{" "}
                구간 (현재 +{bonus.toLocaleString("ko-KR")})
              </>
            ) : (
              <>최대 보너스 구간 도달. 1장당 +100씩 계속 누적돼요.</>
            )}
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
        <div className="mt-2 flex items-center gap-1 flex-wrap">
          {POKEDEX_BREAKPOINTS.map((b) => (
            <span
              key={b.count}
              className={clsx(
                "px-2 py-0.5 rounded-full text-[10px] font-bold border",
                count >= b.count
                  ? "bg-amber-400/20 text-amber-100 border-amber-400/50"
                  : "bg-white/5 text-zinc-400 border-white/10"
              )}
            >
              {b.count}장 · {b.label}
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1.5 mb-3 overflow-x-auto pb-1 -mx-1 px-1">
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
              onClick={() => setActiveRarity(r)}
            />
          );
        })}
        <span className="ml-auto shrink-0 text-[11px] text-zinc-400 tabular-nums pl-2">
          {totalPages > 0 ? `${safePageIndex + 1} / ${totalPages}` : "0 / 0"}
        </span>
      </div>

      <Book
        loading={loading}
        flipDir={flipDir}
        pageIndex={safePageIndex}
        pageCards={pageCards}
        registeredIds={registeredIds}
        emptyForRarity={cardsForTab.length === 0}
        rarityLabel={RARITY_LABEL[activeRarity]}
      />

      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={goPrev}
          disabled={safePageIndex <= 0}
          style={{ touchAction: "manipulation" }}
          className={clsx(
            "h-11 px-5 rounded-xl border font-bold text-sm transition inline-flex items-center gap-2",
            safePageIndex <= 0
              ? "bg-white/5 border-white/10 text-zinc-600 cursor-not-allowed"
              : "bg-white/10 border-white/15 text-white hover:bg-white/15"
          )}
        >
          ← 이전
        </button>
        <div className="text-[11px] text-zinc-400 tabular-nums">
          {safePageIndex + 1} / {totalPages}
        </div>
        <button
          type="button"
          onClick={goNext}
          disabled={safePageIndex >= totalPages - 1}
          style={{ touchAction: "manipulation" }}
          className={clsx(
            "h-11 px-5 rounded-xl border font-bold text-sm transition inline-flex items-center gap-2",
            safePageIndex >= totalPages - 1
              ? "bg-white/5 border-white/10 text-zinc-600 cursor-not-allowed"
              : "bg-white/10 border-white/15 text-white hover:bg-white/15"
          )}
        >
          다음 →
        </button>
      </div>

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
    </div>
  );
}

function RarityTab({
  rarity,
  active,
  dexed,
  total,
  onClick,
}: {
  rarity: Rarity;
  active: boolean;
  dexed: number;
  total: number;
  onClick: () => void;
}) {
  const style = RARITY_STYLE[rarity];
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ touchAction: "manipulation" }}
      className={clsx(
        "shrink-0 h-9 px-3 rounded-full text-[11px] font-bold transition border inline-flex items-center gap-1.5",
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
    </button>
  );
}

function Book({
  loading,
  flipDir,
  pageIndex,
  pageCards,
  registeredIds,
  emptyForRarity,
  rarityLabel,
}: {
  loading: boolean;
  flipDir: 1 | -1;
  pageIndex: number;
  pageCards: Card[];
  registeredIds: Set<string>;
  emptyForRarity: boolean;
  rarityLabel: string;
}) {
  return (
    <div
      className="relative rounded-2xl overflow-hidden border border-amber-900/40 bg-[linear-gradient(160deg,#3a2410_0%,#1a0e07_55%,#0a0604_100%)] p-3 md:p-5 perspective-1200"
      style={{ minHeight: 460 }}
    >
      <div
        aria-hidden
        className="absolute inset-y-2 left-1/2 -translate-x-1/2 w-px bg-gradient-to-b from-amber-900/0 via-amber-700/40 to-amber-900/0 hidden md:block pointer-events-none"
      />
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-30"
        style={{
          background:
            "radial-gradient(closest-side at 50% 0%, rgba(251,191,36,0.25), rgba(251,191,36,0) 60%)",
        }}
      />
      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-zinc-400">
          도감을 펼치는 중...
        </div>
      ) : emptyForRarity ? (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <div className="text-5xl mb-3">📖</div>
          <p className="text-sm text-zinc-300 font-bold">
            {rarityLabel} 카드가 없어요
          </p>
          <p className="mt-1 text-[12px] text-zinc-500">
            다른 등급 탭을 눌러 보세요.
          </p>
        </div>
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pageIndex}
            className="relative preserve-3d"
            initial={{ rotateY: flipDir === 1 ? 90 : -90, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            exit={{ rotateY: flipDir === 1 ? -90 : 90, opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
            style={{ transformOrigin: flipDir === 1 ? "left center" : "right center" }}
          >
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 backface-hidden">
              {pageCards.map((c) => (
                <DexCell
                  key={c.id}
                  card={c}
                  registered={registeredIds.has(c.id)}
                />
              ))}
              {Array.from({ length: CARDS_PER_PAGE - pageCards.length }).map(
                (_, i) => (
                  <div
                    key={`pad-${i}`}
                    className="rounded-xl border border-dashed border-white/5 bg-white/[0.02] aspect-[5/7]"
                  />
                )
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

function DexCell({
  card,
  registered,
}: {
  card: Card;
  registered: boolean;
}) {
  const rarity = card.rarity;
  const style = RARITY_STYLE[rarity];

  return (
    <div
      className={clsx(
        "relative rounded-xl overflow-hidden ring-2 bg-zinc-950 transition",
        style.frame,
        !registered && "ring-zinc-700/30"
      )}
    >
      <div
        className={clsx(
          "relative aspect-[5/7]",
          !registered && "opacity-30 saturate-50 grayscale"
        )}
      >
        {card.imageUrl ? (
          <img
            src={card.imageUrl}
            alt={card.name}
            loading="lazy"
            draggable={false}
            className="w-full h-full object-contain bg-zinc-950 select-none pointer-events-none"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-400 text-xs">
            {card.name}
          </div>
        )}
        {registered && (
          <div className="absolute top-1.5 right-1.5">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[12px] font-black bg-emerald-400 text-zinc-950 shadow-[0_0_10px_rgba(74,222,128,0.7)]">
              ✓
            </span>
          </div>
        )}
        {!registered && (
          <div className="absolute inset-0 flex items-end justify-center pb-2">
            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-black/70 text-zinc-300 border border-white/10">
              미등록
            </span>
          </div>
        )}
      </div>
      <div className="px-2 py-1.5 bg-black/60 border-t border-white/5">
        <div className="flex items-center justify-between gap-1">
          <p
            className={clsx(
              "text-[11px] font-bold truncate",
              registered ? "text-white" : "text-zinc-500"
            )}
          >
            {card.name}
          </p>
          <RarityBadge rarity={rarity} size="xs" />
        </div>
        <p className="text-[9px] text-zinc-600 mt-0.5 tabular-nums">
          {card.id}
        </p>
      </div>
    </div>
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
    <motion.div
      key="bulk-confirm"
      className="fixed inset-0 z-[190] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onCancel}
    >
      <motion.div
        className="w-full max-w-sm bg-zinc-950 border border-amber-400/40 rounded-2xl overflow-hidden shadow-2xl"
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
            보유 중인 PCL10 슬랩 (전시 중이 아니고 도감에 없는 카드) 이 모두
            도감에 박제돼요. 해당 슬랩은 <b className="text-amber-200">카드지갑
            에서 영구 삭제</b>되며 다시 꺼낼 수 없어요.
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
  );
}
