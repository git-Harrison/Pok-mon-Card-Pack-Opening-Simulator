"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { useAuth } from "@/lib/auth";
import {
  bulkSellCards,
  bulkSellGradings,
  fetchPsaGradings,
  fetchWallet,
  type WalletSnapshot,
} from "@/lib/db";
import {
  BULK_SELL_PRICE,
  RARITY_LABEL,
  RARITY_ORDER,
  RARITY_STYLE,
} from "@/lib/rarity";
import { PCL_SELL_PRICE, psaTone } from "@/lib/psa";
import CoinIcon from "./CoinIcon";
import PageHeader from "./PageHeader";
import type { PsaGrading, Rarity } from "@/lib/types";

/**
 * Dedicated bulk-sell page. Two sections:
 * - Regular owned cards (from card_ownership) at BULK_SELL_PRICE[rarity]
 * - PCL-graded slabs (undisplayed) at PCL_SELL_PRICE[grade]
 *
 * Both sections sell by category (rarity / grade). Displayed slabs are
 * excluded by `fetchPsaGradings` → `get_undisplayed_gradings` RPC.
 */
export default function BulkSellView() {
  const router = useRouter();
  const { user, setPoints } = useAuth();
  const [snap, setSnap] = useState<WalletSnapshot | null>(null);
  const [gradings, setGradings] = useState<PsaGrading[]>([]);
  const [loading, setLoading] = useState(true);
  const [selling, setSelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSale, setLastSale] = useState<{
    label: string;
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
    setGradings(g);
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

  // Group PCL gradings (undisplayed only) by grade.
  const gradeTotals = useMemo(() => {
    const m = new Map<number, { ids: string[]; price: number }>();
    for (const g of gradings) {
      if (PCL_SELL_PRICE[g.grade] === undefined) continue;
      const cur = m.get(g.grade) ?? { ids: [], price: 0 };
      cur.ids.push(g.id);
      cur.price += PCL_SELL_PRICE[g.grade];
      m.set(g.grade, cur);
    }
    // High grade first.
    return [10, 9, 8, 7, 6]
      .map((grade) => ({ grade, ...(m.get(grade) ?? { ids: [], price: 0 }) }))
      .filter((x) => x.ids.length > 0);
  }, [gradings]);

  const grandTotal = useMemo(
    () =>
      rarityTotals.reduce((s, r) => s + r.price, 0) +
      gradeTotals.reduce((s, r) => s + r.price, 0),
    [rarityTotals, gradeTotals]
  );
  const totalUnits = useMemo(
    () =>
      rarityTotals.reduce((s, r) => s + r.count, 0) +
      gradeTotals.reduce((s, r) => s + r.ids.length, 0),
    [rarityTotals, gradeTotals]
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
        label: `${rarity} 등급`,
        count: res.sold ?? totalCount,
        earned: res.earned ?? totalPoints,
      });
      await refresh();
    },
    [user, snap, refresh, setPoints]
  );

  const sellGrade = useCallback(
    async (grade: number, ids: string[]) => {
      if (!user || ids.length === 0) return;
      const totalPoints = ids.length * PCL_SELL_PRICE[grade];
      const ok = window.confirm(
        `PCL ${grade}등급 슬랩 ${ids.length}장을 전부 판매할까요?\n+${totalPoints.toLocaleString("ko-KR")}p 지급`
      );
      if (!ok) return;
      setSelling(true);
      setError(null);
      const res = await bulkSellGradings(user.id, ids);
      setSelling(false);
      if (!res.ok) {
        setError(res.error ?? "판매 실패");
        return;
      }
      if (typeof res.points === "number") setPoints(res.points);
      setLastSale({
        label: `PCL ${grade}등급`,
        count: res.sold ?? ids.length,
        earned: res.earned ?? totalPoints,
      });
      await refresh();
    },
    [user, refresh, setPoints]
  );

  const hasAny = rarityTotals.length > 0 || gradeTotals.length > 0;

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

      <div className="mt-2">
        <PageHeader
          title="일괄 판매"
          subtitle="일반 카드는 등급별로, PCL 슬랩은 판정 등급별로 즉시 판매"
        />
      </div>

      {/* Grand total summary */}
      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-zinc-400">
            전체 합계
          </p>
          <p className="text-sm text-zinc-200">
            판매 가능 {totalUnits.toLocaleString("ko-KR")}장
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
            {lastSale.label} {lastSale.count}장 판매 완료
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
      ) : !hasAny ? (
        <div className="mt-10 rounded-2xl border border-dashed border-white/10 bg-white/5 py-12 flex flex-col items-center gap-3 text-center px-4">
          <span className="text-5xl">🎴</span>
          <p className="text-lg text-white font-semibold">
            판매할 카드가 없어요
          </p>
          <p className="text-sm text-zinc-400">
            팩을 열거나 감별을 받아 보세요.
          </p>
          <Link
            href="/"
            className="mt-2 inline-flex items-center h-11 px-5 rounded-xl bg-gradient-to-r from-amber-400 to-rose-500 text-zinc-950 font-bold text-sm hover:scale-[1.03] transition"
          >
            팩 열러 가기
          </Link>
        </div>
      ) : (
        <>
          {/* PCL 감별 카드 section — shown first since they usually pay more */}
          {gradeTotals.length > 0 && (
            <section className="mt-5">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs uppercase tracking-[0.2em] text-fuchsia-300 font-bold">
                  PCL 감별 슬랩
                </h2>
                <span className="text-[10px] text-zinc-500">
                  전시 중인 슬랩은 제외
                </span>
              </div>
              <ul className="space-y-2">
                {gradeTotals.map(({ grade, ids, price }) => {
                  const tone = psaTone(grade);
                  return (
                    <li key={grade}>
                      <button
                        type="button"
                        disabled={selling}
                        onClick={() => sellGrade(grade, ids)}
                        style={{ touchAction: "manipulation" }}
                        className={clsx(
                          "w-full flex items-center gap-3 rounded-xl border bg-white/5 border-white/10 px-3 py-3 text-left transition",
                          "hover:bg-white/10 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                        )}
                      >
                        <span
                          className={clsx(
                            "shrink-0 inline-flex flex-col items-center justify-center min-w-[56px] h-10 px-2.5 rounded-full text-[10px] font-black tabular-nums leading-none",
                            tone.banner
                          )}
                        >
                          <span className="text-[8px] uppercase tracking-wider opacity-80">
                            PCL
                          </span>
                          <span className="text-base mt-0.5">{grade}</span>
                        </span>
                        <div className="flex-1 min-w-0">
                          <p
                            className={clsx(
                              "text-sm font-bold truncate",
                              tone.text
                            )}
                          >
                            {gradeTitle(grade)}
                          </p>
                          <p className="text-[11px] text-zinc-400 tabular-nums">
                            {ids.length}장 · 장당{" "}
                            {PCL_SELL_PRICE[grade].toLocaleString("ko-KR")}p
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
                  );
                })}
              </ul>
            </section>
          )}

          {/* Regular cards section */}
          {rarityTotals.length > 0 && (
            <section className="mt-5">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs uppercase tracking-[0.2em] text-amber-300 font-bold">
                  일반 카드
                </h2>
                <span className="text-[10px] text-zinc-500">
                  상인보다 단가 낮음
                </span>
              </div>
              <ul className="space-y-2">
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
            </section>
          )}
        </>
      )}
    </div>
  );
}

function gradeTitle(grade: number): string {
  if (grade === 10) return "GEM MINT";
  if (grade === 9) return "MINT";
  if (grade === 8) return "NM-MT";
  if (grade === 7) return "NEAR MINT";
  if (grade === 6) return "EX-MT";
  return `PCL ${grade}`;
}
