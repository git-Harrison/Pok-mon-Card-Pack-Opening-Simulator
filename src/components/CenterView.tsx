"use client";

import PokeLoader from "./PokeLoader";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/lib/auth";
import {
  bulkDisplayPclSlabs,
  buyShowcase,
  claimShowcaseIncome,
  displayGrading,
  fetchSabotageLogs,
  fetchUndisplayedGradings,
  fetchUserCenter,
  removeShowcase,
  undisplayGrading,
  type CenterShowcase,
  type SabotageLog,
} from "@/lib/db";
import type { PsaGrading } from "@/lib/types";
import {
  CENTER_GRID_COLS,
  CENTER_GRID_ROWS,
  SHOWCASES,
  SHOWCASE_ORDER,
  slabIncomeTrade,
  type ShowcaseType,
} from "@/lib/center";
import { getCard } from "@/lib/sets";
import { RARITY_STYLE } from "@/lib/rarity";
import { psaTone } from "@/lib/psa";
import CoinIcon from "./CoinIcon";
import RarityBadge from "./RarityBadge";
import PsaSlab from "./PsaSlab";
import Portal from "./Portal";
import PageHeader from "./PageHeader";

export default function CenterView() {
  const { user, setPoints } = useAuth();
  const [showcases, setShowcases] = useState<CenterShowcase[]>([]);
  const [availableGradings, setAvailableGradings] = useState<PsaGrading[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // open modals
  const [shopSlot, setShopSlot] = useState<{ x: number; y: number } | null>(
    null
  );
  const [manageId, setManageId] = useState<string | null>(null);
  const [pickTarget, setPickTarget] = useState<{
    showcaseId: string;
    slotIndex: number;
  } | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [logs, setLogs] = useState<SabotageLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const openLogs = useCallback(async () => {
    if (!user) return;
    setLogOpen(true);
    setLogsLoading(true);
    const rows = await fetchSabotageLogs(user.id);
    setLogs(rows);
    setLogsLoading(false);
  }, [user]);

  const refresh = useCallback(async () => {
    if (!user) return;
    const [c, g] = await Promise.all([
      fetchUserCenter(user.id),
      fetchUndisplayedGradings(user.id),
    ]);
    setShowcases(c);
    setAvailableGradings(g.filter((x) => x.grade === 9 || x.grade === 10));
    setLoading(false);
  }, [user]);

  // Silently sync any pending passive income on mount — no visible
  // counter / toast. Showcase income accrues server-side and the
  // user just sees a static "시간당 +Np / +M 점" rate below.
  useEffect(() => {
    (async () => {
      if (!user) return;
      const res = await claimShowcaseIncome(user.id);
      if (res.ok && typeof res.points === "number") setPoints(res.points);
      await refresh();
    })();
  }, [user, refresh, setPoints]);

  const byCell = useMemo(() => {
    const m = new Map<string, CenterShowcase>();
    for (const s of showcases) m.set(`${s.slot_x}:${s.slot_y}`, s);
    return m;
  }, [showcases]);

  const manageShowcase = manageId
    ? showcases.find((s) => s.id === manageId) ?? null
    : null;

  const handleBuy = useCallback(
    async (type: ShowcaseType) => {
      if (!user || !shopSlot) return;
      const spec = SHOWCASES[type];
      if ((user.points ?? 0) < spec.price) {
        setError("포인트가 부족해요.");
        return;
      }
      setError(null);
      const res = await buyShowcase(user.id, type, shopSlot.x, shopSlot.y);
      if (!res.ok) {
        setError(res.error ?? "구매 실패");
        return;
      }
      if (typeof res.points === "number") setPoints(res.points);
      setShopSlot(null);
      await refresh();
    },
    [user, shopSlot, setPoints, refresh]
  );

  const handleRemoveShowcase = useCallback(async () => {
    if (!user || !manageId) return;
    if (
      !window.confirm(
        "이 보관함을 치울까요?\n전시 중인 카드는 지갑으로 돌아옵니다. 구매 금액은 환불되지 않아요."
      )
    ) {
      return;
    }
    const res = await removeShowcase(user.id, manageId);
    if (!res.ok) {
      setError(res.error ?? "치우기 실패");
      return;
    }
    setManageId(null);
    await refresh();
  }, [user, manageId, refresh]);

  const handleUndisplay = useCallback(
    async (showcaseId: string, slotIndex: number) => {
      if (!user) return;
      const res = await undisplayGrading(user.id, showcaseId, slotIndex);
      if (!res.ok) {
        setError(res.error ?? "꺼내기 실패");
        return;
      }
      await refresh();
    },
    [user, refresh]
  );

  const handlePickGrading = useCallback(
    async (grading: PsaGrading) => {
      if (!user || !pickTarget) return;
      const res = await displayGrading(
        user.id,
        pickTarget.showcaseId,
        pickTarget.slotIndex,
        grading.id
      );
      if (!res.ok) {
        setError(res.error ?? "전시 실패");
        return;
      }
      setPickTarget(null);
      await refresh();
    },
    [user, pickTarget, refresh]
  );

  const handleBulkDisplay = useCallback(
    async (showcaseId: string) => {
      if (!user) return;
      setError(null);
      const res = await bulkDisplayPclSlabs(user.id, showcaseId);
      if (!res.ok) {
        setError(res.error ?? "일괄 전시 실패");
        return;
      }
      const n = res.displayed_count ?? 0;
      if (n === 0) {
        setError("전시 가능한 PCL 9·10 슬랩이 없거나 보관함이 가득 찼어요.");
      }
      await refresh();
    },
    [user, refresh]
  );

  const inviteUrl = useMemo(() => {
    if (!user || typeof window === "undefined") return "";
    return `${window.location.origin}/center/${encodeURIComponent(user.user_id)}`;
  }, [user]);

  const copyInvite = useCallback(async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback — highlight the text in a prompt
      window.prompt("초대 링크를 복사하세요", inviteUrl);
    }
  }, [inviteUrl]);

  const totalCards = useMemo(
    () => showcases.reduce((s, sc) => s + sc.cards.length, 0),
    [showcases]
  );

  const incomePerHour = useMemo(() => {
    let trade = 0;
    let rank = 0;
    for (const sc of showcases) {
      for (const c of sc.cards) {
        const card = getCard(c.card_id);
        if (!card) continue;
        const t = slabIncomeTrade(card.rarity, c.grade);
        trade += t;
        rank += Math.floor(t / 200);
      }
    }
    return { trade, rank };
  }, [showcases]);

  return (
    <div className="relative min-h-[calc(100dvh-4rem)]">
      <CenterBackdrop />
      <div className="relative z-10 max-w-3xl mx-auto px-4 md:px-6 py-3 md:py-6 fade-in">
        <PageHeader
          title="내 포켓몬센터"
          stats={
            <>
              <Kpi label="보관함" value={`${showcases.length}`} />
              <Kpi label="전시" value={`${totalCards}`} highlight />
            </>
          }
        />

        {totalCards > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
            <div className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400/10 border border-amber-400/30 px-3 py-1.5 text-amber-200">
              <CoinIcon size="xs" />
              <b className="tabular-nums">
                +{incomePerHour.trade.toLocaleString("ko-KR")}p
              </b>
              <span className="text-amber-200/70">/ 시간</span>
            </div>
            {incomePerHour.rank > 0 && (
              <div className="inline-flex items-center gap-1.5 rounded-lg bg-rose-400/10 border border-rose-400/30 px-3 py-1.5 text-rose-200">
                🏆
                <b className="tabular-nums">
                  +{incomePerHour.rank.toLocaleString("ko-KR")}
                </b>
                <span className="text-rose-200/70">랭킹 / 시간</span>
              </div>
            )}
            <span className="text-zinc-500 text-[10px]">
              · 1시간마다 자동 적립
            </span>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={copyInvite}
            className="h-9 px-3 rounded-full bg-gradient-to-r from-fuchsia-500 to-indigo-500 text-white font-bold text-xs hover:scale-[1.02] active:scale-[0.98] transition inline-flex items-center gap-1.5"
          >
            🔗 {copied ? "복사 완료!" : "초대 링크 복사"}
          </button>
          <button
            onClick={openLogs}
            className="h-9 px-3 rounded-full bg-white/10 hover:bg-white/15 text-white font-bold text-xs border border-white/15 transition inline-flex items-center gap-1.5"
          >
            📜 방문 기록
          </button>
        </div>

        {error && (
          <div className="mt-3 text-xs text-rose-200 bg-rose-500/15 border border-rose-500/40 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {loading ? (
          <div className="mt-12 flex justify-center">
            <PokeLoader size="md" />
          </div>
        ) : (
          <CenterGrid
            byCell={byCell}
            onEmpty={(x, y) => setShopSlot({ x, y })}
            onFilled={(id) => setManageId(id)}
            interactable
          />
        )}
      </div>

      <AnimatePresence>
        {shopSlot && (
          <ShopModal
            slot={shopSlot}
            points={user?.points ?? 0}
            onClose={() => setShopSlot(null)}
            onBuy={handleBuy}
          />
        )}
        {manageShowcase && (
          <ManageModal
            showcase={manageShowcase}
            onClose={() => setManageId(null)}
            onPickSlot={(slotIndex) =>
              setPickTarget({ showcaseId: manageShowcase.id, slotIndex })
            }
            onUndisplay={(slotIndex) =>
              handleUndisplay(manageShowcase.id, slotIndex)
            }
            onRemove={handleRemoveShowcase}
            onBulkDisplay={() => handleBulkDisplay(manageShowcase.id)}
          />
        )}
        {pickTarget && (
          <GradingPickModal
            // Belt-and-suspenders filter: the RPC already excludes
            // displayed gradings, but if stale client state slips any
            // through, drop them here too by cross-referencing the
            // current showcase snapshot.
            gradings={availableGradings.filter(
              (g) =>
                !showcases.some((s) =>
                  s.cards.some((c) => c.grading_id === g.id)
                )
            )}
            onClose={() => setPickTarget(null)}
            onPick={handlePickGrading}
          />
        )}
        {logOpen && (
          <SabotageLogModal
            logs={logs}
            loading={logsLoading}
            onClose={() => setLogOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─────────────── reusable pieces (also used by the visit view) ─────────────── */

export function CenterBackdrop() {
  return (
    <>
      <div
        aria-hidden
        className="fixed inset-0 -z-10 bg-cover bg-center"
        style={{
          backgroundImage: "url(/images/common/center-bg.jpg)",
        }}
      />
      <div
        aria-hidden
        className="fixed inset-0 -z-10"
        style={{
          background:
            "linear-gradient(180deg, rgba(10,8,20,0.65) 0%, rgba(8,6,18,0.88) 100%)",
        }}
      />
    </>
  );
}

export function CenterGrid({
  byCell,
  onEmpty,
  onFilled,
  interactable,
}: {
  byCell: Map<string, CenterShowcase>;
  onEmpty?: (x: number, y: number) => void;
  onFilled?: (id: string) => void;
  interactable: boolean;
}) {
  const cells: { x: number; y: number }[] = [];
  for (let y = 0; y < CENTER_GRID_ROWS; y++) {
    for (let x = 0; x < CENTER_GRID_COLS; x++) cells.push({ x, y });
  }
  return (
    <div
      className="mt-5 grid gap-2.5 md:gap-3"
      style={{
        gridTemplateColumns: `repeat(${CENTER_GRID_COLS}, minmax(0,1fr))`,
      }}
    >
      {cells.map(({ x, y }) => {
        const sc = byCell.get(`${x}:${y}`);
        if (!sc) {
          return (
            <button
              key={`${x}:${y}`}
              type="button"
              disabled={!interactable || !onEmpty}
              onClick={() => onEmpty?.(x, y)}
              className={clsx(
                "aspect-[3/4] rounded-xl border-2 border-dashed border-white/15 bg-white/[0.02] text-zinc-500 flex flex-col items-center justify-center gap-1 transition",
                interactable && onEmpty && "hover:border-white/30 hover:bg-white/5 active:scale-[0.98]"
              )}
              style={{ touchAction: "manipulation" }}
            >
              <span className="text-lg opacity-60">＋</span>
              <span className="text-[9px] font-semibold uppercase tracking-wider">
                빈 자리
              </span>
            </button>
          );
        }
        return (
          <ShowcaseCell
            key={sc.id}
            showcase={sc}
            onClick={interactable && onFilled ? () => onFilled(sc.id) : undefined}
          />
        );
      })}
    </div>
  );
}

function ShowcaseCell({
  showcase,
  onClick,
}: {
  showcase: CenterShowcase;
  onClick?: () => void;
}) {
  const spec = SHOWCASES[showcase.showcase_type];
  const filled = showcase.cards.length;
  const isVault = showcase.showcase_type === "vault";
  const isButton = Boolean(onClick);
  const Root: "button" | "div" = isButton ? "button" : "div";
  const previewCards = isVault ? showcase.cards.slice(0, 4) : showcase.cards;
  return (
    <Root
      {...(isButton ? { type: "button" as const, onClick } : {})}
      className={clsx(
        "relative aspect-[3/4] rounded-xl overflow-hidden ring-1 text-left transition",
        "bg-gradient-to-b",
        spec.body,
        spec.accent,
        isButton && "hover:scale-[1.03] active:scale-[0.98]"
      )}
      style={{ touchAction: "manipulation" }}
    >
      <div className="absolute top-0 inset-x-0 px-1.5 py-1 bg-black/50 backdrop-blur-sm flex items-center justify-between gap-1">
        <span className="text-[8px] md:text-[9px] font-bold uppercase tracking-[0.12em] text-white/90 truncate">
          {spec.icon} {spec.name}
        </span>
        <span className="text-[8px] text-white/70 tabular-nums shrink-0">
          {filled}/{spec.capacity}
        </span>
      </div>
      {isVault ? (
        <div className="absolute inset-x-1 bottom-1 top-5 flex flex-col items-center justify-center gap-1">
          <div className="grid grid-cols-2 gap-[2px] w-[78%]">
            {Array.from({ length: 4 }).map((_, i) => {
              const cardRow = previewCards[i];
              const card = cardRow ? getCard(cardRow.card_id) : null;
              return (
                <div
                  key={i}
                  className={clsx(
                    "relative aspect-[5/7] rounded-sm overflow-hidden",
                    card
                      ? "bg-zinc-950 ring-1 ring-white/20"
                      : "bg-black/40 ring-1 ring-white/10"
                  )}
                >
                  {card?.imageUrl && (
                    <img
                      src={card.imageUrl}
                      alt=""
                      draggable={false}
                      loading="lazy"
                      className="w-full h-full object-contain pointer-events-none"
                    />
                  )}
                </div>
              );
            })}
          </div>
          <span className="px-1.5 py-0.5 rounded-full bg-emerald-400 text-emerald-950 text-[9px] font-black tabular-nums">
            {filled}장 전시 중
          </span>
        </div>
      ) : (
        <div className="absolute inset-x-1 bottom-1 top-5 flex items-center justify-center gap-[2px]">
          {Array.from({ length: spec.capacity }).map((_, i) => {
            const cardRow = showcase.cards.find((c) => c.slot_index === i);
            const card = cardRow ? getCard(cardRow.card_id) : null;
            return (
              <div
                key={i}
                className={clsx(
                  "relative flex-1 h-full rounded-sm overflow-hidden",
                  card
                    ? "bg-zinc-950 ring-1 ring-white/20"
                    : "bg-black/35 ring-1 ring-white/10"
                )}
              >
                {card?.imageUrl ? (
                  <img
                    src={card.imageUrl}
                    alt=""
                    draggable={false}
                    loading="lazy"
                    className="w-full h-full object-contain pointer-events-none"
                  />
                ) : null}
                {cardRow && (
                  <span
                    className={clsx(
                      "absolute top-0 right-0 px-[3px] text-[8px] font-black tabular-nums leading-tight",
                      cardRow.grade === 10
                        ? "bg-amber-400 text-zinc-950"
                        : "bg-slate-200 text-zinc-900"
                    )}
                  >
                    {cardRow.grade}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Root>
  );
}

function ShopModal({
  slot,
  points,
  onClose,
  onBuy,
}: {
  slot: { x: number; y: number };
  points: number;
  onClose: () => void;
  onBuy: (type: ShowcaseType) => void;
}) {
  return (
    <ModalShell title="보관함 상점" subtitle={`자리 (${slot.x + 1}, ${slot.y + 1})`} onClose={onClose}>
      <div className="p-3 md:p-4 space-y-2">
        {SHOWCASE_ORDER.map((t) => {
          const s = SHOWCASES[t];
          const afford = points >= s.price;
          return (
            <button
              key={t}
              type="button"
              disabled={!afford}
              onClick={() => onBuy(t)}
              style={{ touchAction: "manipulation" }}
              className={clsx(
                "w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition",
                afford
                  ? "bg-white/5 border-white/15 hover:bg-white/10 active:scale-[0.98]"
                  : "bg-white/5 border-white/10 opacity-50 cursor-not-allowed"
              )}
            >
              <span className="text-2xl shrink-0">{s.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">{s.name}</p>
                <p className="text-[11px] text-zinc-300/90 mt-0.5">
                  {s.capacity}칸 · 방어 {s.defense}%
                </p>
                <p className="text-[11px] text-zinc-400 mt-0.5 truncate">
                  {s.blurb}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-black text-amber-300 tabular-nums inline-flex items-center gap-1">
                  <CoinIcon size="xs" />
                  {s.price.toLocaleString("ko-KR")}
                </p>
                <p className="text-[10px] text-zinc-500">
                  {afford ? "구매" : "포인트 부족"}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </ModalShell>
  );
}

function ManageModal({
  showcase,
  onClose,
  onPickSlot,
  onUndisplay,
  onRemove,
  onBulkDisplay,
}: {
  showcase: CenterShowcase;
  onClose: () => void;
  onPickSlot: (slotIndex: number) => void;
  onUndisplay: (slotIndex: number) => void;
  onRemove: () => void;
  onBulkDisplay: () => void;
}) {
  const spec = SHOWCASES[showcase.showcase_type];
  const isVault = showcase.showcase_type === "vault";
  const filled = showcase.cards.length;
  const remaining = Math.max(0, spec.capacity - filled);
  const sortedCards = useMemo(
    () => showcase.cards.slice().sort((a, b) => a.slot_index - b.slot_index),
    [showcase.cards]
  );
  return (
    <ModalShell
      title={`${spec.icon} ${spec.name}`}
      subtitle={`${filled}/${spec.capacity}칸 전시 중`}
      onClose={onClose}
    >
      <div className="p-3 md:p-5 space-y-3">
        {isVault ? (
          <>
            <button
              type="button"
              onClick={onBulkDisplay}
              disabled={remaining === 0}
              style={{ touchAction: "manipulation" }}
              className={clsx(
                "w-full h-12 rounded-xl font-black text-sm transition inline-flex items-center justify-center gap-2",
                remaining === 0
                  ? "bg-white/5 border border-white/10 text-zinc-500 cursor-not-allowed"
                  : "bg-gradient-to-r from-emerald-400 to-sky-500 text-zinc-950 hover:scale-[1.01] active:scale-[0.98] shadow-[0_10px_30px_-10px_rgba(52,211,153,0.7)]"
              )}
            >
              📦 일괄 전시 ({remaining}칸 비어있음)
            </button>
            <p className="text-[11px] text-zinc-400 text-center">
              보유한 PCL 9·10 슬랩이 빈 칸을 채울 때까지 자동으로 박제돼요.
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {sortedCards.map((row) => {
                const card = getCard(row.card_id);
                if (!card) return null;
                return (
                  <div
                    key={row.slot_index}
                    className="flex flex-col items-center gap-1"
                  >
                    <PsaSlab card={card} grade={row.grade} size="sm" />
                    <button
                      type="button"
                      onClick={() => onUndisplay(row.slot_index)}
                      className="w-full h-7 rounded-md bg-white/10 hover:bg-white/15 text-[10px] text-white font-semibold"
                    >
                      꺼내기
                    </button>
                  </div>
                );
              })}
              {filled === 0 && (
                <p className="col-span-full py-8 text-center text-sm text-zinc-400">
                  아직 전시된 슬랩이 없어요.
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="flex justify-center">
            {Array.from({ length: spec.capacity }).map((_, i) => {
              const row = showcase.cards.find((c) => c.slot_index === i);
              const card = row ? getCard(row.card_id) : null;
              return (
                <div
                  key={i}
                  className="flex flex-col items-center gap-2 w-full max-w-[320px]"
                >
                  {card && row ? (
                    <>
                      <PsaSlab card={card} grade={row.grade} size="lg" />
                      <button
                        type="button"
                        onClick={() => onUndisplay(i)}
                        className="w-full h-10 rounded-md bg-white/10 hover:bg-white/15 text-sm text-white font-semibold"
                      >
                        꺼내기
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onPickSlot(i)}
                      className="w-full aspect-[5/7] rounded-lg border-2 border-dashed border-white/20 bg-white/5 text-zinc-400 hover:text-white hover:border-white/40 transition flex flex-col items-center justify-center gap-2"
                      style={{ touchAction: "manipulation" }}
                    >
                      <span className="text-4xl opacity-70">＋</span>
                      <span className="text-sm font-semibold">슬랩 전시</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <button
          type="button"
          onClick={onRemove}
          className="w-full h-10 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs font-semibold hover:bg-rose-500/20"
        >
          이 보관함 치우기 (환불 없음)
        </button>
      </div>
    </ModalShell>
  );
}

function GradingPickModal({
  gradings,
  onClose,
  onPick,
}: {
  gradings: PsaGrading[];
  onClose: () => void;
  onPick: (grading: PsaGrading) => void;
}) {
  const items = useMemo(
    () => gradings.slice().sort((a, b) => b.grade - a.grade),
    [gradings]
  );
  return (
    <ModalShell
      title="전시할 PCL 슬랩 선택"
      subtitle="PCL 9·10 슬랩만 전시 가능 · 전시 중엔 지갑에서 숨겨져요"
      onClose={onClose}
    >
      <div className="p-3 md:p-4">
        {items.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-400">
            전시할 PCL 9 / 10 슬랩이 없어요.
            <br />
            감별 페이지에서 등급 9 또는 10을 받아보세요.
          </p>
        ) : (
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
            }}
          >
            {items.map((g) => {
              const card = getCard(g.card_id);
              if (!card) return null;
              const tone = psaTone(g.grade);
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => onPick(g)}
                  className="relative flex flex-col items-center gap-1 p-1 rounded-lg hover:bg-white/5 active:scale-[0.97] transition"
                  style={{ touchAction: "manipulation" }}
                >
                  <PsaSlab card={card} grade={g.grade} size="sm" />
                  <span
                    className={clsx(
                      "text-[10px] font-bold tabular-nums",
                      tone.text
                    )}
                  >
                    PCL {g.grade} · 시간당{" "}
                    {g.grade === 10 ? "5,000" : "3,000"}p
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </ModalShell>
  );
}

export function ModalShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Portal>
      <motion.div
        className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm flex items-center justify-center overflow-hidden"
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
          className="relative w-full max-w-md bg-zinc-900 border border-white/20 rounded-2xl flex flex-col overflow-hidden shadow-2xl"
          style={{ maxHeight: "calc(100dvh - 24px)" }}
          initial={{ scale: 0.94, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.94, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-white/15 bg-zinc-900/95 shrink-0">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white truncate">{title}</h3>
              {subtitle && (
                <p className="text-[11px] text-zinc-300 truncate">{subtitle}</p>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="닫기"
              className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center"
              style={{ touchAction: "manipulation" }}
            >
              ✕
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto bg-zinc-900">{children}</div>
        </motion.div>
      </motion.div>
    </Portal>
  );
}

function SabotageLogModal({
  logs,
  loading,
  onClose,
}: {
  logs: SabotageLog[];
  loading: boolean;
  onClose: () => void;
}) {
  const relTime = (iso: string) => {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "방금";
    if (mins < 60) return `${mins}분 전`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}시간 전`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}일 전`;
    return d.toLocaleDateString("ko-KR");
  };
  const successCount = logs.filter((l) => l.success).length;
  return (
    <ModalShell
      title="📜 방문 기록"
      subtitle={`총 ${logs.length}회 시도 · 성공 ${successCount}회`}
      onClose={onClose}
    >
      <div className="p-3 md:p-4">
        {loading ? (
          <div className="py-10 flex justify-center">
            <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <p className="py-10 text-center text-sm text-zinc-400">
            아직 내 센터에 부수기를 시도한 사람이 없어요.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {logs.map((l) => {
              const card = l.card_id ? getCard(l.card_id) : null;
              return (
                <li
                  key={l.id}
                  className={clsx(
                    "flex items-center gap-3 rounded-lg border px-3 py-2",
                    l.success
                      ? "bg-rose-500/10 border-rose-500/40"
                      : "bg-white/5 border-white/10"
                  )}
                >
                  <span
                    className={clsx(
                      "shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full text-lg",
                      l.success
                        ? "bg-rose-500/20 text-rose-200"
                        : "bg-slate-500/20 text-slate-200"
                    )}
                  >
                    {l.success ? "💥" : "🛡️"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">
                      {l.attacker_name}{" "}
                      <span
                        className={clsx(
                          "ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded",
                          l.success
                            ? "bg-rose-500 text-white"
                            : "bg-white/10 text-zinc-300"
                        )}
                      >
                        {l.success ? "성공" : "실패"}
                      </span>
                    </p>
                    <p className="text-[11px] text-zinc-400 truncate">
                      {card
                        ? `${card.name} · ${card.rarity}${l.grade ? ` · PCL ${l.grade}` : ""}`
                        : "알 수 없는 카드"}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] text-zinc-500 tabular-nums">
                    {relTime(l.created_at)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </ModalShell>
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
        "rounded-lg border px-2.5 py-1",
        highlight
          ? "bg-amber-400/10 border-amber-400/40"
          : "bg-white/10 border-white/15 backdrop-blur"
      )}
    >
      <div className="text-[9px] uppercase tracking-wider text-white/70">
        {label}
      </div>
      <div
        className={clsx(
          "text-xs font-bold tabular-nums",
          highlight ? "text-amber-200" : "text-white"
        )}
      >
        {value}
      </div>
    </div>
  );
}
