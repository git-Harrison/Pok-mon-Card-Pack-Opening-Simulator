"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import clsx from "clsx";
import {
  RARITY_ORDER,
  RARITY_STYLE,
  compareRarity,
} from "@/lib/rarity";
import type { Card, Rarity } from "@/lib/types";
import { SETS, getCard } from "@/lib/sets";
import { useAuth } from "@/lib/auth";
import {
  fetchAllGradingsWithDisplay,
  fetchWallet,
  type PsaGradingWithDisplay,
  type WalletSnapshot,
} from "@/lib/db";
import Link from "next/link";
import PokeCard from "./PokeCard";
import PsaSlab from "./PsaSlab";
import CoinIcon from "./CoinIcon";
import PageHeader from "./PageHeader";

type Mode = "cards" | "psa";
type RarityFilter = "ALL" | Rarity;

export default function WalletView() {
  const { user } = useAuth();
  const params = useSearchParams();
  const initialMode: Mode = params.get("tab") === "psa" ? "psa" : "cards";
  const [mode, setMode] = useState<Mode>(initialMode);

  const [snap, setSnap] = useState<WalletSnapshot>({
    items: [],
    packsOpenedBySet: { m2a: 0, m2: 0, sv8: 0, sv2a: 0, sv8a: 0, sv5a: 0 },
    totalCards: 0,
  });
  const [psa, setPsa] = useState<PsaGradingWithDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>("ALL");

  const refresh = useCallback(async () => {
    if (!user) return;
    const [w, g] = await Promise.all([
      fetchWallet(user.id),
      fetchAllGradingsWithDisplay(user.id),
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
        (v): v is { grading: PsaGradingWithDisplay; card: Card } => v !== null
      )
      .sort((a, b) => {
        // Undisplayed first, then by grade desc so active slabs feel primary.
        if (a.grading.displayed !== b.grading.displayed) {
          return a.grading.displayed ? 1 : -1;
        }
        return b.grading.grade - a.grading.grade;
      });
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
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-5 md:py-8 fade-in">
      <PageHeader
        title="내 카드지갑"
        subtitle="카드를 눌러 상세·선물·공유"
        stats={
          <>
            <Kpi label="종류" value={`${snap.items.length}`} />
            <Kpi
              label="장수"
              value={`${snap.totalCards} / 5,000`}
              highlight={snap.totalCards >= 4500}
            />
            <Kpi label="개봉" value={`${totalPacks}팩`} />
            <Kpi
              label="PCL"
              value={`${psa.length} / 1,000`}
              highlight={psa.length >= 900}
            />
          </>
        }
      />

      {/* Primary mode tabs */}
      <div className="mt-6 inline-flex items-stretch rounded-xl bg-white/5 border border-white/10 p-1">
        <ModeTab active={mode === "cards"} onClick={() => setMode("cards")}>
          보유 카드
          <span className="ml-1.5 text-[10px] opacity-70">
            {snap.items.length}
          </span>
        </ModeTab>
        <ModeTab active={mode === "psa"} onClick={() => setMode("psa")}>
          PCL 감별
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
          hasAny={snap.items.length > 0 || psa.length > 0}
        />
      ) : (
        <PsaMode items={psaItems} />
      )}
    </div>
  );
}

function CardsMode({
  items,
  rarityCounts,
  rarityFilter,
  setRarityFilter,
  hasAny,
}: {
  items: { card: Card; count: number }[];
  rarityCounts: Map<Rarity, number>;
  rarityFilter: RarityFilter;
  setRarityFilter: (r: RarityFilter) => void;
  hasAny: boolean;
}) {
  return (
    <>
      {/* Compact filter row: single horizontal scroll + tight bulk-sell chip. */}
      <div className="mt-4 flex items-center gap-2">
        <div
          className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar"
          style={{ scrollbarWidth: "none" }}
        >
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
        {hasAny ? (
          <Link
            href="/wallet/bulk-sell"
            style={{ touchAction: "manipulation" }}
            aria-label="일괄 판매"
            className="shrink-0 h-7 px-2.5 rounded-full text-[11px] font-bold inline-flex items-center gap-1 bg-gradient-to-r from-emerald-400 to-amber-400 text-zinc-950 hover:scale-[1.03] active:scale-[0.97] transition"
          >
            <CoinIcon size="xs" />
            <span className="hidden sm:inline">일괄 판매</span>
            <span className="sm:hidden">판매</span>
          </Link>
        ) : (
          <span className="shrink-0 h-7 px-2.5 rounded-full text-[11px] font-bold border border-white/10 bg-white/5 text-zinc-500 inline-flex items-center gap-1">
            <CoinIcon size="xs" />
            <span className="hidden sm:inline">일괄 판매</span>
            <span className="sm:hidden">판매</span>
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <div
          className="mt-6 md:mt-8 grid gap-4 md:gap-6"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
          }}
        >
          {items.map(({ card, count }) => (
            <Link
              key={card.id}
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
          ))}
        </div>
      )}
    </>
  );
}

function PsaMode({
  items,
}: {
  items: { grading: PsaGradingWithDisplay; card: Card }[];
}) {
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
  const displayedCount = items.filter((x) => x.grading.displayed).length;
  return (
    <>
      {/* Context blurb — explains the "전시 중" badge + wild lockout. */}
      <div className="mt-4 rounded-xl border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-2 text-[11px] text-fuchsia-100 leading-snug">
        🏛️ <b>전시 중</b> 배지가 붙은 슬랩은 지금 센터에 전시돼 있어요.
        전시된 카드는 <b>일괄 판매 · 야생 배틀 · 재감별</b>에 사용할 수 없고,
        센터에서 꺼내거나 상대에게 부서지기 전까지 잠겨있어요.
        {displayedCount > 0 && (
          <span className="ml-1 text-fuchsia-300 font-bold">
            (현재 {displayedCount}장 전시 중)
          </span>
        )}
      </div>
      <div
        className="mt-6 md:mt-8 grid gap-10 md:gap-12 place-items-center"
        style={{
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        }}
      >
        {items.map(({ grading, card }) => (
          <div
            key={grading.id}
            className={clsx(
              "relative flex flex-col items-center gap-3",
              grading.displayed && "opacity-80"
            )}
          >
            <div className="relative">
              <PsaSlab card={card} grade={grading.grade} size="md" />
              {grading.displayed && (
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-fuchsia-500 text-white text-[10px] font-black shadow-[0_4px_10px_rgba(217,70,239,0.6)] whitespace-nowrap">
                  🏛️ 전시 중
                </span>
              )}
            </div>
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
    </>
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
