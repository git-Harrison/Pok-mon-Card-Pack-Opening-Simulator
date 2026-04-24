"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import clsx from "clsx";
import {
  BULK_SELL_PRICE,
  RARITY_ORDER,
  RARITY_STYLE,
  compareRarity,
} from "@/lib/rarity";
import CoinIcon from "./CoinIcon";
import { bulkSellCards } from "@/lib/db";
import type { Card, PsaGrading, Rarity } from "@/lib/types";
import { RARITY_LABEL } from "@/lib/rarity";
import { SETS, getCard } from "@/lib/sets";
import { useAuth } from "@/lib/auth";
import {
  fetchPsaGradings,
  fetchWallet,
  type WalletSnapshot,
} from "@/lib/db";
import Link from "next/link";
import PokeCard from "./PokeCard";
import PsaSlab from "./PsaSlab";
import { AnimatePresence, motion } from "framer-motion";

type Mode = "cards" | "psa";
type RarityFilter = "ALL" | Rarity;

export default function WalletView() {
  const { user, setPoints } = useAuth();
  const params = useSearchParams();
  const initialMode: Mode = params.get("tab") === "psa" ? "psa" : "cards";
  const [mode, setMode] = useState<Mode>(initialMode);

  const [snap, setSnap] = useState<WalletSnapshot>({
    items: [],
    packsOpenedBySet: { m2a: 0, m2: 0, sv8: 0, sv2a: 0, sv8a: 0, sv5a: 0 },
    totalCards: 0,
  });
  const [psa, setPsa] = useState<PsaGrading[]>([]);
  const [loading, setLoading] = useState(true);
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>("ALL");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [selling, setSelling] = useState(false);
  const [sellError, setSellError] = useState<string | null>(null);
  const [lastSale, setLastSale] = useState<{
    rarity: Rarity;
    count: number;
    earned: number;
  } | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    const [w, g] = await Promise.all([
      fetchWallet(user.id),
      fetchPsaGradings(user.id),
    ]);
    setSnap(w);
    setPsa(g);
    setLoading(false);
  }, [user]);

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

  const psaItems = useMemo(() => {
    return psa
      .map((g) => {
        const card = getCard(g.card_id);
        if (!card) return null;
        return { grading: g, card };
      })
      .filter(
        (v): v is { grading: PsaGrading; card: Card } => v !== null
      )
      .sort((a, b) => b.grading.grade - a.grading.grade);
  }, [psa]);

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

  const rarityTotals = useMemo(() => {
    const m = new Map<Rarity, { count: number; price: number }>();
    for (const it of snap.items) {
      const cur = m.get(it.card.rarity) ?? { count: 0, price: 0 };
      cur.count += it.count;
      cur.price += it.count * BULK_SELL_PRICE[it.card.rarity];
      m.set(it.card.rarity, cur);
    }
    return RARITY_ORDER.map((r) => ({
      rarity: r,
      ...(m.get(r) ?? { count: 0, price: 0 }),
    })).filter((x) => x.count > 0);
  }, [snap.items]);

  const totalPacks = useMemo(
    () =>
      Object.values(snap.packsOpenedBySet).reduce((s, n) => s + n, 0),
    [snap.packsOpenedBySet]
  );

  const sellRarity = useCallback(
    async (rarity: Rarity) => {
      if (!user) return;
      const rarityItems = snap.items.filter(
        (it) => it.card.rarity === rarity
      );
      if (rarityItems.length === 0) return;
      const totalCount = rarityItems.reduce((s, it) => s + it.count, 0);
      const totalPoints = totalCount * BULK_SELL_PRICE[rarity];
      const ok = window.confirm(
        `${rarity} 등급 카드 ${totalCount}장을 전부 판매할까요?\n+${totalPoints.toLocaleString("ko-KR")}p 지급`
      );
      if (!ok) return;
      const payload = rarityItems.map((it) => ({
        card_id: it.card.id,
        count: it.count,
        price: BULK_SELL_PRICE[rarity],
      }));
      setSelling(true);
      setSellError(null);
      const res = await bulkSellCards(user.id, payload);
      setSelling(false);
      if (!res.ok) {
        setSellError(res.error ?? "판매 실패");
        return;
      }
      if (typeof res.points === "number") setPoints(res.points);
      setLastSale({
        rarity,
        count: res.sold ?? totalCount,
        earned: res.earned ?? totalPoints,
      });
      await refresh();
    },
    [user, snap.items, refresh, setPoints]
  );

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10 fade-in">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-4xl font-black text-white tracking-tight">
            내 카드지갑
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            서버에 안전하게 저장되는 내 수집 카드. 카드를 눌러 자세히 보거나 다른 친구에게 선물할 수 있습니다.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Kpi label="보유 카드" value={`${snap.items.length}종`} />
          <Kpi label="총 장수" value={`${snap.totalCards}장`} />
          <Kpi label="총 개봉" value={`${totalPacks}팩`} />
          <Kpi label="AURA 감별" value={`${psa.length}장`} highlight />
        </div>
      </div>

      {/* Primary mode tabs */}
      <div className="mt-6 inline-flex items-stretch rounded-xl bg-white/5 border border-white/10 p-1">
        <ModeTab active={mode === "cards"} onClick={() => setMode("cards")}>
          보유 카드
          <span className="ml-1.5 text-[10px] opacity-70">
            {snap.items.length}
          </span>
        </ModeTab>
        <ModeTab active={mode === "psa"} onClick={() => setMode("psa")}>
          AURA 감별
          <span className="ml-1.5 text-[10px] opacity-70">{psa.length}</span>
        </ModeTab>
      </div>

      {loading ? (
        <div className="mt-16 flex justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
        </div>
      ) : mode === "cards" ? (
        <CardsMode
          items={items}
          rarityCounts={rarityCounts}
          rarityFilter={rarityFilter}
          setRarityFilter={setRarityFilter}
          onOpenBulk={() => {
            setSellError(null);
            setLastSale(null);
            setBulkOpen(true);
          }}
          hasAny={snap.items.length > 0}
        />
      ) : (
        <PsaMode items={psaItems} />
      )}

      <AnimatePresence>
        {bulkOpen && mode === "cards" && (
          <BulkSellModal
            rarityTotals={rarityTotals}
            selling={selling}
            error={sellError}
            lastSale={lastSale}
            onClose={() => setBulkOpen(false)}
            onSellRarity={sellRarity}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function BulkSellModal({
  rarityTotals,
  selling,
  error,
  lastSale,
  onClose,
  onSellRarity,
}: {
  rarityTotals: { rarity: Rarity; count: number; price: number }[];
  selling: boolean;
  error: string | null;
  lastSale: { rarity: Rarity; count: number; earned: number } | null;
  onClose: () => void;
  onSellRarity: (rarity: Rarity) => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-md flex items-center justify-center overflow-hidden"
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
        className="relative w-full max-w-md bg-zinc-950 border border-white/10 rounded-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: "calc(100dvh - 24px)" }}
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.94, opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between h-12 px-4 border-b border-white/10 shrink-0">
          <div>
            <h3 className="text-sm font-bold text-white">일괄 판매</h3>
            <p className="text-[10px] text-zinc-500">
              등급을 고르면 해당 등급 카드 전량이 판매됩니다
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
            style={{ touchAction: "manipulation" }}
          >
            ✕
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {lastSale && (
            <div className="mx-3 mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs">
              <p className="text-emerald-200 font-semibold">
                {lastSale.rarity} 등급 {lastSale.count}장 판매 완료
              </p>
              <p className="mt-0.5 text-emerald-300 tabular-nums inline-flex items-center gap-1">
                <CoinIcon size="xs" />+
                {lastSale.earned.toLocaleString("ko-KR")}p 지급
              </p>
            </div>
          )}
          {error && (
            <div className="mx-3 mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {error}
            </div>
          )}

          {rarityTotals.length === 0 ? (
            <div className="py-10 text-center text-sm text-zinc-400">
              판매할 카드가 없어요.
            </div>
          ) : (
            <ul className="p-3 space-y-1.5">
              {rarityTotals.map(({ rarity, count, price }) => (
                <li key={rarity}>
                  <button
                    type="button"
                    disabled={selling}
                    onClick={() => onSellRarity(rarity)}
                    style={{ touchAction: "manipulation" }}
                    className={clsx(
                      "w-full flex items-center gap-3 rounded-xl border bg-white/5 border-white/10 px-3 py-2.5 text-left",
                      "hover:bg-white/10 active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                  >
                    <span
                      className={clsx(
                        "shrink-0 inline-flex items-center justify-center min-w-[48px] h-8 px-2 rounded-full text-[11px] font-black",
                        RARITY_STYLE[rarity].badge
                      )}
                    >
                      {rarity}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                        {RARITY_LABEL[rarity]}
                      </p>
                      <p className="text-[11px] text-zinc-400 tabular-nums">
                        {count}장 · 장당{" "}
                        {BULK_SELL_PRICE[rarity].toLocaleString("ko-KR")}p
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-black text-amber-300 tabular-nums inline-flex items-center gap-1">
                        <CoinIcon size="xs" />+
                        {price.toLocaleString("ko-KR")}
                      </p>
                      <p className="text-[10px] text-zinc-500">일괄 판매</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function CardsMode({
  items,
  rarityCounts,
  rarityFilter,
  setRarityFilter,
  onOpenBulk,
  hasAny,
}: {
  items: { card: Card; count: number }[];
  rarityCounts: Map<Rarity, number>;
  rarityFilter: RarityFilter;
  setRarityFilter: (r: RarityFilter) => void;
  onOpenBulk: () => void;
  hasAny: boolean;
}) {
  return (
    <>
      {/* Rarity tabs + bulk-sell CTA */}
      <div className="mt-5 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex flex-wrap gap-2">
          <FilterPill
            active={rarityFilter === "ALL"}
            onClick={() => setRarityFilter("ALL")}
          >
            전체 등급
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
                    "inline-block w-2 h-2 rounded-full mr-1.5",
                    RARITY_STYLE[r].badge
                  )}
                />
                {r}
                <span className="ml-1.5 text-[10px] opacity-70">{count}</span>
              </FilterPill>
            );
          })}
        </div>
        <button
          onClick={onOpenBulk}
          disabled={!hasAny}
          style={{ touchAction: "manipulation" }}
          className={clsx(
            "h-9 px-3.5 rounded-full text-xs font-bold border transition shrink-0 inline-flex items-center gap-1.5",
            hasAny
              ? "bg-gradient-to-r from-emerald-400 to-amber-400 text-zinc-950 border-transparent hover:scale-[1.02] active:scale-[0.97]"
              : "bg-white/5 text-zinc-500 border-white/10 cursor-not-allowed"
          )}
        >
          <CoinIcon size="xs" />
          일괄 판매
        </button>
      </div>

      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <div
          className="mt-6 md:mt-8 grid gap-6 md:gap-8"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
          }}
        >
          {items.map(({ card, count }) => (
            <Link
              key={card.id}
              href={`/card/${encodeURIComponent(card.id)}`}
              className="relative flex flex-col items-center gap-1.5 rounded-xl active:scale-[0.97] transition-transform"
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
          ))}
        </div>
      )}
    </>
  );
}

function PsaMode({
  items,
}: {
  items: { grading: PsaGrading; card: Card }[];
}) {
  if (items.length === 0) {
    return (
      <div className="mt-12 rounded-2xl border border-dashed border-white/10 bg-white/5 py-12 md:py-14 flex flex-col items-center gap-3 text-center px-4">
        <span className="text-5xl">🧿</span>
        <p className="text-lg text-white font-semibold">
          아직 감별한 카드가 없습니다
        </p>
        <p className="text-sm text-zinc-400">
          AURA 감별 페이지에서 카드를 맡기고 등급을 받아보세요.
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
    <div
      className="mt-6 md:mt-8 grid gap-10 md:gap-12 place-items-center"
      style={{
        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
      }}
    >
      {items.map(({ grading, card }) => (
        <div key={grading.id} className="flex flex-col items-center gap-3">
          <PsaSlab card={card} grade={grading.grade} size="md" />
          <div className="w-full text-center px-1">
            <p className="text-[11px] text-zinc-300 leading-tight line-clamp-2">
              {card.name}
            </p>
            <p className="text-[10px] text-zinc-500 tabular-nums">
              {SETS[card.setCode].name} · #{card.number} ·{" "}
              {new Date(grading.graded_at).toLocaleDateString("ko-KR")}
            </p>
          </div>
        </div>
      ))}
    </div>
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
        "inline-flex items-center px-2.5 py-1.5 rounded-full text-xs font-semibold border transition",
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
