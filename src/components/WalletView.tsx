"use client";

import PokeLoader, { CenteredPokeLoader } from "./PokeLoader";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
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
import { fetchProfile } from "@/lib/profile";
import { notifyGift } from "@/lib/discord";
import Link from "next/link";
import PokeCard from "./PokeCard";
import PsaSlab from "./PsaSlab";
import CoinIcon from "./CoinIcon";
import PageHeader from "./PageHeader";
import PageBackdrop from "./PageBackdrop";
import Portal from "./Portal";
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
    packsOpenedBySet: { m2a: 0, m2: 0, sv8: 0, sv2a: 0, sv8a: 0, sv5a: 0, sv10: 0 },
    totalCards: 0,
  });
  const [psa, setPsa] = useState<PsaGradingWithDisplay[]>([]);
  const [petIds, setPetIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>("ALL");

  const userId = user?.id ?? null;
  const refresh = useCallback(async () => {
    if (!userId) return;
    const [w, g, p] = await Promise.all([
      fetchWallet(userId),
      fetchAllGradingsWithDisplay(userId),
      fetchProfile(userId),
    ]);
    setSnap(w);
    setPsa(g);
    setPetIds(new Set(p.main_card_ids ?? []));
    setLoading(false);
  }, [userId]);

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
        const isPet = petIds.has(g.id);
        return { grading: g, card, isPet, isDisplayed: g.displayed };
      })
      .filter(
        (v): v is {
          grading: PsaGradingWithDisplay;
          card: Card;
          isPet: boolean;
          isDisplayed: boolean;
        } => v !== null
      )
      .sort((a, b) => {
        const ar = a.isDisplayed || a.isPet ? 1 : 0;
        const br = b.isDisplayed || b.isPet ? 1 : 0;
        if (ar !== br) return ar - br;
        return b.grading.grade - a.grading.grade;
      });
  }, [psa, petIds]);

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
    <div className="relative max-w-6xl mx-auto px-4 md:px-6 py-3 md:py-6 fade-in">
      <PageBackdrop tone="amber" />
      <PageHeader title="내 카드지갑" />

      <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
        <div className="inline-flex items-stretch rounded-xl bg-white/5 border border-white/10 p-1">
          <ModeTab active={mode === "psa"} onClick={() => setMode("psa")}>
            PCL 감별
            <CountBadge value={psaItems.length} cap="2만" />
          </ModeTab>
          <ModeTab active={mode === "cards"} onClick={() => setMode("cards")}>
            보유 카드
            <CountBadge value={snap.totalCards} cap="2만" />
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
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          {mode === "cards" ? (
            <motion.div
              key="cards"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              <CardsMode
                items={items}
                rarityCounts={rarityCounts}
                rarityFilter={rarityFilter}
                setRarityFilter={setRarityFilter}
              />
            </motion.div>
          ) : (
            <motion.div
              key="psa"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              <PsaMode items={psaItems} onAfterGift={refresh} />
            </motion.div>
          )}
        </AnimatePresence>
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
  const reduce = useReducedMotion();

  // 무한 스크롤 — 30종씩 점진 로드. PsaMode 와 동일 패턴.
  const [visibleCount, setVisibleCount] = useState(WALLET_PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // items 또는 rarityFilter 가 바뀌면 첫 페이지로 리셋.
  useEffect(() => {
    setVisibleCount(WALLET_PAGE_SIZE);
  }, [items, rarityFilter]);

  useEffect(() => {
    if (items.length <= WALLET_PAGE_SIZE) return;
    const node = sentinelRef.current;
    if (!node) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisibleCount((n) =>
              n >= items.length ? n : Math.min(n + WALLET_PAGE_SIZE, items.length)
            );
          }
        }
      },
      { rootMargin: "200px 0px" }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [items.length]);

  const visibleItems = useMemo(
    () => items.slice(0, visibleCount),
    [items, visibleCount]
  );
  const hasMore = visibleCount < items.length;

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
        <motion.div
          key={`cards-${rarityFilter}`}
          className="mt-4 md:mt-5 grid grid-cols-3 gap-2 md:gap-3"
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: {
              transition: {
                staggerChildren: reduce ? 0 : 0.02,
                delayChildren: reduce ? 0 : 0.04,
              },
            },
          }}
        >
          {visibleItems.map(({ card, count }) => (
            <motion.div
              key={card.id}
              variants={{
                hidden: reduce
                  ? { opacity: 1, y: 0 }
                  : { opacity: 0, y: 8, scale: 0.97 },
                show: {
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  transition: { duration: 0.26, ease: [0.2, 0.8, 0.2, 1] },
                },
              }}
            >
              <Link
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
            </motion.div>
          ))}
        </motion.div>
      )}
      {hasMore && (
        <div
          ref={sentinelRef}
          className="mt-6 flex items-center justify-center text-[11px] text-zinc-500"
        >
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 border-2 border-amber-400/40 border-t-amber-300 rounded-full animate-spin" />
            더 불러오는 중… ({visibleCount.toLocaleString("ko-KR")} /{" "}
            {items.length.toLocaleString("ko-KR")})
          </span>
        </div>
      )}
      {!hasMore && items.length > WALLET_PAGE_SIZE && (
        <p className="mt-6 text-center text-[10px] text-zinc-600">
          전체 {items.length.toLocaleString("ko-KR")}종 모두 표시
        </p>
      )}
    </>
  );
}

