"use client";

import PokeLoader, { CenteredPokeLoader } from "./PokeLoader";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useSearchParams } from "next/navigation";
import clsx from "clsx";
import {
  RARITY_ORDER,
  RARITY_STYLE,
  compareRarity,
} from "@/lib/rarity";
import type { Card, GiftQuota, Rarity } from "@/lib/types";
import { SETS, getCard } from "@/lib/sets";
import { useAuth } from "@/lib/auth";
import {
  createGift,
  fetchAllGradingsWithDisplay,
  fetchGiftQuota,
  fetchWallet,
  type PsaGradingWithDisplay,
  type WalletSnapshot,
} from "@/lib/db";
import Link from "next/link";
import PokeCard from "./PokeCard";
import PsaSlab from "./PsaSlab";
import CoinIcon from "./CoinIcon";
import PageHeader from "./PageHeader";
import UserSelect from "./UserSelect";

type Mode = "cards" | "psa";
type RarityFilter = "ALL" | Rarity;

export default function WalletView() {
  const { user } = useAuth();
  const params = useSearchParams();
  const initialMode: Mode = params.get("tab") === "cards" ? "cards" : "psa";
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

  const hasAny = snap.items.length > 0 || psa.length > 0;

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 md:py-6 fade-in">
      <PageHeader title="내 카드지갑" />

      <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
        <div className="inline-flex items-stretch rounded-xl bg-white/5 border border-white/10 p-1">
          <ModeTab active={mode === "psa"} onClick={() => setMode("psa")}>
            PCL 감별
            <span className="ml-1.5 text-[10px] opacity-70">{psa.length}</span>
          </ModeTab>
          <ModeTab active={mode === "cards"} onClick={() => setMode("cards")}>
            보유 카드
            <span className="ml-1.5 text-[10px] opacity-70">
              {snap.items.length}
            </span>
          </ModeTab>
        </div>
        {hasAny ? (
          <Link
            href="/wallet/bulk-sell"
            style={{ touchAction: "manipulation" }}
            aria-label="일괄 판매"
            className="shrink-0 h-10 px-4 rounded-xl text-sm font-black inline-flex items-center gap-1.5 bg-gradient-to-r from-emerald-400 to-amber-400 text-zinc-950 shadow-[0_8px_24px_-8px_rgba(251,191,36,0.6)] hover:scale-[1.02] active:scale-[0.98] transition"
          >
            <CoinIcon size="sm" />
            일괄 판매
          </Link>
        ) : (
          <span className="shrink-0 h-10 px-4 rounded-xl text-sm font-black border border-white/10 bg-white/5 text-zinc-500 inline-flex items-center gap-1.5">
            <CoinIcon size="sm" />
            일괄 판매
          </span>
        )}
      </div>

      {loading ? (
        <CenteredPokeLoader />
      ) : mode === "cards" ? (
        <CardsMode
          items={items}
          rarityCounts={rarityCounts}
          rarityFilter={rarityFilter}
          setRarityFilter={setRarityFilter}
        />
      ) : (
        <PsaMode items={psaItems} onAfterGift={refresh} />
      )}
    </div>
  );
}

function CardsMode({
  items,
  rarityCounts,
  rarityFilter,
  setRarityFilter,
}: {
  items: { card: Card; count: number }[];
  rarityCounts: Map<Rarity, number>;
  rarityFilter: RarityFilter;
  setRarityFilter: (r: RarityFilter) => void;
}) {
  return (
    <>
      <div className="mt-4 flex items-center gap-1.5 flex-wrap">
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

      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="mt-4 md:mt-5 grid grid-cols-3 gap-2 md:gap-3">
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
  onAfterGift,
}: {
  items: { grading: PsaGradingWithDisplay; card: Card }[];
  onAfterGift: () => void | Promise<void>;
}) {
  const [giftTarget, setGiftTarget] = useState<{
    grading: PsaGradingWithDisplay;
    card: Card;
  } | null>(null);

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
      {displayedCount > 0 && (
        <div className="mt-3 text-[11px] text-fuchsia-300 font-semibold tabular-nums">
          🏛️ 전시 중 {displayedCount}장
        </div>
      )}
      <div className="mt-4 grid grid-cols-3 gap-2 md:gap-3 place-items-stretch">
        {items.map(({ grading, card }) => {
          const giftable = !grading.displayed && grading.grade >= 6;
          return (
            <button
              key={grading.id}
              type="button"
              onClick={() => setGiftTarget({ grading, card })}
              disabled={!giftable}
              style={{ touchAction: "manipulation" }}
              className={clsx(
                "relative flex flex-col items-center gap-1 w-full text-left active:scale-[0.98] transition",
                grading.displayed && "opacity-70 cursor-not-allowed",
                !giftable && !grading.displayed && "cursor-not-allowed"
              )}
            >
              <div className="relative w-full">
                <PsaSlab card={card} grade={grading.grade} size="sm" compact />
                {grading.displayed && (
                  <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-fuchsia-500 text-white text-[9px] font-black shadow-[0_4px_10px_rgba(217,70,239,0.6)] whitespace-nowrap">
                    🏛️
                  </span>
                )}
              </div>
              <p className="w-full text-center text-[10px] text-zinc-300 leading-tight line-clamp-1 px-0.5">
                {card.name}
              </p>
            </button>
          );
        })}
      </div>

      <SlabGiftComposer
        target={giftTarget}
        onClose={() => setGiftTarget(null)}
        onSuccess={async () => {
          setGiftTarget(null);
          await onAfterGift();
        }}
      />
    </>
  );
}

