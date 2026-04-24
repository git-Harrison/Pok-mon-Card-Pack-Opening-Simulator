"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { useAuth } from "@/lib/auth";
import {
  bulkSellCards,
  fetchWallet,
  type WalletSnapshot,
} from "@/lib/db";
import {
  BULK_SELL_PRICE,
  RARITY_LABEL,
  RARITY_ORDER,
  RARITY_STYLE,
} from "@/lib/rarity";
import CoinIcon from "./CoinIcon";
import type { Rarity } from "@/lib/types";

/**
 * Dedicated bulk-sell page (replaces the earlier modal). Lists every
 * rarity the user owns with its quick-sell subtotal; tapping a row
 * confirms and sells the full stack at BULK_SELL_PRICE[rarity].
 */
export default function BulkSellView() {
  const router = useRouter();
  const { user, setPoints } = useAuth();
  const [snap, setSnap] = useState<WalletSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [selling, setSelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSale, setLastSale] = useState<{
    rarity: Rarity;
    count: number;
    earned: number;
  } | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    const w = await fetchWallet(user.id);
    setSnap(w);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const rarityTotals = useMemo(() => {
    if (!snap) return [];
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
  }, [snap]);

  const grandTotal = useMemo(
    () => rarityTotals.reduce((s, r) => s + r.price, 0),
    [rarityTotals]
  );
  const totalCards = useMemo(
    () => rarityTotals.reduce((s, r) => s + r.count, 0),
    [rarityTotals]
  );

  const sellRarity = useCallback(
    async (rarity: Rarity) => {
      if (!user || !snap) return;
      const rarityItems = snap.items.filter((it) => it.card.rarity === rarity);
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
      setError(null);
      const res = await bulkSellCards(user.id, payload);
      setSelling(false);
      if (!res.ok) {
        setError(res.error ?? "판매 실패");
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
    [user, snap, refresh, setPoints]
  );

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-5 md:py-8 fade-in">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 text-sm text-zinc-300 hover:text-white"
        >
          <span aria-hidden>←</span>
          <span>뒤로</span>
        </button>
        <Link href="/wallet" className="text-xs text-zinc-400 hover:text-white">
          지갑으로
        </Link>
      </div>

      <header className="mt-2">
        <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
          일괄 판매
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          등급을 고르면 그 등급 카드가 전부 즉시 판매됩니다. 상인보다는
          단가가 낮지만 횟수 제한이 없어요.
        </p>
      </header>

      {/* Grand total summary */}
      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-zinc-400">
            전체 합계
          </p>
          <p className="text-sm text-zinc-200">
            보유 {totalCards.toLocaleString("ko-KR")}장
          </p>
        </div>
        <p className="text-xl font-black text-amber-300 tabular-nums inline-flex items-center gap-1">
          <CoinIcon size="sm" />
          {grandTotal.toLocaleString("ko-KR")}p
        </p>
      </div>

      {lastSale && (
        <div className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs">
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
        <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-12 flex justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
        </div>
      ) : rarityTotals.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-white/10 bg-white/5 py-12 flex flex-col items-center gap-3 text-center px-4">
          <span className="text-5xl">🎴</span>
          <p className="text-lg text-white font-semibold">
            판매할 카드가 없어요
          </p>
          <p className="text-sm text-zinc-400">팩을 열어 카드를 모아보세요.</p>
          <Link
            href="/"
            className="mt-2 inline-flex items-center h-11 px-5 rounded-xl bg-gradient-to-r from-amber-400 to-rose-500 text-zinc-950 font-bold text-sm hover:scale-[1.03] transition"
          >
            팩 열러 가기
          </Link>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {rarityTotals.map(({ rarity, count, price }) => (
            <li key={rarity}>
              <button
                type="button"
                disabled={selling}
                onClick={() => sellRarity(rarity)}
                style={{ touchAction: "manipulation" }}
                className={clsx(
                  "w-full flex items-center gap-3 rounded-xl border bg-white/5 border-white/10 px-3 py-3 text-left transition",
                  "hover:bg-white/10 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                <span
                  className={clsx(
                    "shrink-0 inline-flex items-center justify-center min-w-[56px] h-9 px-2.5 rounded-full text-xs font-black",
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
  );
}