// 한 페이지에 보일 카드/슬랩 수. 무한 스크롤로 30개씩 추가.
const WALLET_PAGE_SIZE = 30;

function PsaMode({
  items,
  onAfterGift,
}: {
  items: {
    grading: PsaGradingWithDisplay;
    card: Card;
    isPet: boolean;
    isDisplayed: boolean;
  }[];
  onAfterGift: () => void | Promise<void>;
}) {
  const reduce = useReducedMotion();
  const [previewTarget, setPreviewTarget] = useState<{
    grading: PsaGradingWithDisplay;
    card: Card;
  } | null>(null);
  const [giftTarget, setGiftTarget] = useState<{
    grading: PsaGradingWithDisplay;
    card: Card;
  } | null>(null);

  // 무한 스크롤 — 30장씩 점진적 로드.
  const [visibleCount, setVisibleCount] = useState(WALLET_PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // items 가 바뀌면 (gift / refresh / 정렬 변경 등) 첫 페이지로 리셋.
  useEffect(() => {
    setVisibleCount(WALLET_PAGE_SIZE);
  }, [items]);

  // IntersectionObserver: sentinel 이 viewport 에 들어오면 다음 페이지 로드.
  useEffect(() => {
    if (items.length <= WALLET_PAGE_SIZE) return;
    const node = sentinelRef.current;
    if (!node) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisibleCount((n) =>
              n >= items.length ? n : Math.min(n + WALLET_PAGE_SIZE, items.length)
            );
          }
        }
      },
      { rootMargin: "200px 0px" }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [items.length]);

  const visibleItems = useMemo(
    () => items.slice(0, visibleCount),
    [items, visibleCount]
  );
  const hasMore = visibleCount < items.length;

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
  return (
    <>
      <motion.div
        className="mt-4 grid grid-cols-3 gap-2 md:gap-3 place-items-stretch"
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: {
            transition: {
              staggerChildren: reduce ? 0 : 0.025,
              delayChildren: reduce ? 0 : 0.04,
            },
          },
        }}
      >
        {visibleItems.map(({ grading, card, isPet, isDisplayed }) => {
          const locked = isPet || isDisplayed;
          const giftable = !locked && grading.grade >= 6;
          const badge = isDisplayed
            ? { text: "🏛️ 전시 중", cls: "bg-fuchsia-500 text-white" }
            : isPet
            ? { text: "🐾 펫", cls: "bg-amber-400 text-zinc-950" }
            : null;
          return (
            <motion.button
              key={grading.id}
              type="button"
              onClick={() =>
                !locked && giftable && setPreviewTarget({ grading, card })
              }
              disabled={locked || !giftable}
              style={{ touchAction: "manipulation" }}
              variants={{
                hidden: reduce
                  ? { opacity: 1, y: 0 }
                  : { opacity: 0, y: 8, scale: 0.97 },
                show: {
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  transition: { duration: 0.26, ease: [0.2, 0.8, 0.2, 1] },
                },
              }}
              className={clsx(
                "relative flex flex-col items-center gap-1 w-full text-left active:scale-[0.98] transition",
                locked && "cursor-not-allowed",
                !locked && !giftable && "cursor-not-allowed"
              )}
              aria-disabled={locked || !giftable}
              title={
                isDisplayed
                  ? "센터에 전시 중 — 선물·관리 불가"
                  : isPet
                  ? "펫으로 등록 중 — 선물·관리 불가"
                  : undefined
              }
            >
              <div className="relative w-full">
                <div
                  className={clsx(
                    "transition",
                    locked && "opacity-45 grayscale saturate-50"
                  )}
                >
                  <PsaSlab card={card} grade={grading.grade} size="sm" compact />
                </div>
                {locked && (
                  <div
                    aria-hidden
                    className="absolute inset-0 rounded-md bg-zinc-950/35 ring-1 ring-inset ring-white/10 pointer-events-none"
                  />
                )}
                {badge && (
                  <span
                    className={clsx(
                      "absolute -top-1.5 left-1/2 -translate-x-1/2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-black shadow-md whitespace-nowrap z-10",
                      badge.cls
                    )}
                  >
                    {badge.text}
                  </span>
                )}
              </div>
              <p
                className={clsx(
                  "w-full text-center text-[10px] leading-tight line-clamp-1 px-0.5",
                  locked ? "text-zinc-500" : "text-zinc-300"
                )}
              >
                {card.name}
              </p>
            </motion.button>
          );
        })}
      </motion.div>

      {hasMore && (
        <div
          ref={sentinelRef}
          className="mt-6 flex items-center justify-center text-[11px] text-zinc-500"
        >
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 border-2 border-fuchsia-400/40 border-t-fuchsia-300 rounded-full animate-spin" />
            더 불러오는 중… ({visibleCount.toLocaleString("ko-KR")} /{" "}
            {items.length.toLocaleString("ko-KR")})
          </span>
        </div>
      )}
      {!hasMore && items.length > WALLET_PAGE_SIZE && (
        <p className="mt-6 text-center text-[10px] text-zinc-600">
          전체 {items.length.toLocaleString("ko-KR")}장 모두 표시
        </p>
      )}

      <SlabPreview
        target={previewTarget}
        onClose={() => setPreviewTarget(null)}
        onGift={() => {
          if (previewTarget) {
            setGiftTarget(previewTarget);
            setPreviewTarget(null);
          }
        }}
      />

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

