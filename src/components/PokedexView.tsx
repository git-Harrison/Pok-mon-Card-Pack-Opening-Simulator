"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { useAuth } from "@/lib/auth";
import { fetchAllGradingsWithDisplay, type PsaGradingWithDisplay } from "@/lib/db";
import {
  fetchPokedex,
  nextBreakpoint,
  pokedexPowerBonus,
  POKEDEX_BREAKPOINTS,
  registerPokedexEntry,
  type PokedexEntry,
} from "@/lib/pokedex";
import { getCard } from "@/lib/sets";
import { compareRarity, RARITY_STYLE } from "@/lib/rarity";
import type { Rarity } from "@/lib/types";
import HelpButton, { type HelpSection } from "./HelpButton";
import PageHeader from "./PageHeader";
import Portal from "./Portal";
import RarityBadge from "./RarityBadge";

const HELP_SECTIONS: HelpSection[] = [
  {
    heading: "도감이란",
    icon: "📔",
    body: (
      <>
        PCL 10 슬랩을 영구히 박제해 모으는 컬렉션이에요. 한 번 등록하면 그 슬랩
        은 카드지갑/센터에서 사라지고 도감에 박제돼요. 카드 한 종류는 한 번만
        등록할 수 있어요.
      </>
    ),
  },
  {
    heading: "등록 조건",
    icon: "✅",
    body: (
      <ul>
        <li>본인 소유 PCL 10 슬랩만 가능</li>
        <li>센터에 전시 중이거나 선물로 보낸 슬랩은 불가</li>
        <li>같은 카드(card_id) 는 한 번만 등록 가능</li>
        <li>등록한 슬랩은 영구 삭제. 환불 불가</li>
      </ul>
    ),
  },
  {
    heading: "전투력 보너스",
    icon: "⚡",
    body: (
      <>
        도감 보유 수에 따라 <b>센터 전투력</b>에 보너스가 붙어 사용자 랭킹에
        자동 반영돼요.
        <ul className="mt-1.5">
          <li>5장 → +500</li>
          <li>10장 → +1,200</li>
          <li>15장 → +2,000</li>
          <li>20장 → +3,000</li>
          <li>30장 → +5,000 (이후 1장당 +100)</li>
        </ul>
      </>
    ),
  },
  {
    heading: "책 넘기기",
    icon: "📖",
    body: (
      <>
        도감은 책처럼 한 페이지에 6장씩 펼쳐져요. 좌우 화살표로 페이지를 넘기면
        3D 페이지 플립 애니메이션이 재생돼요. <b>등급별</b> 탭은 PCL 등급 구간
        으로, <b>포켓몬별</b> 탭은 카드 ID 순으로 정렬돼요.
      </>
    ),
  },
];

const CARDS_PER_PAGE = 6;

type GroupTab = "rarity" | "name";

