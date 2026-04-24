"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { useAuth } from "@/lib/auth";
import {
  fetchWallet,
  getMerchantState,
  refreshMerchantRPC,
  sellToMerchant,
  type WalletSnapshot,
} from "@/lib/db";
import { getCard, SETS, SET_ORDER } from "@/lib/sets";
import { MERCHANT_PRICE, RARITY_STYLE, cardFxClass } from "@/lib/rarity";
import type { Card, MerchantState } from "@/lib/types";
import RarityBadge from "./RarityBadge";
import PointsChip from "./PointsChip";
import CoinIcon from "./CoinIcon";
import NpcDialog, { type NpcMood } from "./NpcDialog";
import PageHeader from "./PageHeader";

type Phase = "idle" | "refreshing" | "selling" | "sold";

function pickRandomCard(): Card {
  const all = SET_ORDER.flatMap((c) => SETS[c].cards);
  return all[Math.floor(Math.random() * all.length)];
}

function fmtCountdown(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "곧";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}시간 ${m % 60}분`;
  return `${m}분 ${s}초`;
}

export default function MerchantView() {
  const { user, refreshMe } = useAuth();
  const [state, setState] = useState<MerchantState | null>(null);
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastEarned, setLastEarned] = useState<number | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, []);

  const loadAll = useCallback(async () => {
    if (!user) return;
    const [m, w] = await Promise.all([
      getMerchantState(user.id),
      fetchWallet(user.id),
    ]);
    setState(m);
    setWallet(w);
    if (!m.card_id) {
      const picked = pickRandomCard();
      const price = MERCHANT_PRICE[picked.rarity];
      const res = await refreshMerchantRPC(user.id, picked.id, price);
      if (res.ok) {
        setState({
          ...m,
          card_id: res.card_id ?? picked.id,
          price: res.price ?? price,
          refreshes_remaining: res.refreshes_remaining ?? m.refreshes_remaining,
          next_refresh_at: res.next_refresh_at ?? m.next_refresh_at,
        });
      }
    }
  }, [user]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const wantedCard = useMemo(() => {
    if (!state?.card_id) return null;
    return getCard(state.card_id);
  }, [state?.card_id]);

  const ownedCount = useMemo(() => {
    if (!wallet || !wantedCard) return 0;
    return wallet.items.find((it) => it.card.id === wantedCard.id)?.count ?? 0;
  }, [wallet, wantedCard]);

  const sellsRemaining = state
    ? Math.max(0, state.sells_limit - state.sells_this_hour)
    : 0;
  const sellWindowEnd = state
    ? new Date(
        new Date(state.sells_hour_start).getTime() + 60 * 60 * 1000
      ).toISOString()
    : null;

  const onRefresh = useCallback(async () => {
    if (!user || phase !== "idle") return;
    const picked = pickRandomCard();
    const price = MERCHANT_PRICE[picked.rarity];
    setError(null);
    setPhase("refreshing");
    const res = await refreshMerchantRPC(user.id, picked.id, price);
    if (!res.ok) {
      setError(res.error ?? "교체 실패");
      setPhase("idle");
      const fresh = await getMerchantState(user.id);
      setState(fresh);
      return;
    }
    setTimeout(() => {
      setState((prev) =>
        prev
          ? {
              ...prev,
              card_id: res.card_id ?? picked.id,
              price: res.price ?? price,
              refreshes_remaining:
                res.refreshes_remaining ?? prev.refreshes_remaining,
              next_refresh_at: res.next_refresh_at ?? prev.next_refresh_at,
            }
          : prev
      );
      setPhase("idle");
    }, 450);
  }, [user, phase]);

  const onSell = useCallback(async () => {
    if (!user || !wantedCard || phase !== "idle" || ownedCount <= 0) return;
    if (sellsRemaining <= 0) {
      setError("1시간 판매 한도에 도달했어요.");
      return;
    }
    setError(null);
    setPhase("selling");
    setTimeout(async () => {
      const res = await sellToMerchant(user.id, wantedCard.id);
      if (!res.ok) {
        setError(res.error ?? "거래 실패");
        setPhase("idle");
        return;
      }
      setLastEarned(res.earned ?? state?.price ?? 0);
      setPhase("sold");
      await Promise.all([refreshMe(), loadAll()]);
      setTimeout(() => {
        setPhase("idle");
        setLastEarned(null);
      }, 1500);
    }, 900);
  }, [user, wantedCard, phase, ownedCount, sellsRemaining, state?.price, refreshMe, loadAll]);

  if (!user || !state) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
      </div>
    );
  }

  const rarityStyle = wantedCard ? RARITY_STYLE[wantedCard.rarity] : null;
  const fx = wantedCard ? cardFxClass(wantedCard.rarity) : null;

  // Merchant mood + dialogue drives off the current state. Every state
  // swap retypes the bubble so the NPC feels reactive.
  const merchantMood: NpcMood =
    phase === "selling"
      ? "working"
      : phase === "sold"
      ? "happy"
      : phase === "refreshing"
      ? "working"
      : sellsRemaining <= 0
      ? "sad"
      : ownedCount > 0
      ? "excited"
      : "idle";
  const merchantLine =
    phase === "selling"
      ? "오호, 거래 성사! 지폐 준비할게냥~"
      : phase === "sold" && lastEarned !== null
      ? `+${lastEarned.toLocaleString("ko-KR")}p 지급! 또 팔러 와냥!`
      : phase === "refreshing"
      ? "다른 카드 찾아보고 있냥…"
      : sellsRemaining <= 0
      ? "이번 시간은 매입 끝났냥. 한 시간 뒤에 다시 와."
      : !wantedCard
      ? "오늘은 뭘 들고 왔냥?"
      : ownedCount > 0
      ? `오, 마침 그 ${wantedCard.rarity} 카드! 바로 사줄게냥.`
      : `${wantedCard.rarity} 카드 찾고 있어냥. 있으면 가져와~`;

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-5 md:py-8 fade-in">
      <PageHeader
        title="카드 상인"
        subtitle="매입 전문 NPC · 시간당 판매 5회 · 교체 5회"
        tone="amber"
        icon="🐾"
        stats={<PointsChip points={user.points} highlight />}
      />

      {/* NPC stage */}
      <div
        className="rounded-2xl border border-amber-900/40 px-3 py-3"
        style={{
          background:
            "linear-gradient(135deg, rgba(180,83,9,0.18) 0%, rgba(41,37,36,0.6) 60%)",
        }}
      >
        <NpcDialog
          src="/images/common/merchant-meowth.png"
          alt="상인 냐옹"
          text={merchantLine}
          mood={merchantMood}
          accent="amber"
          nameplate={{ role: "냥트레이더", name: "상인 냥냥" }}
          sizeClass="w-16 h-16 md:w-20 md:h-20"
        />
      </div>

      {/* Trading post panel */}
      <section
        className="relative mt-3 rounded-2xl border-2 overflow-hidden"
        style={{
          borderColor: "rgba(180, 83, 9, 0.35)",
          background:
            "linear-gradient(180deg, rgba(41, 37, 36, 0.85) 0%, rgba(20, 14, 10, 0.95) 100%)",
        }}
      >
        {/* Top plaque */}
        <div
          className="flex items-center justify-between px-4 py-2 border-b border-amber-900/40"
          style={{
            background:
              "linear-gradient(90deg, rgba(180,83,9,0.18), rgba(180,83,9,0.06))",
          }}
        >
          <div className="text-[11px] uppercase tracking-[0.25em] text-amber-300/80 font-bold">
            오늘의 매입
          </div>
          <div className="flex items-center gap-2 text-[10px]">
            <CounterChip
              label="매입"
              used={state.sells_this_hour}
              limit={state.sells_limit}
              tone="emerald"
              endIso={sellWindowEnd}
            />
            <CounterChip
              label="교체"
              used={5 - state.refreshes_remaining}
              limit={5}
              tone="amber"
              endIso={
                state.refreshes_remaining < 5 ? state.next_refresh_at : null
              }
            />
          </div>
        </div>

        {/* Card stage */}
        <div className="relative p-4 md:p-6 flex flex-col items-center gap-4">
          {/* Spotlight under the card */}
          <div
            className="absolute inset-x-0 top-4 h-40 md:h-48 pointer-events-none"
            style={{
              background:
                "radial-gradient(closest-side at 50% 30%, rgba(251,191,36,0.22), rgba(251,191,36,0) 70%)",
            }}
          />
          <div className="relative" style={{ minHeight: 0 }}>
            <AnimatePresence mode="wait">
              {wantedCard && phase !== "sold" && (
                <motion.div
                  key={wantedCard.id}
                  initial={{ x: 80, opacity: 0, rotate: 8, scale: 0.9 }}
                  animate={{ x: 0, opacity: 1, rotate: 0, scale: 1 }}
                  exit={
                    phase === "selling"
                      ? { x: -220, y: -80, opacity: 0, rotate: -20, scale: 0.6 }
                      : { x: -80, opacity: 0, rotate: -8, scale: 0.9 }
                  }
                  transition={{ type: "spring", stiffness: 220, damping: 20 }}
                  className={clsx(
                    "relative rounded-xl overflow-hidden isolate ring-2 bg-zinc-900",
                    rarityStyle?.frame,
                    rarityStyle?.glow
                  )}
                  style={{
                    width: "min(58vw, 220px)",
                    aspectRatio: "5 / 7",
                  }}
                >
                  {wantedCard.imageUrl ? (
                    <img
                      src={wantedCard.imageUrl}
                      alt={wantedCard.name}
                      className="w-full h-full object-contain bg-zinc-900 select-none pointer-events-none"
                      draggable={false}
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-indigo-700 to-amber-600 flex items-center justify-center p-3 text-white text-center font-bold">
                      {wantedCard.name}
                    </div>
                  )}
                  {fx && <div className={fx} />}
                </motion.div>
              )}
              {phase === "sold" && lastEarned !== null && (
                <motion.div
                  key="sold"
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center py-10"
                >
                  <p className="text-5xl mb-2">💰</p>
                  <p className="text-xs text-amber-200 mb-2">거래 성사</p>
                  <p className="text-2xl font-black text-amber-300 tabular-nums">
                    +{lastEarned.toLocaleString("ko-KR")}p
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Card meta + price tag */}
          {wantedCard && phase !== "sold" && (
            <div className="relative w-full max-w-sm">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <RarityBadge rarity={wantedCard.rarity} size="xs" />
                  </div>
                  <h2 className="text-base md:text-lg font-bold text-white leading-tight truncate">
                    {wantedCard.name}
                  </h2>
                  <p className="text-[10px] text-zinc-400 truncate">
                    {SETS[wantedCard.setCode].name} · #{wantedCard.number}
                  </p>
                </div>
                {/* Price tag */}
                <div
                  className="shrink-0 relative rounded-lg px-3 py-2 text-right border-2"
                  style={{
                    borderColor: "rgba(251, 191, 36, 0.5)",
                    background:
                      "linear-gradient(135deg, rgba(251,191,36,0.15), rgba(180,83,9,0.15))",
                  }}
                >
                  <div className="text-[9px] uppercase tracking-wider text-amber-300/80">
                    매입가
                  </div>
                  <div className="inline-flex items-center gap-1 mt-0.5">
                    <CoinIcon size="sm" />
                    <span className="text-sm md:text-base font-black text-amber-200 tabular-nums">
                      {state.price.toLocaleString("ko-KR")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Inventory status */}
              <p className="mt-3 text-xs text-zinc-400">
                {ownedCount > 0 ? (
                  <span className="text-emerald-300 font-semibold">
                    ✓ 보유 중 ({ownedCount}장) — 거래 가능
                  </span>
                ) : (
                  <span className="text-zinc-500">
                    보유 중인 카드가 아니에요. 교체를 시도해 보세요.
                  </span>
                )}
              </p>
            </div>
          )}
        </div>

        {error && (
          <div className="mx-4 mb-3 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="px-4 pb-4 grid grid-cols-2 gap-2">
          <button
            onClick={onSell}
            disabled={
              phase !== "idle" ||
              ownedCount <= 0 ||
              !wantedCard ||
              sellsRemaining <= 0
            }
            style={{ touchAction: "manipulation" }}
            className={clsx(
              "h-12 rounded-xl font-bold text-sm transition-all",
              ownedCount > 0 && phase === "idle" && sellsRemaining > 0
                ? "bg-gradient-to-r from-emerald-500 to-amber-400 text-zinc-950 hover:scale-[1.02] active:scale-[0.98] shadow-[0_10px_30px_-10px_rgba(52,211,153,0.5)]"
                : "bg-white/5 text-zinc-500 cursor-not-allowed border border-white/5"
            )}
          >
            {phase === "selling"
              ? "거래 중..."
              : sellsRemaining <= 0
              ? "매입 마감"
              : ownedCount <= 0
              ? "보유 중 아님"
              : "이 카드 팔기"}
          </button>
          <button
            onClick={onRefresh}
            disabled={
              phase !== "idle" ||
              (wantedCard !== null && state.refreshes_remaining <= 0)
            }
            style={{ touchAction: "manipulation" }}
            className={clsx(
              "h-12 rounded-xl font-bold text-sm transition-all",
              phase === "idle" &&
                (wantedCard === null || state.refreshes_remaining > 0)
                ? "bg-amber-100 text-amber-950 hover:scale-[1.02] active:scale-[0.98]"
                : "bg-white/5 text-zinc-500 cursor-not-allowed border border-white/5"
            )}
          >
            {phase === "refreshing"
              ? "교체 중..."
              : `교체 (${state.refreshes_remaining}/5)`}
          </button>
        </div>
      </section>

      {/* Rate card */}
      <div className="mt-4 rounded-xl bg-white/5 border border-white/10 p-3">
        <p className="text-[11px] uppercase tracking-wider text-zinc-400 mb-2">
          등급별 매입 단가
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 text-[11px]">
          <RateRow rarity="MUR" price={MERCHANT_PRICE.MUR} />
          <RateRow rarity="UR" price={MERCHANT_PRICE.UR} />
          <RateRow rarity="SAR" price={MERCHANT_PRICE.SAR} />
          <RateRow rarity="AR" price={MERCHANT_PRICE.AR} />
          <RateRow rarity="SR" price={MERCHANT_PRICE.SR} />
          <RateRow rarity="MA" price={MERCHANT_PRICE.MA} />
          <RateRow rarity="RR" price={MERCHANT_PRICE.RR} />
          <RateRow rarity="C" price={MERCHANT_PRICE.C} label="그 외" />
        </div>
        <p className="mt-2 text-[10px] text-zinc-500 text-center">
          매물은 모든 세트에서 무작위 · 1시간당 판매 5회 · 교체 최대 5회
          (1시간마다 +1 충전)
        </p>
      </div>

      <p className="mt-3 text-center text-[10px] text-zinc-500">
        <Link href="/" className="underline hover:text-zinc-300">
          다른 세트 팩 열러 가기
        </Link>
      </p>
    </div>
  );
}

function CounterChip({
  label,
  used,
  limit,
  tone,
  endIso,
}: {
  label: string;
  used: number;
  limit: number;
  tone: "emerald" | "amber";
  endIso: string | null;
}) {
  const remaining = Math.max(0, limit - used);
  const toneClass =
    tone === "emerald"
      ? "border-emerald-400/40 text-emerald-200 bg-emerald-500/10"
      : "border-amber-400/40 text-amber-200 bg-amber-500/10";
  return (
    <div
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 border",
        toneClass
      )}
      title={endIso ? `리셋: ${fmtCountdown(endIso)}` : undefined}
    >
      <span className="text-[9px] uppercase tracking-wider opacity-80">
        {label}
      </span>
      <span className="font-black tabular-nums text-[11px]">
        {remaining}/{limit}
      </span>
    </div>
  );
}

function RateRow({
  rarity,
  price,
  label,
}: {
  rarity: keyof typeof MERCHANT_PRICE;
  price: number;
  label?: string;
}) {
  const style = RARITY_STYLE[rarity];
  return (
    <div className="flex items-center justify-between rounded-md bg-black/30 border border-white/5 px-2 py-1">
      <span
        className={clsx(
          "inline-flex items-center gap-1 font-bold",
          rarity === "MUR" || rarity === "UR"
            ? "text-amber-300"
            : rarity === "SAR"
            ? "text-fuchsia-300"
            : rarity === "AR"
            ? "text-pink-300"
            : "text-zinc-300"
        )}
      >
        <span
          className={clsx("inline-block w-1.5 h-1.5 rounded-full", style.badge)}
        />
        {label ?? rarity}
      </span>
      <span className="text-amber-100 tabular-nums font-semibold">
        {price.toLocaleString("ko-KR")}p
      </span>
    </div>
  );
}
