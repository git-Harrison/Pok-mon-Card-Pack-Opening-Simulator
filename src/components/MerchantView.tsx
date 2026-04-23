"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
import { MERCHANT_PRICE, RARITY_STYLE, isHighRarity } from "@/lib/rarity";
import type { Card, MerchantState } from "@/lib/types";
import RarityBadge from "./RarityBadge";
import PointsChip from "./PointsChip";
import CoinIcon from "./CoinIcon";

type Phase = "idle" | "refreshing" | "selling" | "sold";

function pickRandomCard(): Card {
  const all = SET_ORDER.flatMap((c) => SETS[c].cards);
  return all[Math.floor(Math.random() * all.length)];
}

function formatCountdown(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "곧 충전돼요";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}시간 ${m % 60}분 뒤`;
  return `${m}분 ${s}초 뒤`;
}

export default function MerchantView() {
  const { user, refreshMe } = useAuth();
  const [state, setState] = useState<MerchantState | null>(null);
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastEarned, setLastEarned] = useState<number | null>(null);
  const [wiggleKey, setWiggleKey] = useState(0);
  const [tick, setTick] = useState(0);
  const cardSlotRef = useRef<HTMLDivElement | null>(null);

  // re-render every second so the countdown ticks
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, []);
  void tick;

  const loadAll = useCallback(async () => {
    if (!user) return;
    const [m, w] = await Promise.all([
      getMerchantState(user.id),
      fetchWallet(user.id),
    ]);
    setState(m);
    setWallet(w);
    // First visit: auto-assign a card if merchant has none (free assignment)
    if (!m.card_id) {
      const picked = pickRandomCard();
      const price = MERCHANT_PRICE[picked.rarity];
      const res = await refreshMerchantRPC(user.id, picked.id, price);
      if (res.ok) {
        setState({
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

  const onRefresh = useCallback(async () => {
    if (!user || phase !== "idle") return;
    const picked = pickRandomCard();
    const price = MERCHANT_PRICE[picked.rarity];
    setError(null);
    setPhase("refreshing");
    const res = await refreshMerchantRPC(user.id, picked.id, price);
    if (!res.ok) {
      setError(res.error ?? "새로고침에 실패했어요.");
      setPhase("idle");
      // Still update counters the server returned
      const fresh = await getMerchantState(user.id);
      setState(fresh);
      return;
    }
    // allow the swap-out animation a moment
    setTimeout(() => {
      setState({
        card_id: res.card_id ?? picked.id,
        price: res.price ?? price,
        refreshes_remaining: res.refreshes_remaining ?? 0,
        next_refresh_at: res.next_refresh_at ?? new Date().toISOString(),
      });
      setPhase("idle");
    }, 450);
  }, [user, phase]);

  const onSell = useCallback(async () => {
    if (!user || !wantedCard || phase !== "idle" || ownedCount <= 0) return;
    setError(null);
    setPhase("selling");
    setWiggleKey((k) => k + 1);

    // Play the selling cinema for ~1.2s, then call the RPC
    const t = setTimeout(async () => {
      const res = await sellToMerchant(user.id, wantedCard.id);
      if (!res.ok) {
        setError(res.error ?? "판매 실패");
        setPhase("idle");
        return;
      }
      setLastEarned(res.earned ?? state?.price ?? 0);
      setPhase("sold");
      // Refresh user points and wallet
      await Promise.all([refreshMe(), loadAll()]);
      setTimeout(() => {
        setPhase("idle");
        setLastEarned(null);
      }, 1400);
    }, 900);
    return () => clearTimeout(t);
  }, [user, wantedCard, phase, ownedCount, state?.price, refreshMe, loadAll]);

  if (!user || !state) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
      </div>
    );
  }

  const rarityStyle = wantedCard ? RARITY_STYLE[wantedCard.rarity] : null;
  const isHot = wantedCard ? isHighRarity(wantedCard.rarity) : false;

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-10 fade-in">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-4xl font-black text-white tracking-tight">
            카드 상인
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            상인이 원하는 카드를 가지고 있으면 포인트로 바꿔갈 수 있어요.
          </p>
        </div>
        <PointsChip points={user.points} highlight />
      </div>

      <div
        className={clsx(
          "mt-6 grid gap-4 md:gap-6 items-stretch",
          "grid-cols-1 md:grid-cols-[1fr_1.1fr]"
        )}
      >
        {/* Merchant column */}
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-amber-500/10 via-rose-500/5 to-transparent p-5 md:p-6 flex flex-col items-center md:items-start gap-4">
          <div className="relative w-40 h-40 md:w-48 md:h-48 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-gradient-to-b from-amber-400/30 to-transparent blur-2xl" />
            <motion.img
              key={wiggleKey}
              src="/images/common/merchant-meowth.png"
              alt="카드 상인 냥체스터"
              className={clsx(
                "relative w-full h-full object-contain drop-shadow-2xl",
                phase === "idle" && "animate-bob",
                phase === "selling" && "animate-wiggle",
                phase === "sold" && "animate-wiggle"
              )}
            />

            {/* Coin burst on sold */}
            <AnimatePresence>
              {phase === "sold" &&
                Array.from({ length: 14 }).map((_, i) => {
                  const angle = (i / 14) * Math.PI * 2 - Math.PI / 2;
                  const dx = Math.cos(angle) * 120;
                  const dy = Math.sin(angle) * 120;
                  return (
                    <span
                      key={i}
                      aria-hidden
                      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                      style={
                        {
                          animation: `coin-fly 1.1s ease-out ${i * 0.02}s forwards`,
                          ["--end" as string]: `translate(${dx}px, ${dy}px)`,
                        } as React.CSSProperties
                      }
                    >
                      <CoinIcon size="lg" />
                    </span>
                  );
                })}
            </AnimatePresence>

            {/* Points floater on sold */}
            <AnimatePresence>
              {phase === "sold" && lastEarned !== null && (
                <motion.div
                  initial={{ y: 0, opacity: 0, scale: 0.8 }}
                  animate={{ y: -60, opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.2, ease: "easeOut" }}
                  className="absolute left-1/2 -translate-x-1/2 top-0 text-xl md:text-2xl font-black text-amber-300"
                  style={{ textShadow: "0 2px 10px rgba(251,191,36,0.6)" }}
                >
                  +{lastEarned.toLocaleString("ko-KR")}p
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="speech-bubble relative w-full rounded-2xl bg-zinc-900/95 border border-white/10 p-4 text-sm leading-relaxed">
            {phase === "sold" ? (
              <p className="text-emerald-300 font-semibold">
                고맙다냥! {lastEarned?.toLocaleString("ko-KR")}포인트 받아라냥
              </p>
            ) : phase === "selling" ? (
              <p className="text-zinc-200">이 카드... 좋다냥! 잠시만 기다려라냥</p>
            ) : wantedCard ? (
              <p className="text-zinc-200">
                지금은 <span className="font-semibold text-white">{wantedCard.name}</span>
                을(를) 찾고 있다냥.
                {ownedCount > 0 ? (
                  <span className="block mt-1 text-amber-300 font-semibold">
                    너가 {ownedCount}장 갖고 있다냥! 판매하라냥
                  </span>
                ) : (
                  <span className="block mt-1 text-zinc-400">
                    보유 중인 카드가 아니다냥... 새로고침 해봐라냥.
                  </span>
                )}
              </p>
            ) : (
              <p className="text-zinc-300">새 카드를 찾고 있다냥...</p>
            )}
          </div>
        </section>

        {/* Card offer column */}
        <section className="relative rounded-3xl border border-white/10 bg-zinc-900/60 p-4 md:p-6">
          <div
            ref={cardSlotRef}
            className="relative min-h-[380px] md:min-h-[440px] flex items-center justify-center"
          >
            <AnimatePresence mode="wait">
              {wantedCard && phase !== "sold" && (
                <motion.div
                  key={wantedCard.id}
                  initial={{ x: 80, opacity: 0, rotate: 8, scale: 0.9 }}
                  animate={{ x: 0, opacity: 1, rotate: 0, scale: 1 }}
                  exit={
                    phase === "selling"
                      ? { x: -260, y: -60, opacity: 0, rotate: -16, scale: 0.65 }
                      : { x: -80, opacity: 0, rotate: -8, scale: 0.9 }
                  }
                  transition={{ type: "spring", stiffness: 220, damping: 20 }}
                  className={clsx(
                    "relative w-[200px] md:w-[240px] aspect-[5/7] rounded-2xl overflow-hidden ring-2",
                    rarityStyle?.frame,
                    rarityStyle?.glow
                  )}
                >
                  {isHot && <div className="rarity-ring" />}
                  {wantedCard.imageUrl ? (
                    <img
                      src={wantedCard.imageUrl}
                      alt={wantedCard.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-indigo-700 to-amber-600 flex items-center justify-center p-4 text-white text-center font-bold">
                      {wantedCard.name}
                    </div>
                  )}
                  {isHot && <div className="holo-overlay" />}
                </motion.div>
              )}
              {phase === "sold" && (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center"
                >
                  <p className="text-6xl mb-3">✨</p>
                  <p className="text-sm text-zinc-300">
                    판매 완료! 새로고침으로 다음 카드를 뽑아보세요.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Offer stats + actions */}
          {wantedCard && phase !== "sold" && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <RarityBadge rarity={wantedCard.rarity} size="sm" />
                  <span className="text-[11px] text-zinc-400">
                    {SETS[wantedCard.setCode].name} · #{wantedCard.number}
                  </span>
                </div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/10 border border-amber-400/40 text-amber-200 px-3 py-1 text-xs font-bold">
                  <CoinIcon size="xs" />
                  <span>{state.price.toLocaleString("ko-KR")}p 에 매입</span>
                </div>
              </div>
              <h3 className="text-lg font-black text-white leading-tight">
                {wantedCard.name}
              </h3>
            </div>
          )}

          {error && (
            <p className="mt-3 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2 md:gap-3">
            <button
              onClick={onSell}
              disabled={phase !== "idle" || ownedCount <= 0 || !wantedCard}
              className={clsx(
                "h-12 rounded-xl font-bold text-sm transition-all",
                ownedCount > 0 && phase === "idle"
                  ? "bg-gradient-to-r from-emerald-400 to-amber-400 text-zinc-950 hover:scale-[1.02] active:scale-[0.98] shadow-[0_10px_30px_-10px_rgba(52,211,153,0.6)]"
                  : "bg-white/5 text-zinc-500 cursor-not-allowed"
              )}
            >
              {phase === "selling"
                ? "판매 중..."
                : ownedCount <= 0
                ? "보유 중 아님"
                : `+${state.price.toLocaleString("ko-KR")}p 받고 팔기`}
            </button>
            <button
              onClick={onRefresh}
              disabled={
                phase !== "idle" ||
                (wantedCard !== null && state.refreshes_remaining <= 0)
              }
              className={clsx(
                "h-12 rounded-xl font-bold text-sm transition-all",
                phase === "idle" &&
                  (wantedCard === null || state.refreshes_remaining > 0)
                  ? "bg-white text-zinc-900 hover:scale-[1.02] active:scale-[0.98]"
                  : "bg-white/5 text-zinc-500 cursor-not-allowed"
              )}
            >
              {phase === "refreshing"
                ? "교체 중..."
                : `새로고침 (${state.refreshes_remaining}/5)`}
            </button>
          </div>

          <p className="mt-3 text-[11px] text-zinc-500 text-center">
            {state.refreshes_remaining < 5
              ? `다음 충전: ${formatCountdown(state.next_refresh_at)}`
              : "새로고침 5회 모두 충전돼 있어요."}
          </p>
        </section>
      </div>

      <p className="mt-6 text-center text-[11px] text-zinc-500">
        상인이 원하는 카드는 <Link href="/" className="underline text-zinc-300">모든 세트</Link> 전체에서 무작위로 뽑힙니다.
      </p>
    </div>
  );
}