export default function PokedexView() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<PokedexEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<GroupTab>("rarity");
  const [pageIndex, setPageIndex] = useState(0);
  const [flipDir, setFlipDir] = useState<1 | -1>(1);
  const [registerOpen, setRegisterOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const list = await fetchPokedex(user.id);
    setEntries(list);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const sorted = useMemo(() => {
    const arr = [...entries];
    if (tab === "rarity") {
      arr.sort((a, b) => {
        const ra = (a.rarity ?? "") as Rarity;
        const rb = (b.rarity ?? "") as Rarity;
        const tierA = RARITY_STYLE[ra]?.tier ?? -1;
        const tierB = RARITY_STYLE[rb]?.tier ?? -1;
        if (tierA !== tierB) return tierB - tierA;
        return a.card_id.localeCompare(b.card_id);
      });
    } else {
      arr.sort((a, b) => {
        const ca = getCard(a.card_id);
        const cb = getCard(b.card_id);
        const na = ca?.name ?? a.card_id;
        const nb = cb?.name ?? b.card_id;
        return na.localeCompare(nb, "ko");
      });
    }
    return arr;
  }, [entries, tab]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / CARDS_PER_PAGE));
  const safePageIndex = Math.min(pageIndex, totalPages - 1);
  const pageEntries = sorted.slice(
    safePageIndex * CARDS_PER_PAGE,
    safePageIndex * CARDS_PER_PAGE + CARDS_PER_PAGE
  );

  useEffect(() => {
    setPageIndex(0);
  }, [tab]);

  const goPrev = () => {
    if (safePageIndex <= 0) return;
    setFlipDir(-1);
    setPageIndex((i) => Math.max(0, i - 1));
  };
  const goNext = () => {
    if (safePageIndex >= totalPages - 1) return;
    setFlipDir(1);
    setPageIndex((i) => Math.min(totalPages - 1, i + 1));
  };

  const count = entries.length;
  const bonus = pokedexPowerBonus(count);
  const next = nextBreakpoint(count);

  return (
    <div className="max-w-5xl mx-auto px-3 md:px-6 py-4 md:py-8 fade-in">
      <PageHeader
        title="PCL 도감"
        icon="📔"
        subtitle="PCL10 슬랩을 영구 박제해 모으는 컬렉션. 도감 수에 따라 센터 전투력 보너스."
        tone="amber"
        stats={
          <>
            <span className="px-2 py-1 rounded-full bg-amber-400/15 border border-amber-400/40 text-amber-100 text-[11px] font-bold">
              등록 {count}장
            </span>
            <span className="px-2 py-1 rounded-full bg-fuchsia-400/15 border border-fuchsia-400/40 text-fuchsia-100 text-[11px] font-bold">
              전투력 +{bonus.toLocaleString("ko-KR")}p
            </span>
            <HelpButton size="sm" title="PCL 도감" sections={HELP_SECTIONS} />
          </>
        }
      />

      <div className="rounded-xl border border-white/10 bg-gradient-to-r from-amber-500/10 via-fuchsia-500/5 to-indigo-500/10 p-3 md:p-4 mb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[12px] md:text-[13px] text-zinc-200">
            {next ? (
              <>
                앞으로 <b className="text-amber-200">{next.remaining}장</b> 더
                등록하면{" "}
                <b className="text-fuchsia-200">
                  +{next.bonusAtNext.toLocaleString("ko-KR")}
                </b>{" "}
                구간 (현재 +{bonus.toLocaleString("ko-KR")})
              </>
            ) : (
              <>최대 보너스 구간 도달. 1장당 +100씩 계속 누적돼요.</>
            )}
          </div>
          <button
            type="button"
            onClick={() => setRegisterOpen(true)}
            style={{ touchAction: "manipulation" }}
            className="h-10 px-4 rounded-xl bg-gradient-to-r from-amber-400 to-fuchsia-500 text-zinc-950 font-bold text-sm hover:scale-[1.02] active:scale-[0.98] transition shadow-[0_10px_30px_-10px_rgba(251,191,36,0.7)]"
          >
            + 도감 등록
          </button>
        </div>
        <div className="mt-2 flex items-center gap-1 flex-wrap">
          {POKEDEX_BREAKPOINTS.map((b) => (
            <span
              key={b.count}
              className={clsx(
                "px-2 py-0.5 rounded-full text-[10px] font-bold border",
                count >= b.count
                  ? "bg-amber-400/20 text-amber-100 border-amber-400/50"
                  : "bg-white/5 text-zinc-400 border-white/10"
              )}
            >
              {b.count}장 · {b.label}
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <TabBtn active={tab === "rarity"} onClick={() => setTab("rarity")}>
          등급별
        </TabBtn>
        <TabBtn active={tab === "name"} onClick={() => setTab("name")}>
          포켓몬별
        </TabBtn>
        <span className="ml-auto text-[11px] text-zinc-400 tabular-nums">
          {totalPages > 0
            ? `${safePageIndex + 1} / ${totalPages}`
            : "0 / 0"}
        </span>
      </div>

      <Book
        loading={loading}
        flipDir={flipDir}
        pageIndex={safePageIndex}
        pageEntries={pageEntries}
      />

      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={goPrev}
          disabled={safePageIndex <= 0}
          style={{ touchAction: "manipulation" }}
          className={clsx(
            "h-11 px-5 rounded-xl border font-bold text-sm transition inline-flex items-center gap-2",
            safePageIndex <= 0
              ? "bg-white/5 border-white/10 text-zinc-600 cursor-not-allowed"
              : "bg-white/10 border-white/15 text-white hover:bg-white/15"
          )}
        >
          ← 이전
        </button>
        <div className="text-[11px] text-zinc-400 tabular-nums">
          {safePageIndex + 1} / {totalPages}
        </div>
        <button
          type="button"
          onClick={goNext}
          disabled={safePageIndex >= totalPages - 1}
          style={{ touchAction: "manipulation" }}
          className={clsx(
            "h-11 px-5 rounded-xl border font-bold text-sm transition inline-flex items-center gap-2",
            safePageIndex >= totalPages - 1
              ? "bg-white/5 border-white/10 text-zinc-600 cursor-not-allowed"
              : "bg-white/10 border-white/15 text-white hover:bg-white/15"
          )}
        >
          다음 →
        </button>
      </div>

      <AnimatePresence>
        {registerOpen && user && (
          <RegisterModal
            userId={user.id}
            registeredCardIds={new Set(entries.map((e) => e.card_id))}
            onClose={() => setRegisterOpen(false)}
            onRegistered={() => {
              setRegisterOpen(false);
              refresh();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function TabBtn({
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
      type="button"
      onClick={onClick}
      style={{ touchAction: "manipulation" }}
      className={clsx(
        "h-9 px-4 rounded-full text-xs font-bold transition border",
        active
          ? "bg-white text-zinc-900 border-white"
          : "bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10"
      )}
    >
      {children}
    </button>
  );
}

function Book({
  loading,
  flipDir,
  pageIndex,
  pageEntries,
}: {
  loading: boolean;
  flipDir: 1 | -1;
  pageIndex: number;
  pageEntries: PokedexEntry[];
}) {
  return (
    <div
      className="relative rounded-2xl overflow-hidden border border-amber-900/40 bg-[linear-gradient(160deg,#3a2410_0%,#1a0e07_55%,#0a0604_100%)] p-3 md:p-5 perspective-1200"
      style={{ minHeight: 460 }}
    >
      <div
        aria-hidden
        className="absolute inset-y-2 left-1/2 -translate-x-1/2 w-px bg-gradient-to-b from-amber-900/0 via-amber-700/40 to-amber-900/0 hidden md:block pointer-events-none"
      />
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-30"
        style={{
          background:
            "radial-gradient(closest-side at 50% 0%, rgba(251,191,36,0.25), rgba(251,191,36,0) 60%)",
        }}
      />
      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-zinc-400">
          도감을 펼치는 중...
        </div>
      ) : pageEntries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <div className="text-5xl mb-3">📖</div>
          <p className="text-sm text-zinc-300 font-bold">아직 도감이 비어있어요</p>
          <p className="mt-1 text-[12px] text-zinc-500">
            PCL 10 슬랩을 등록하면 여기에 박제돼요.
          </p>
        </div>
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pageIndex}
            className="relative preserve-3d"
            initial={{ rotateY: flipDir === 1 ? 90 : -90, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            exit={{ rotateY: flipDir === 1 ? -90 : 90, opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
            style={{ transformOrigin: flipDir === 1 ? "left center" : "right center" }}
          >
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 backface-hidden">
              {pageEntries.map((e) => (
                <DexCell key={e.id} entry={e} />
              ))}
              {Array.from({ length: CARDS_PER_PAGE - pageEntries.length }).map(
                (_, i) => (
                  <div
                    key={`pad-${i}`}
                    className="rounded-xl border border-dashed border-white/5 bg-white/[0.02] aspect-[5/7]"
                  />
                )
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

function DexCell({ entry }: { entry: PokedexEntry }) {
  const card = getCard(entry.card_id);
  const rarity = (entry.rarity ?? card?.rarity ?? "C") as Rarity;
  const style = RARITY_STYLE[rarity];
  const date = new Date(entry.registered_at);
  const dateStr = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}.${String(date.getDate()).padStart(2, "0")}`;

  return (
    <div
      className={clsx(
        "relative rounded-xl overflow-hidden ring-2 bg-zinc-950",
        style.frame
      )}
    >
      <div className="relative aspect-[5/7]">
        {card?.imageUrl ? (
          <img
            src={card.imageUrl}
            alt={card.name}
            loading="lazy"
            draggable={false}
            className="w-full h-full object-contain bg-zinc-950 select-none pointer-events-none"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-400 text-xs">
            {card?.name ?? entry.card_id}
          </div>
        )}
        <div className="absolute top-1.5 right-1.5">
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-400 text-zinc-950 shadow-[0_0_10px_rgba(251,191,36,0.6)]">
            PCL10
          </span>
        </div>
      </div>
      <div className="px-2 py-1.5 bg-black/60 border-t border-white/5">
        <div className="flex items-center justify-between gap-1">
          <p className="text-[11px] font-bold text-white truncate">
            {card?.name ?? entry.card_id}
          </p>
          <RarityBadge rarity={rarity} size="xs" />
        </div>
        <p className="text-[9px] text-zinc-500 mt-0.5 tabular-nums">
          {dateStr} 박제
        </p>
      </div>
    </div>
  );
}

function RegisterModal({
  userId,
  registeredCardIds,
  onClose,
  onRegistered,
}: {
  userId: string;
  registeredCardIds: Set<string>;
  onClose: () => void;
  onRegistered: () => void;
}) {
  const [slabs, setSlabs] = useState<PsaGradingWithDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<PsaGradingWithDisplay | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    let canceled = false;
    fetchAllGradingsWithDisplay(userId).then((list) => {
      if (canceled) return;
      const eligible = list.filter(
        (g) => g.grade === 10 && !g.displayed && !registeredCardIds.has(g.card_id)
      );
      eligible.sort((a, b) => {
        const ca = getCard(a.card_id);
        const cb = getCard(b.card_id);
        if (ca && cb) {
          const r = compareRarity(ca.rarity, cb.rarity);
          if (r !== 0) return r;
        }
        return a.card_id.localeCompare(b.card_id);
      });
      setSlabs(eligible);
      setLoading(false);
    });
    return () => {
      canceled = true;
    };
  }, [userId, registeredCardIds]);

  const handleRegister = async () => {
    if (!confirm) return;
    setSubmitting(true);
    setError(null);
    const res = await registerPokedexEntry(userId, confirm.id);
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error ?? "등록에 실패했어요.");
      return;
    }
    onRegistered();
  };

  return (
    <Portal>
      <motion.div
        className="fixed inset-0 z-[180] bg-black/85 backdrop-blur-md flex items-end md:items-center justify-center"
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
          className="relative w-full max-w-2xl bg-zinc-950 border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
          style={{ maxHeight: "calc(100dvh - 24px)" }}
          initial={{ y: 32, opacity: 0, scale: 0.97 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 32, opacity: 0, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 220, damping: 24 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="shrink-0 flex items-center justify-between gap-3 px-4 h-12 border-b border-white/10 bg-gradient-to-r from-amber-500/15 via-fuchsia-500/10 to-indigo-500/15">
            <h2 className="text-sm font-bold text-white inline-flex items-center gap-1.5">
              <span aria-hidden>📔</span>
              도감 등록 — PCL 10 슬랩 선택
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white inline-flex items-center justify-center"
              style={{ touchAction: "manipulation" }}
            >
              ✕
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-3 md:p-4">
            {loading ? (
              <div className="text-center py-10 text-sm text-zinc-400">
                슬랩을 불러오는 중...
              </div>
            ) : slabs.length === 0 ? (
              <div className="text-center py-10 px-6">
                <div className="text-4xl mb-2">📭</div>
                <p className="text-sm text-zinc-300 font-bold">
                  등록 가능한 슬랩이 없어요
                </p>
                <p className="mt-1 text-[12px] text-zinc-500">
                  PCL 10 등급이고 센터에 전시 중이 아니며, 아직 도감에 없는 카드
                  여야 해요.
                </p>
              </div>
            ) : (
              <ul className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {slabs.map((g) => (
                  <SlabCell
                    key={g.id}
                    slab={g}
                    onPick={() => setConfirm(g)}
                  />
                ))}
              </ul>
            )}
          </div>

          {error && (
            <div className="shrink-0 mx-3 mb-2 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="shrink-0 border-t border-white/10 p-3 bg-black/40">
            <button
              type="button"
              onClick={onClose}
              className="w-full h-11 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-sm"
              style={{ touchAction: "manipulation" }}
            >
              닫기
            </button>
          </div>
        </motion.div>

        <AnimatePresence>
          {confirm && (
            <ConfirmDialog
              slab={confirm}
              submitting={submitting}
              onCancel={() => setConfirm(null)}
              onConfirm={handleRegister}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </Portal>
  );
}

function SlabCell({
  slab,
  onPick,
}: {
  slab: PsaGradingWithDisplay;
  onPick: () => void;
}) {
  const card = getCard(slab.card_id);
  const rarity = (card?.rarity ?? "SR") as Rarity;
  const style = RARITY_STYLE[rarity];
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        style={{ touchAction: "manipulation" }}
        className={clsx(
          "group w-full text-left rounded-xl overflow-hidden ring-2 bg-zinc-950 hover:scale-[1.02] active:scale-[0.98] transition",
          style.frame
        )}
      >
        <div className="relative aspect-[5/7]">
          {card?.imageUrl ? (
            <img
              src={card.imageUrl}
              alt={card.name}
              loading="lazy"
              draggable={false}
              className="w-full h-full object-contain bg-zinc-950 select-none pointer-events-none"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-500 text-xs">
              {slab.card_id}
            </div>
          )}
          <div className="absolute top-1.5 right-1.5">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-400 text-zinc-950 shadow-[0_0_10px_rgba(251,191,36,0.6)]">
              PCL10
            </span>
          </div>
        </div>
        <div className="px-2 py-1.5 bg-black/60 border-t border-white/5">
          <div className="flex items-center justify-between gap-1">
            <p className="text-[11px] font-bold text-white truncate">
              {card?.name ?? slab.card_id}
            </p>
            <RarityBadge rarity={rarity} size="xs" />
          </div>
        </div>
      </button>
    </li>
  );
}

function ConfirmDialog({
  slab,
  submitting,
  onCancel,
  onConfirm,
}: {
  slab: PsaGradingWithDisplay;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const card = getCard(slab.card_id);
  return (
    <motion.div
      className="absolute inset-0 z-[10] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onCancel}
    >
      <motion.div
        className="w-full max-w-sm bg-zinc-950 border border-amber-400/40 rounded-2xl overflow-hidden shadow-2xl"
        initial={{ y: 16, opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 16, opacity: 0, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 220, damping: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 pt-4 pb-2 text-center">
          <div className="text-4xl mb-1">📔</div>
          <h3 className="text-base font-black text-white">
            정말 등록할까요?
          </h3>
          <p className="mt-1 text-[12px] text-zinc-300 leading-relaxed">
            <b className="text-amber-200">{card?.name ?? slab.card_id}</b> PCL10
            슬랩을 도감에 박제해요. 이 슬랩은 영구히 카드지갑에서 사라져요.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 p-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            style={{ touchAction: "manipulation" }}
            className="h-11 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-sm disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            style={{ touchAction: "manipulation" }}
            className={clsx(
              "h-11 rounded-xl font-bold text-sm transition",
              submitting
                ? "bg-amber-400/40 text-zinc-900 cursor-wait"
                : "bg-gradient-to-r from-amber-400 to-fuchsia-500 text-zinc-950 hover:scale-[1.02] active:scale-[0.98]"
            )}
          >
            {submitting ? "박제 중..." : "박제하기"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
