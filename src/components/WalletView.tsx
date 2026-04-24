"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import clsx from "clsx";
import {
  MERCHANT_PRICE,
  RARITY_ORDER,
  RARITY_STYLE,
  compareRarity,
} from "@/lib/rarity";
import CoinIcon from "./CoinIcon";
import { bulkSellCards } from "@/lib/db";
import type { Card, PsaGrading, Rarity } from "@/lib/types";
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
import { motion } from "framer-motion";

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
  const [selectMode, setSelectMode] = useState(false);
  // card_id → count to sell
  const [sellSelection, setSellSelection] = useState<Record<string, number>>({});
  const [selling, setSelling] = useState(false);
  const [sellError, setSellError] = useState<string | null>(null);

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

  const totalPacks = useMemo(
    () =>
      Object.values(snap.packsOpenedBySet).reduce((s, n) => s + n, 0),
    [snap.packsOpenedBySet]
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
          <Kpi label="PSA 감별" value={`${psa.length}장`} highlight />
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
          PSA 감별
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
          selectMode={selectMode}
          setSelectMode={(v) => {
            setSelectMode(v);
            if (!v) setSellSelection({});
          }}
          sellSelection={sellSelection}
          toggleSell={(card, delta) => {
            setSellSelection((prev) => {
              const cur = prev[card.id] ?? 0;
              const max =
                items.find((it) => it.card.id === card.id)?.count ?? 0;
              const next = Math.max(0, Math.min(max, cur + delta));
              const copy = { ...prev };
              if (next === 0) delete copy[card.id];
              else copy[card.id] = next;
              return copy;
            });
          }}
        />
      ) : (
        <PsaMode items={psaItems} />
      )}

      {/* Bulk sell bottom sheet */}
      {selectMode && mode === "cards" && (
        <BulkSellBar
          items={snap.items}
          selection={sellSelection}
          selling={selling}
          error={sellError}
          onCancel={() => {
            setSellSelection({});
            setSellError(null);
          }}
          onSell={async () => {
            if (!user) return;
            const payload = Object.entries(sellSelection)
              .filter(([, n]) => n > 0)
              .map(([card_id, count]) => {
                const it = snap.items.find((x) => x.card.id === card_id);
                const price = it ? MERCHANT_PRICE[it.card.rarity] : 0;
                return { card_id, count, price };
              });
            if (payload.length === 0) return;
            setSelling(true);
            setSellError(null);
            const res = await bulkSellCards(user.id, payload);
            setSelling(false);
            if (!res.ok) {
              setSellError(res.error ?? "판매 실패");
              return;
            }
            if (typeof res.points === "number") setPoints(res.points);
            setSellSelection({});
            setSelectMode(false);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function BulkSellBar({
  items,
  selection,
  selling,
  error,
  onCancel,
  onSell,
}: {
  items: { card: Card; count: number }[];
  selection: Record<string, number>;
  selling: boolean;
  error: string | null;
  onCancel: () => void;
  onSell: () => void;
}) {
  const { totalCount, totalPoints } = useMemo(() => {
    let c = 0;
    let p = 0;
    for (const [id, n] of Object.entries(selection)) {
      if (n <= 0) continue;
      const it = items.find((x) => x.card.id === id);
      if (!it) continue;
      c += n;
      p += n * MERCHANT_PRICE[it.card.rarity];
    }
    return { totalCount: c, totalPoints: p };
  }, [items, selection]);

  const hasAny = totalCount > 0;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-zinc-950/95 backdrop-blur-md md:bottom-0"
      style={{
        paddingBottom:
          "max(env(safe-area-inset-bottom, 0px), 12px)",
        // lift above the mobile bottom-tab nav (64px + safe area)
        marginBottom: "calc(4rem + env(safe-area-inset-bottom, 0px))",
      }}
    >
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-zinc-400">
            선택: <span className="text-white font-bold">{totalCount}장</span>
          </p>
          <p className="text-sm font-bold text-amber-300 tabular-nums inline-flex items-center gap-1">
            <CoinIcon size="xs" />
            +{totalPoints.toLocaleString("ko-KR")}p
          </p>
          {error && <p className="text-[11px] text-rose-300">{error}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            disabled={selling}
            className="h-10 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-white text-xs font-semibold border border-white/10"
          >
            초기화
          </button>
          <button
            onClick={onSell}
            disabled={selling || !hasAny}
            style={{ touchAction: "manipulation" }}
            className="h-10 px-4 rounded-lg bg-gradient-to-r from-emerald-400 to-amber-400 text-zinc-950 font-bold text-sm active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {selling ? "판매 중..." : "선택한 카드 팔기"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CardsMode({
  items,
  rarityCounts,
  rarityFilter,
  setRarityFilter,
  selectMode,
  setSelectMode,
  sellSelection,
  toggleSell,
}: {
  items: { card: Card; count: number }[];
  rarityCounts: Map<Rarity, number>;
  rarityFilter: RarityFilter;
  setRarityFilter: (r: RarityFilter) => void;
  selectMode: boolean;
  setSelectMode: (v: boolean) => void;
  sellSelection: Record<string, number>;
  toggleSell: (card: Card, delta: number) => void;
}) {
  return (
    <>
      {/* Rarity tabs + select-mode toggle */}
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
          onClick={() => setSelectMode(!selectMode)}
          style={{ touchAction: "manipulation" }}
          className={clsx(
            "h-9 px-3 rounded-full text-xs font-semibold border transition shrink-0",
            selectMode
              ? "bg-amber-400 text-zinc-950 border-amber-400"
              : "bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10"
          )}
        >
          {selectMode ? "선택 취소" : "다중선택 판매"}
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
          {items.map(({ card, count }) => {
            const sellCount = sellSelection[card.id] ?? 0;
            const isSelected = sellCount > 0;
            const body = (
              <>
                <PokeCard card={card} revealed size="md" />
                {count > 1 && !selectMode && (
                  <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur text-white font-bold text-[10px] ring-1 ring-white/20 pointer-events-none">
                    ×{count}
                  </span>
                )}
                {selectMode && (
                  <SellQtyBadge
                    card={card}
                    sellCount={sellCount}
                    owned={count}
                    onChange={toggleSell}
                  />
                )}
                <div className="w-full text-center px-1 pointer-events-none">
                  <p className="text-[11px] text-zinc-300 leading-tight line-clamp-2">
                    {card.name}
                  </p>
                  <p className="text-[10px] text-zinc-500">
                    {SETS[card.setCode].name} · #{card.number}
                  </p>
                </div>
              </>
            );
            if (selectMode) {
              return (
                <div
                  key={card.id}
                  role="button"
                  tabIndex={0}
                  className={clsx(
                    "relative flex flex-col items-center gap-1.5 cursor-pointer active:scale-[0.97] transition-transform rounded-xl",
                    isSelected && "ring-2 ring-amber-400"
                  )}
                  style={{ touchAction: "manipulation" }}
                  onClick={() => toggleSell(card, 1)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleSell(card, 1);
                    }
                  }}
                >
                  {body}
                </div>
              );
            }
            // Route-based detail view — much more reliable than a modal
            // because there is no fixed-position CSS layer that can
            // conflict with app shell styles.
            return (
              <Link
                key={card.id}
                href={`/card/${encodeURIComponent(card.id)}`}
                className="relative flex flex-col items-center gap-1.5 rounded-xl active:scale-[0.97] transition-transform"
                style={{ touchAction: "manipulation" }}
              >
                {body}
              </Link>
            );
          })}
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
          PSA 감별 페이지에서 카드를 맡기고 등급을 받아보세요.
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
      className="mt-6 md:mt-8 grid gap-6 md:gap-8 place-items-center"
      style={{
        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
      }}
    >
      {items.map(({ grading, card }) => (
        <div key={grading.id} className="flex flex-col items-center gap-2">
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

function SellQtyBadge({
  card,
  sellCount,
  owned,
  onChange,
}: {
  card: Card;
  sellCount: number;
  owned: number;
  onChange: (card: Card, delta: number) => void;
}) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="absolute top-1 right-1 flex items-center gap-0.5 rounded-full bg-black/80 ring-1 ring-white/20 backdrop-blur p-0.5"
    >
      <button
        type="button"
        onClick={() => onChange(card, -1)}
        disabled={sellCount <= 0}
        className="w-6 h-6 rounded-full bg-white/10 text-white text-xs disabled:opacity-30 active:scale-95"
      >
        −
      </button>
      <span className="min-w-[18px] text-center text-xs text-white font-bold tabular-nums">
        {sellCount}
      </span>
      <button
        type="button"
        onClick={() => onChange(card, 1)}
        disabled={sellCount >= owned}
        className="w-6 h-6 rounded-full bg-amber-400 text-zinc-950 text-xs font-bold disabled:opacity-30 active:scale-95"
      >
        +
      </button>
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