function SlabGiftComposer({
  target,
  onClose,
  onSuccess,
}: {
  target: { grading: PsaGradingWithDisplay; card: Card } | null;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
}) {
  const { user } = useAuth();
  const [recipient, setRecipient] = useState("");
  const [priceRaw, setPriceRaw] = useState("0");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [quota, setQuota] = useState<GiftQuota | null>(null);

  useEffect(() => {
    if (!target) {
      setRecipient("");
      setPriceRaw("0");
      setMessage("");
      setError(null);
      setSuccess(false);
      setSending(false);
      return;
    }
    if (user) fetchGiftQuota(user.id).then(setQuota);
  }, [target, user]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [target, onClose]);

  const submit = async () => {
    if (!user || !target || !recipient.trim() || sending) return;
    const price = Math.max(0, Math.floor(Number(priceRaw) || 0));
    setSending(true);
    setError(null);
    const trimmedMsg = message.trim();
    const res = await createGift(
      user.id,
      recipient.trim(),
      target.grading.id,
      price,
      trimmedMsg || undefined
    );
    setSending(false);
    if (!res.ok) {
      setError(res.error ?? "선물 전송 실패");
      return;
    }
    setSuccess(true);
    setTimeout(onSuccess, 900);
  };

  return (
    <AnimatePresence>
      {target && (
        <motion.div
          key="backdrop"
          className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-md flex items-center justify-center"
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
            onClick={(e) => e.stopPropagation()}
            className="relative w-full md:max-w-2xl bg-zinc-950/95 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{ maxHeight: "calc(100dvh - 24px)" }}
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.94, opacity: 0 }}
            transition={{ type: "tween", ease: [0.2, 0.8, 0.2, 1], duration: 0.22 }}
          >
            <button
              onClick={onClose}
              aria-label="닫기"
              className="absolute top-2 right-2 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
              style={{ touchAction: "manipulation" }}
            >
              ✕
            </button>

            <div className="flex-1 overflow-y-auto overscroll-contain min-h-0 p-5 md:p-6">
              <h2 className="text-lg md:text-xl font-black text-white">
                🎁 PCL 슬랩 선물 보내기
              </h2>
              <p className="mt-1 text-xs text-zinc-400">
                선택한 슬랩을 친구에게 보내요. 받는 사람이 수락하면 슬랩
                소유권이 그대로 이전돼요.
              </p>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex justify-center">
                  <PsaSlab
                    card={target.card}
                    grade={target.grading.grade}
                    size="md"
                  />
                </div>

                <div className="flex flex-col">
                  <label className="block">
                    <span className="text-xs text-zinc-300 mb-2 block">
                      받는 사람
                    </span>
                    <UserSelect
                      value={recipient || null}
                      excludeSelf
                      placeholder="받는 사람 고르기"
                      onChange={(u) => setRecipient(u.user_id)}
                    />
                  </label>

                  <label className="block mt-3">
                    <span className="text-xs text-zinc-300 mb-2 block">
                      받는 사람이 지불할 포인트
                    </span>
                    <div className="flex items-stretch gap-1.5">
                      <input
                        value={priceRaw}
                        onChange={(e) =>
                          setPriceRaw(e.target.value.replace(/[^0-9]/g, ""))
                        }
                        inputMode="numeric"
                        style={{ fontSize: "16px" }}
                        className="flex-1 h-12 px-3 rounded-lg bg-black/40 border border-white/10 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
                        placeholder="0"
                      />
                      <span className="inline-flex items-center gap-1.5 px-3 rounded-lg bg-white/5 border border-white/10 text-xs text-zinc-300">
                        <CoinIcon size="xs" /> 포인트
                      </span>
                    </div>
                  </label>

                  <label className="block mt-3">
                    <span className="text-xs text-zinc-300 mb-2 block">
                      선물 메시지{" "}
                      <span className="text-zinc-500">(선택)</span>
                    </span>
                    <textarea
                      value={message}
                      onChange={(e) =>
                        setMessage(e.target.value.slice(0, 140))
                      }
                      rows={2}
                      maxLength={140}
                      placeholder="짧은 메시지를 남겨보세요"
                      style={{ fontSize: "16px" }}
                      className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-400/60 resize-none"
                    />
                    <div className="mt-1 text-right text-[10px] text-zinc-500 tabular-nums">
                      {message.length} / 140
                    </div>
                  </label>

                  <p className="mt-1 text-[11px] text-zinc-500 leading-snug">
                    24시간 내에 수락해야 해요. 미수락·거절 시 슬랩은 그대로
                    내 지갑에 남아요.
                    {quota && (
                      <span className="block mt-0.5 text-zinc-400">
                        오늘 선물 {quota.used}/{quota.limit} 사용 (남은{" "}
                        {quota.remaining}회)
                      </span>
                    )}
                  </p>

                  {error && (
                    <p className="mt-2 text-xs text-rose-400">{error}</p>
                  )}
                  {success && (
                    <p className="mt-2 text-xs text-emerald-300">
                      선물이 전송되었어요!
                    </p>
                  )}

                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={submit}
                      disabled={sending || success || !recipient.trim()}
                      style={{ touchAction: "manipulation" }}
                      className="flex-1 h-12 rounded-lg bg-gradient-to-r from-amber-400 to-rose-500 text-zinc-950 font-bold text-sm disabled:opacity-50 active:scale-[0.98] transition"
                    >
                      {sending
                        ? "보내는 중..."
                        : success
                        ? "전송 완료"
                        : "선물 보내기"}
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      disabled={sending}
                      style={{ touchAction: "manipulation" }}
                      className="flex-1 h-12 rounded-lg bg-white/10 hover:bg-white/15 text-white font-semibold text-sm"
                    >
                      취소
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
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
