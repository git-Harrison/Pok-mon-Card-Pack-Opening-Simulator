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
  if (ms <= 0) return "곧 충전";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m 뒤`;
  return `${m}m ${s}s 뒤`;
}

export default function MerchantView() {
  const { user, refreshMe } = useAuth();
  const [state, setState] = useState<MerchantState | null>(null);
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastEarned, setLastEarned] = useState<number | null>(null);
  const [wiggleKey, setWiggleKey] = useState(0);
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
      setError(res.error ?? "새로고침 실패");
      setPhase("idle");
      const fresh = await getMerchantState(user.id);
      setState(fresh);
      return;
    }
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
    setTimeout(async () => {
      const res = await sellToMerchant(user.id, wantedCard.id);
      if (!res.ok) {
        setError(res.error ?? "판매 실패");
        setPhase("idle");
        return;
      }
      setLastEarned(res.earned ?? state?.price ?? 0);
      setPhase("sold");
      await Promise.all([refreshMe(), loadAll()]);
      setTimeout(() => {
        setPhase("idle");
        setLastEarned(null);
      }, 1400);
    }, 900);
  }, [user, wantedCard, phase, ownedCount, state?.price, refreshMe, loadAll]);

  if (!user || !state) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
      </div>
    );
  }

  const rarityStyle = wantedCard ? RARITY_STYLE[wantedCard.rarity] : null;
  const isHot = wantedCard ? isHighRarity(wantedCard.rarity) : false;

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-4 md:py-8 fade-in">
      {/* ── Compact header ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl md:text-3xl font-black text-white tracking-tight">
            카드 상인
          </h1>
          <p className="hidden md:block text-xs text-zinc-400 mt-1">
            상인이 원하는 카드와 같은 카드를 갖고 있으면 포인트로 바꿀 수 있어요.
          </p>
        </div>
        <PointsChip points={user.points} highlight />
      </div>

      {/* ── Stage: Meowth + speech on top, card + controls below ── */}
      <section className="relative mt-4 rounded-2xl border border-white/10 bg-gradient-to-br from-amber-500/10 via-rose-500/5 to-transparent p-3 md:p-5">
        {/* Meowth + speech (always horizontal) */}
        <div className="flex items-center gap-3">
          <div className="relative w-20 h-20 md:w-24 md:h-24 shrink-0">
            <div className="absolute inset-0 rounded-full bg-gradient-to-b from-amber-400/30 to-transparent blur-xl" />
            <motion.img
              key={wiggleKey}
              src="/images/common/merchant-meowth.png"
              alt="카드 상인 냥체스터"
              className={clsx(
                "relative w-full h-full object-contain drop-shadow-xl",
                phase === "idle" && "animate-bob",
                (phase === "selling" || phase === "sold") && "animate-wiggle"
              )}
              draggable={false}
            />
            <AnimatePresence>
              {phase === "sold" &&
                Array.from({ length: 10 }).map((_, i) => {
                  const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
                  const dx = Math.cos(angle) * 70;
                  const dy = Math.sin(angle) * 70;
                  return (
                    <span
                      key={i}
                      aria-hidden
                      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                      style={
                        {
                          animation: `coin-fly 1s ease-out ${i * 0.02}s forwards`,
                          ["--end" as string]: `translate(${dx}px, ${dy}px)`,
                        } as React.CSSProperties
                      }
                    >
                      <CoinIcon size="md" />
                    </span>
                  );
                })}
            </AnimatePresence>
          </div>
          <div className="flex-1 min-w-0 rounded-2xl bg-zinc-900/95 border border-white/10 p-2.5 text-xs md:text-sm leading-snug">
            {phase === "sold" ? (
              <p className="text-emerald-300 font-semibold">
                고맙다냥! {lastEarned?.toLocaleString("ko-KR")}p 받았다냥
              </p>
            ) : phase === "selling" ? (
              <p className="text-zinc-200">좋은 카드다냥! 기다려라냥...</p>
            ) : wantedCard ? (
              <>
                <p className="text-zinc-200">
                  지금은{" "}
                  <span className="font-bold text-white">{wantedCard.name}</span>
                  을 찾고 있다냥.
                </p>
                {ownedCount > 0 ? (
                  <p className="mt-0.5 text-amber-300 font-semibold">
                    너가 {ownedCount}장 갖고있다! 팔아라냥
                  </p>
                ) : (
                  <p className="mt-0.5 text-zinc-400">보유 중 아님. 새로고침 ↓</p>
                )}
              </>
            ) : (
              <p className="text-zinc-300">새 카드를 찾고있다냥...</p>
            )}
          </div>
        </div>

        {/* Card + offer */}
        <div className="mt-4 flex flex-col items-center gap-3">
          <div className="relative" style={{ minHeight: 0 }}>
            <AnimatePresence mode="wait">
              {wantedCard && phase !== "sold" && (
                <motion.div
                  key={wantedCard.id}
                  initial={{ x: 80, opacity: 0, rotate: 8, scale: 0.9 }}
                  animate={{ x: 0, opacity: 1, rotate: 0, scale: 1 }}
                  exit={
                    phase === "selling"
                      ? { x: -180, y: -60, opacity: 0, rotate: -16, scale: 0.6 }
                      : { x: -80, opacity: 0, rotate: -8, scale: 0.9 }
                  }
                  transition={{ type: "spring", stiffness: 220, damping: 20 }}
                  className={clsx(
                    "relative rounded-xl overflow-hidden isolate ring-2 bg-zinc-900",
                    rarityStyle?.frame,
                    rarityStyle?.glow
                  )}
                  style={{
                    width: "min(48vw, 180px)",
                    aspectRatio: "5 / 7",
                  }}
                >
                  {isHot && <div className="rarity-ring" />}
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
                  {isHot && <div className="holo-overlay pointer-events-none" />}
                </motion.div>
              )}
              {phase === "sold" && (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-10"
                >
                  <p className="text-5xl mb-2">✨</p>
                  <p className="text-xs text-zinc-300">판매 완료!</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {wantedCard && phase !== "sold" && (
            <div className="w-full flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <RarityBadge rarity={wantedCard.rarity} size="xs" />
                <span className="text-[10px] text-zinc-400 truncate">
                  {SETS[wantedCard.setCode].name} · #{wantedCard.number}
                </span>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/10 border border-amber-400/40 text-amber-200 px-2.5 py-1 text-xs font-bold shrink-0">
                <CoinIcon size="xs" />
                <span>{state.price.toLocaleString("ko-KR")}p</span>
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="mt-3 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={onSell}
            disabled={phase !== "idle" || ownedCount <= 0 || !wantedCard}
            style={{ touchAction: "manipulation" }}
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
            style={{ touchAction: "manipulation" }}
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

        <p className="mt-2 text-center text-[10px] text-zinc-500">
          {state.refreshes_remaining < 5
            ? `충전 ${formatCountdown(state.next_refresh_at)}`
            : "새로고침 5회 충전 완료"}
          {" · "}
          <Link href="/" className="underline hover:text-zinc-300">
            상인의 매물은 모든 세트 랜덤
          </Link>
        </p>
      </section>
    </div>
  );
}
