"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import {
  RARITY_ORDER,
  RARITY_STYLE,
  compareRarity,
} from "@/lib/rarity";
import type { Card, Rarity, SetCode } from "@/lib/types";
import { SETS, SET_ORDER } from "@/lib/sets";
import { useAuth } from "@/lib/auth";
import { fetchWallet, type WalletSnapshot } from "@/lib/db";
import PokeCard from "./PokeCard";
import CardDetailModal from "./CardDetailModal";
import { motion } from "framer-motion";

type RarityFilter = "ALL" | Rarity;
type SetFilter = "ALL" | SetCode;

export default function WalletView() {
  const { user } = useAuth();
  const [snap, setSnap] = useState<WalletSnapshot>({
    items: [],
    packsOpenedBySet: { m2a: 0, m2: 0, sv8: 0 },
    totalCards: 0,
  });
  const [loading, setLoading] = useState(true);
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>("ALL");
  const [setFilter, setSetFilter] = useState<SetFilter>("ALL");
  const [selected, setSelected] = useState<{ card: Card; count: number } | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    const s = await fetchWallet(user.id);
    setSnap(s);
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
      .filter((e) =>
        setFilter === "ALL" ? true : e.card.setCode === setFilter
      )
      .sort((a, b) => {
        const rd = compareRarity(a.card.rarity, b.card.rarity);
        if (rd !== 0) return rd;
        return a.card.number.localeCompare(b.card.number);
      });
  }, [snap.items, rarityFilter, setFilter]);

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
        </div>
      </div>

      {/* Set tabs */}
      <div className="mt-6 flex flex-wrap gap-2">
        <FilterPill
          active={setFilter === "ALL"}
          onClick={() => setSetFilter("ALL")}
        >
          전체 세트
        </FilterPill>
        {SET_ORDER.map((code) => (
          <FilterPill
            key={code}
            active={setFilter === code}
            onClick={() => setSetFilter(code)}
          >
            {SETS[code].name}
            <span className="ml-1.5 text-[10px] opacity-70">
              {snap.packsOpenedBySet[code]}팩
            </span>
          </FilterPill>
        ))}
      </div>

      {/* Rarity tabs */}
      <div className="mt-3 flex flex-wrap gap-2">
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

      {/* Cards grid */}
      {loading ? (
        <div className="mt-16 flex justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState />
      ) : (
        <div
          className="mt-6 md:mt-8 grid gap-3 md:gap-5"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
          }}
        >
          {items.map(({ card, count }) => (
            <motion.div
              layoutId={`card-${card.id}`}
              key={card.id}
              className="relative flex flex-col items-center gap-1.5 cursor-pointer"
              whileTap={{ scale: 0.97 }}
              onClick={() => setSelected({ card, count })}
            >
              <PokeCard card={card} revealed size="md" />
              {count > 1 && (
                <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur text-white font-bold text-[10px] ring-1 ring-white/20">
                  ×{count}
                </span>
              )}
              <div className="w-full text-center px-1">
                <p className="text-[11px] text-zinc-300 leading-tight line-clamp-2">
                  {card.name}
                </p>
                <p className="text-[10px] text-zinc-500">
                  {SETS[card.setCode].name} · #{card.number}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <CardDetailModal
        card={selected?.card ?? null}
        count={selected?.count ?? 0}
        onClose={() => setSelected(null)}
        onAfterGift={refresh}
      />
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-zinc-400">
        {label}
      </div>
      <div className="text-sm font-bold text-white">{value}</div>
    </div>
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