function SlabPreview({
  target,
  onClose,
  onGift,
}: {
  target: { grading: PsaGradingWithDisplay; card: Card } | null;
  onClose: () => void;
  onGift: () => void;
}) {
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

  return (
    <AnimatePresence>
      {target && (
        <Portal>
          <motion.div
            key="preview-backdrop"
            className="fixed inset-0 z-[145] bg-black/85 backdrop-blur-md flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              paddingTop: "max(env(safe-area-inset-top, 0px), 12px)",
              paddingBottom: "max(env(safe-area-inset-bottom, 0px), 12px)",
              paddingLeft: 12,
              paddingRight: 12,
            }}
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-xs bg-zinc-950 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
              initial={{ scale: 0.94, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 12 }}
              transition={{ type: "spring", stiffness: 240, damping: 26 }}
            >
              <button
                onClick={onClose}
                aria-label="닫기"
                className="absolute top-2 right-2 z-10 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
                style={{ touchAction: "manipulation" }}
              >
                ✕
              </button>
              <div className="px-4 pt-5 pb-4 flex flex-col items-center gap-3">
                <PsaSlab
                  card={target.card}
                  grade={target.grading.grade}
                  size="sm"
                />
                <div className="w-full text-center">
                  <h3 className="text-base font-black text-white">
                    {target.card.name}
                  </h3>
                  <p className="mt-0.5 text-[11px] text-zinc-400">
                    {SETS[target.card.setCode]?.name ?? target.card.setCode} · #
                    {target.card.number}
                  </p>
                  <p className="mt-1 text-[11px] font-bold text-fuchsia-200">
                    PCL {target.grading.grade} · {target.card.rarity}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onGift}
                  style={{ touchAction: "manipulation" }}
                  className="w-full h-11 rounded-xl bg-gradient-to-r from-amber-400 to-rose-500 text-zinc-950 font-black text-sm hover:scale-[1.02] active:scale-[0.98] transition"
                >
                  🎁 선물하기
                </button>
              </div>
            </motion.div>
          </motion.div>
        </Portal>
      )}
    </AnimatePresence>
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
    notifyGift(
      user.display_name,
      recipient.trim(),
      target.card.id,
      target.grading.grade,
      price
    );
    setSuccess(true);
    setTimeout(onSuccess, 900);
  };

  return (
    <AnimatePresence>
      {target && (
        <Portal>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-[150] bg-black/85 backdrop-blur-md flex items-center justify-center"
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
            className="relative w-full max-w-md bg-zinc-950/95 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{ maxHeight: "calc(100dvh - 24px)", height: "auto" }}
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.94, opacity: 0 }}
            transition={{ type: "tween", ease: [0.2, 0.8, 0.2, 1], duration: 0.22 }}
          >
            <div className="flex items-center justify-between gap-2 px-4 h-12 border-b border-white/10 shrink-0">
              <h2 className="text-sm font-black text-white truncate">
                🎁 {target.card.name} 선물
              </h2>
              <button
                onClick={onClose}
                aria-label="닫기"
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center shrink-0"
                style={{ touchAction: "manipulation" }}
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain min-h-0 p-4 space-y-3">
                  <label className="block">
                    <span className="text-xs text-zinc-300 mb-1.5 block">
                      받는 사람
                    </span>
                    <UserSelect
                      value={recipient || null}
                      excludeSelf
                      placeholder="받는 사람 고르기"
                      onChange={(u) => setRecipient(u.user_id)}
                    />
                  </label>

                  <label className="block">
                    <span className="text-xs text-zinc-300 mb-1.5 block">
                      받는 사람이 지불할 포인트
                    </span>
                    <input
                      value={priceRaw}
                      onChange={(e) =>
                        setPriceRaw(e.target.value.replace(/[^0-9]/g, ""))
                      }
                      inputMode="numeric"
                      style={{ fontSize: "16px" }}
                      className="w-full h-11 px-3 rounded-lg bg-black/40 border border-white/10 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-400/60 tabular-nums"
                      placeholder="0"
                    />
                  </label>

                  <label className="block">
                    <span className="text-xs text-zinc-300 mb-1.5 block">
                      메시지 <span className="text-zinc-500">(선택)</span>
                    </span>
                    <textarea
                      value={message}
                      onChange={(e) =>
                        setMessage(e.target.value.slice(0, 140))
                      }
                      rows={2}
                      maxLength={140}
                      placeholder="짧은 메시지"
                      style={{ fontSize: "16px" }}
                      className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-400/60 resize-none"
                    />
                    <div className="mt-0.5 text-right text-[10px] text-zinc-500 tabular-nums">
                      {message.length} / 140
                    </div>
                  </label>

                  <p className="text-[11px] text-zinc-500 leading-snug">
                    24시간 내 수락 안 하면 슬랩은 내 지갑에 남아요.
                    {quota && (
                      <span className="block text-zinc-400">
                        오늘 {quota.used}/{quota.limit} 사용 · 남은{" "}
                        {quota.remaining}회
                      </span>
                    )}
                  </p>

                  {error && (
                    <p className="text-xs text-rose-400">{error}</p>
                  )}
                  {success && (
                    <p className="text-xs text-emerald-300">
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
          </motion.div>
          </motion.div>
        </Portal>
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

function CountBadge({ value, cap }: { value: number; cap?: string }) {
  const reduce = useReducedMotion();
  return (
    <span className="ml-1.5 text-[10px] opacity-70 inline-block tabular-nums">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={reduce ? false : { y: -6, opacity: 0, scale: 0.85 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { y: 6, opacity: 0, scale: 0.85 }}
          transition={{ type: "spring", stiffness: 420, damping: 22 }}
          className="inline-block"
        >
          {value}
        </motion.span>
      </AnimatePresence>
      {cap && <span className="opacity-60"> / {cap}</span>}
    </span>
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
