"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { useAuth } from "@/lib/auth";
import {
  acceptGift,
  cancelGift,
  declineGift,
  fetchGifts,
  markGiftsViewed,
  type GiftRow,
} from "@/lib/db";
import { getCard, SETS } from "@/lib/sets";
import type { GiftStatus } from "@/lib/types";
import RarityBadge from "./RarityBadge";
import PsaSlab from "./PsaSlab";
import CoinIcon from "./CoinIcon";
import PageHeader from "./PageHeader";

type Tab = "received" | "sent";

function formatCountdown(iso: string): { text: string; urgent: boolean } {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return { text: "만료됨", urgent: true };
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const urgent = ms < 60 * 60 * 1000;
  if (h > 0) return { text: `${h}시간 ${m}분 뒤 만료`, urgent: h < 1 };
  if (m > 0) return { text: `${m}분 ${s}초 뒤 만료`, urgent };
  return { text: `${s}초 뒤 만료`, urgent: true };
}

function statusStyle(status: GiftStatus): {
  label: string;
  className: string;
} {
  switch (status) {
    case "pending":
      return { label: "대기 중", className: "bg-amber-400/20 text-amber-200 border-amber-400/40" };
    case "accepted":
      return { label: "수락됨", className: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" };
    case "expired":
      return { label: "만료됨", className: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30" };
    case "declined":
      return { label: "거절됨", className: "bg-rose-500/20 text-rose-300 border-rose-500/30" };
  }
}

export default function GiftsView() {
  const { user, refreshMe } = useAuth();
  const [tab, setTab] = useState<Tab>("received");
  const [gifts, setGifts] = useState<{ received: GiftRow[]; sent: GiftRow[] }>({
    received: [],
    sent: [],
  });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, tick] = useTick(1000);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetchGifts(user.id);
      setGifts(res);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
    // Arriving on /gifts clears the nav badge — all pending received
    // gifts are considered acknowledged from this point on.
    if (user) markGiftsViewed(user.id);
  }, [refresh, user]);

  const list = useMemo(
    () => (tab === "received" ? gifts.received : gifts.sent),
    [tab, gifts]
  );

  const pendingReceivedCount = gifts.received.filter(
    (g) => g.status === "pending" && new Date(g.expires_at) > new Date()
  ).length;

  const handleAccept = async (g: GiftRow) => {
    if (!user) return;
    setError(null);
    setBusyId(g.id);
    const res = await acceptGift(g.id, user.id);
    setBusyId(null);
    if (!res.ok) {
      setError(res.error ?? "수락 실패");
      return;
    }
    await Promise.all([refreshMe(), refresh()]);
  };

  const handleDecline = async (g: GiftRow) => {
    if (!user) return;
    setError(null);
    setBusyId(g.id);
    const res = await declineGift(g.id, user.id);
    setBusyId(null);
    if (!res.ok) {
      setError(res.error ?? "거절 실패");
      return;
    }
    await refresh();
  };

  const handleCancel = async (g: GiftRow) => {
    if (!user) return;
    setError(null);
    setBusyId(g.id);
    const res = await cancelGift(g.id, user.id);
    setBusyId(null);
    if (!res.ok) {
      setError(res.error ?? "회수 실패");
      return;
    }
    await Promise.all([refreshMe(), refresh()]);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-5 md:py-8 fade-in">
      <PageHeader
        title="선물함"
        stats={
          <Link
            href="/wallet?tab=psa"
            className="h-9 px-3 rounded-full bg-gradient-to-r from-amber-400 to-rose-500 text-zinc-950 font-bold text-[11px] inline-flex items-center gap-1 hover:scale-[1.02] active:scale-[0.98] transition shrink-0"
          >
            🎁 선물 보내기
          </Link>
        }
      />

      <div className="mt-6 flex gap-2">
        <TabPill active={tab === "received"} onClick={() => setTab("received")}>
          받은 선물
          <span className="ml-1.5 text-[10px] opacity-70">
            {gifts.received.length}
          </span>
          {pendingReceivedCount > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-amber-400 text-zinc-900 text-[10px] font-black px-1">
              {pendingReceivedCount}
            </span>
          )}
        </TabPill>
        <TabPill active={tab === "sent"} onClick={() => setTab("sent")}>
          보낸 선물
          <span className="ml-1.5 text-[10px] opacity-70">{gifts.sent.length}</span>
        </TabPill>
      </div>

      {error && (
        <p className="mt-3 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {loading ? (
        <div className="mt-16 flex justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
        </div>
      ) : list.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-white/10 bg-white/5 py-10 flex flex-col items-center gap-2 text-center px-4">
          <span className="text-4xl">📭</span>
          <p className="text-sm text-zinc-400">
            {tab === "received"
              ? "아직 받은 선물이 없습니다."
              : "아직 보낸 선물이 없습니다."}
          </p>
        </div>
      ) : (
        <AnimatePresence initial={false}>
          <ul className="mt-6 space-y-2.5">
            {list.map((g) => {
              const card = g.card_id ? getCard(g.card_id) : null;
              if (!card) return null;
              const isReceived = tab === "received";
              const counterparty = isReceived
                ? g.from_nickname ?? g.from_login
                : g.to_nickname ?? g.to_login;
              const ss = statusStyle(g.status);
              const countdown =
                g.status === "pending" ? formatCountdown(g.expires_at) : null;
              const isBusy = busyId === g.id;
              const isPending =
                g.status === "pending" && new Date(g.expires_at) > new Date();
              const canAccept = isReceived && isPending;
              const canDecline = canAccept;
              const canCancel = !isReceived && isPending;
              const isLegacy = g.grading_id == null;

              return (
                <motion.li
                  key={g.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className={clsx(
                    "p-3 md:p-4 rounded-2xl border bg-white/5 overflow-hidden",
                    g.status === "pending"
                      ? "border-amber-400/30"
                      : "border-white/10"
                  )}
                >
                  <div className="flex items-start gap-3 md:gap-4">
                    <div className="shrink-0">
                      {g.grade != null ? (
                        <div className="w-[120px] md:w-[140px]">
                          <PsaSlab
                            card={card}
                            grade={g.grade}
                            size="sm"
                          />
                        </div>
                      ) : (
                        <div className="w-14 h-20 md:w-16 md:h-24 rounded-lg overflow-hidden bg-zinc-900 ring-1 ring-white/10">
                          {card.imageUrl ? (
                            <img
                              src={card.imageUrl}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : null}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <RarityBadge rarity={card.rarity} size="xs" />
                        {g.grade != null && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black border bg-amber-500/15 text-amber-200 border-amber-400/40 tabular-nums">
                            PCL {g.grade}
                          </span>
                        )}
                        <span
                          className={clsx(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border",
                            ss.className
                          )}
                        >
                          {ss.label}
                        </span>
                        {isLegacy && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-zinc-500/15 text-zinc-300 border-zinc-400/30">
                            구버전
                          </span>
                        )}
                        <span className="text-[10px] text-zinc-500">
                          {new Date(g.created_at).toLocaleString("ko-KR", {
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <h3 className="mt-1 text-sm md:text-base font-semibold text-white truncate">
                        {card.name}
                      </h3>
                      <p className="text-[11px] text-zinc-400">
                        {SETS[card.setCode].name} · #{card.number}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-zinc-400 flex-wrap">
                        <span>
                          {isReceived ? "보낸 사람" : "받는 사람"}:{" "}
                          <span className="text-white font-semibold">
                            {counterparty ?? "-"}
                          </span>
                        </span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          가격:
                          <span className="inline-flex items-center gap-1 text-amber-300 font-bold">
                            <CoinIcon size="xs" />
                            {g.price_points.toLocaleString("ko-KR")}p
                          </span>
                        </span>
                        {countdown && (
                          <>
                            <span>·</span>
                            <span
                              className={clsx(
                                "font-semibold",
                                countdown.urgent
                                  ? "text-rose-300 urgent-pulse"
                                  : "text-amber-200"
                              )}
                            >
                              ⏳ {countdown.text}
                            </span>
                          </>
                        )}
                      </div>
                      {g.message && (
                        <p className="mt-2 text-xs text-zinc-200 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 leading-snug whitespace-pre-wrap break-words">
                          “{g.message}”
                        </p>
                      )}
                    </div>
                  </div>

                  {(canAccept || canDecline) && !isLegacy && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => handleAccept(g)}
                        disabled={
                          isBusy ||
                          !user ||
                          (g.price_points > 0 && user.points < g.price_points)
                        }
                        className="flex-1 h-10 rounded-lg bg-gradient-to-r from-emerald-400 to-amber-400 text-zinc-950 font-bold text-xs md:text-sm disabled:opacity-50 disabled:cursor-not-allowed transition"
                        title={
                          user && g.price_points > user.points
                            ? "포인트 부족"
                            : undefined
                        }
                      >
                        {isBusy ? (
                          "처리 중..."
                        ) : g.price_points > 0 ? (
                          <span className="inline-flex items-center gap-1">
                            <CoinIcon size="xs" />
                            {g.price_points.toLocaleString("ko-KR")}p 지불하고 받기
                          </span>
                        ) : (
                          "무료로 받기"
                        )}
                      </button>
                      <button
                        onClick={() => handleDecline(g)}
                        disabled={isBusy}
                        className="h-10 px-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs md:text-sm"
                      >
                        거절
                      </button>
                    </div>
                  )}
                  {canCancel && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => handleCancel(g)}
                        disabled={isBusy}
                        className="flex-1 h-10 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs md:text-sm"
                      >
                        {isBusy ? "처리 중..." : "선물 회수"}
                      </button>
                    </div>
                  )}
                  {isBusy && (
                    <div className="mt-2 h-0.5 bg-amber-400/50 overflow-hidden rounded-full">
                      <div className="h-full bg-amber-400 animate-[pulse_0.6s_ease-in-out_infinite]" />
                    </div>
                  )}
                </motion.li>
              );
            })}
          </ul>
        </AnimatePresence>
      )}
      {/* unused tick to force per-second re-render of countdown timers */}
      <span className="sr-only">{tick}</span>
    </div>
  );
}

function TabPill({
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
        "inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold border transition",
        active
          ? "bg-white text-zinc-900 border-white"
          : "bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10 hover:text-white"
      )}
    >
      {children}
    </button>
  );
}

function useTick(ms: number): [unknown, number] {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((v) => v + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
  return [null, n];
}
