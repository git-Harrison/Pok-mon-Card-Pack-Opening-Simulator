"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/lib/auth";
import {
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
  SABOTAGE_BASE_RATE,
  SHOWCASES,
  SHOWCASE_ORDER,
  type ShowcaseType,
} from "@/lib/center";
import { getCard } from "@/lib/sets";
import { RARITY_STYLE } from "@/lib/rarity";
import { psaTone } from "@/lib/psa";
import PointsChip from "./PointsChip";
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
  const [claimNotice, setClaimNotice] = useState<string | null>(null);
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
  const [infoOpen, setInfoOpen] = useState(false);

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

  // Claim any pending passive income on mount.
  useEffect(() => {
    (async () => {
      if (!user) return;
      const res = await claimShowcaseIncome(user.id);
      if (res.ok && res.earned && res.earned > 0) {
        setClaimNotice(
          `전시 수익 +${res.earned.toLocaleString("ko-KR")}p`
        );
        if (typeof res.points === "number") setPoints(res.points);
        setTimeout(() => setClaimNotice(null), 5000);
      }
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

  return (
    <div className="relative min-h-[calc(100dvh-4rem)]">
      <CenterBackdrop />
      <div className="relative z-10 max-w-3xl mx-auto px-4 md:px-6 py-5 md:py-8 fade-in">
        <PageHeader
          title="내 포켓몬센터"
          subtitle="PCL 슬랩을 전시해 수익을 얻고 랭킹을 올리세요"
          stats={
            <>
              {user && <PointsChip points={user.points} size="sm" />}
              <Kpi label="보관함" value={`${showcases.length}`} />
              <Kpi label="전시" value={`${totalCards}`} highlight />
            </>
          }
        />

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
          <button
            onClick={() => setInfoOpen(true)}
            className="h-9 px-3 rounded-full bg-white/10 hover:bg-white/15 text-white font-bold text-xs border border-white/15 transition inline-flex items-center gap-1.5"
          >
            ℹ️ 정보
          </button>
          <p className="text-[11px] text-zinc-400">
            친구가 링크를 누르면 내 센터를 구경하고, 보관함 등급별 비용으로{" "}
            <b className="text-rose-300">부수기(최대 30%)</b>를 시도할 수
            있어요.
          </p>
        </div>

        {claimNotice && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-400/15 border border-amber-400/40 text-amber-200 text-xs font-bold px-3 py-1.5">
            <CoinIcon size="xs" />
            {claimNotice}
          </div>
        )}

        {error && (
          <div className="mt-3 text-xs text-rose-200 bg-rose-500/15 border border-rose-500/40 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {loading ? (
          <div className="mt-12 flex justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
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
        {infoOpen && <InfoModal onClose={() => setInfoOpen(false)} />}
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
  const isButton = Boolean(onClick);
  const Root: "button" | "div" = isButton ? "button" : "div";
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
      {/* Case name banner */}
      <div className="absolute top-0 inset-x-0 px-1.5 py-1 bg-black/50 backdrop-blur-sm flex items-center justify-between gap-1">
        <span className="text-[8px] md:text-[9px] font-bold uppercase tracking-[0.12em] text-white/90 truncate">
          {spec.icon} {spec.name}
        </span>
        <span className="text-[8px] text-white/70 tabular-nums shrink-0">
          {filled}/{spec.capacity}
        </span>
      </div>
      {/* Card mini-thumbnails */}
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
}: {
  showcase: CenterShowcase;
  onClose: () => void;
  onPickSlot: (slotIndex: number) => void;
  onUndisplay: (slotIndex: number) => void;
  onRemove: () => void;
}) {
  const spec = SHOWCASES[showcase.showcase_type];
  return (
    <ModalShell
      title={`${spec.icon} ${spec.name}`}
      subtitle={`${showcase.cards.length}/${spec.capacity}칸 전시 중`}
      onClose={onClose}
    >
      <div className="p-3 md:p-5 space-y-3">
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

type InfoTab = "storage" | "income" | "sabotage" | "rank";

const INFO_TABS: { key: InfoTab; label: string; icon: string }[] = [
  { key: "storage", label: "보관함", icon: "🗄️" },
  { key: "income", label: "전시·수익", icon: "💰" },
  { key: "sabotage", label: "부수기", icon: "💥" },
  { key: "rank", label: "랭킹", icon: "🏆" },
];

// Numbers here mirror supabase/migrations/20260428_showcase_income_by_rarity.sql
// — the server is authoritative; this table is a read-only reference.
const RARITY_BASE: { key: string; hourly: number }[] = [
  { key: "SR", hourly: 1_000 },
  { key: "MA", hourly: 1_500 },
  { key: "SAR", hourly: 3_000 },
  { key: "UR", hourly: 5_000 },
  { key: "MUR", hourly: 7_000 },
];
const GRADE_BONUS: { grade: 9 | 10; bonus: number }[] = [
  { grade: 9, bonus: 2_000 },
  { grade: 10, bonus: 5_000 },
];

function InfoModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<InfoTab>("storage");
  return (
    <ModalShell
      title="ℹ️ 포켓몬센터 안내"
      subtitle="보관함 · 수익 · 부수기 · 랭킹"
      onClose={onClose}
    >
      <div className="sticky top-0 z-10 bg-zinc-900/95 backdrop-blur border-b border-white/10 px-2 pt-2">
        <div className="grid grid-cols-4 gap-1">
          {INFO_TABS.map((t) => {
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                style={{ touchAction: "manipulation" }}
                className={clsx(
                  "h-9 rounded-lg text-[11px] font-bold transition inline-flex items-center justify-center gap-1",
                  active
                    ? "bg-white/15 text-white ring-1 ring-white/25"
                    : "text-zinc-400 hover:text-white hover:bg-white/5"
                )}
              >
                <span>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
        <div className="h-2" />
      </div>
      <div className="p-3 md:p-4 space-y-3 text-zinc-200">
        {tab === "storage" && <InfoStorageTab />}
        {tab === "income" && <InfoIncomeTab />}
        {tab === "sabotage" && <InfoSabotageTab />}
        {tab === "rank" && <InfoRankTab />}
      </div>
    </ModalShell>
  );
}

function InfoSectionTitle({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <h4 className="text-xs font-bold text-white inline-flex items-center gap-1.5">
      <span>{icon}</span>
      <span>{children}</span>
    </h4>
  );
}

function InfoNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] leading-relaxed text-zinc-400">{children}</p>
  );
}

function InfoStorageTab() {
  return (
    <>
      <InfoSectionTitle icon="🗄️">4단계 보관함 (모두 1칸)</InfoSectionTitle>
      <div className="rounded-xl border border-white/10 overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-0 text-[11px]">
          <div className="contents text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
            <div className="px-3 py-1.5 bg-white/[0.03]">보관함</div>
            <div className="px-3 py-1.5 bg-white/[0.03] text-right">가격</div>
            <div className="px-3 py-1.5 bg-white/[0.03] text-right">방어</div>
          </div>
          {SHOWCASE_ORDER.map((t, i) => {
            const s = SHOWCASES[t];
            return (
              <div
                key={t}
                className={clsx(
                  "contents",
                  i % 2 === 0 ? "" : "[&>div]:bg-white/[0.02]"
                )}
              >
                <div className="px-3 py-2 flex items-center gap-2 border-t border-white/5">
                  <span className="text-base">{s.icon}</span>
                  <span className="text-white font-semibold">{s.name}</span>
                </div>
                <div className="px-3 py-2 text-right tabular-nums text-amber-200 font-bold border-t border-white/5">
                  {s.price.toLocaleString("ko-KR")}p
                </div>
                <div className="px-3 py-2 text-right tabular-nums text-sky-200 font-bold border-t border-white/5">
                  {s.defense}%
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <InfoNote>
        모든 보관함은 슬랩 <b className="text-white">1칸</b>짜리예요. 등급이
        올라갈수록 <b className="text-sky-200">방어율</b>이 높아 부수기에 강해져요.
      </InfoNote>
    </>
  );
}

function InfoIncomeTab() {
  return (
    <>
      <InfoSectionTitle icon="💰">시간당 수익 공식</InfoSectionTitle>
      <div className="rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-[11px] leading-relaxed">
        <p className="text-zinc-300">
          <b className="text-white">시간당 수익 = 희귀도 기본값 + PCL 보너스</b>
        </p>
        <p className="text-zinc-400 mt-1">
          PCL 9·10 슬랩만 전시 가능하며, 접속하지 않아도 자동 누적돼요.
        </p>
      </div>

      <InfoSectionTitle icon="🎴">희귀도 기본값</InfoSectionTitle>
      <div className="grid grid-cols-2 gap-1.5">
        {RARITY_BASE.map((r) => (
          <div
            key={r.key}
            className="flex items-center justify-between rounded-md bg-white/[0.04] border border-white/10 px-2.5 py-1.5"
          >
            <span className="text-[11px] font-bold text-white">{r.key}</span>
            <span className="text-[11px] tabular-nums text-amber-200 font-semibold">
              {r.hourly.toLocaleString("ko-KR")}p
            </span>
          </div>
        ))}
      </div>

      <InfoSectionTitle icon="✨">PCL 보너스</InfoSectionTitle>
      <div className="grid grid-cols-2 gap-1.5">
        {GRADE_BONUS.map((g) => (
          <div
            key={g.grade}
            className={clsx(
              "flex items-center justify-between rounded-md border px-2.5 py-1.5",
              g.grade === 10
                ? "bg-amber-400/10 border-amber-400/40"
                : "bg-slate-300/10 border-slate-300/30"
            )}
          >
            <span
              className={clsx(
                "text-[11px] font-bold",
                g.grade === 10 ? "text-amber-200" : "text-slate-100"
              )}
            >
              PCL {g.grade}
            </span>
            <span className="text-[11px] tabular-nums text-amber-200 font-semibold">
              +{g.bonus.toLocaleString("ko-KR")}p
            </span>
          </div>
        ))}
      </div>

      <InfoSectionTitle icon="🧮">희귀도 × 등급 합산 수익 (시간당)</InfoSectionTitle>
      <div className="rounded-xl border border-white/10 overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto] text-[11px]">
          <div className="contents text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
            <div className="px-3 py-1.5 bg-white/[0.03]">희귀도</div>
            <div className="px-3 py-1.5 bg-white/[0.03] text-right">PCL 9</div>
            <div className="px-3 py-1.5 bg-white/[0.03] text-right">PCL 10</div>
          </div>
          {RARITY_BASE.map((r) => (
            <div key={r.key} className="contents">
              <div className="px-3 py-2 border-t border-white/5 text-white font-semibold">
                {r.key}
              </div>
              <div className="px-3 py-2 border-t border-white/5 text-right tabular-nums text-slate-100">
                {(r.hourly + 2_000).toLocaleString("ko-KR")}p
              </div>
              <div className="px-3 py-2 border-t border-white/5 text-right tabular-nums text-amber-200 font-bold">
                {(r.hourly + 5_000).toLocaleString("ko-KR")}p
              </div>
            </div>
          ))}
        </div>
      </div>
      <InfoNote>
        서버가 누적 시간을 계산해 자동 정산해요. 페이지 진입 시 대기 중인
        수익이 자동으로 지급됩니다.
      </InfoNote>
    </>
  );
}

function InfoSabotageTab() {
  return (
    <>
      <InfoSectionTitle icon="💥">부수기 규칙</InfoSectionTitle>
      <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 px-3 py-2 text-[11px] leading-relaxed text-rose-100">
        <p>
          <b>기본 성공률 {SABOTAGE_BASE_RATE}%</b>에서 보관함 방어율을 뺀 값이
          실제 확률이에요.
        </p>
        <p className="mt-1 text-rose-200/90">
          성공 → 보관함 + 슬랩 영구 소멸, 공격자는{" "}
          <b className="text-amber-200">보관함가의 80%</b>를 전리품으로 획득.
          <br />
          실패 → 지불한 비용은 돌아오지 않아요.
        </p>
      </div>

      <InfoSectionTitle icon="📊">보관함별 비용·성공률</InfoSectionTitle>
      <div className="rounded-xl border border-white/10 overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto_auto] text-[11px]">
          <div className="contents text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
            <div className="px-3 py-1.5 bg-white/[0.03]">보관함</div>
            <div className="px-3 py-1.5 bg-white/[0.03] text-right">비용</div>
            <div className="px-3 py-1.5 bg-white/[0.03] text-right">방어</div>
            <div className="px-3 py-1.5 bg-white/[0.03] text-right">성공률</div>
          </div>
          {SHOWCASE_ORDER.map((t) => {
            const s = SHOWCASES[t];
            const rate = Math.max(0, SABOTAGE_BASE_RATE - s.defense);
            return (
              <div key={t} className="contents">
                <div className="px-3 py-2 border-t border-white/5 flex items-center gap-2">
                  <span>{s.icon}</span>
                  <span className="text-white font-semibold">{s.name}</span>
                </div>
                <div className="px-3 py-2 border-t border-white/5 text-right tabular-nums text-rose-200 font-bold">
                  {s.sabotageCost.toLocaleString("ko-KR")}p
                </div>
                <div className="px-3 py-2 border-t border-white/5 text-right tabular-nums text-sky-200">
                  {s.defense}%
                </div>
                <div className="px-3 py-2 border-t border-white/5 text-right tabular-nums text-amber-200 font-bold">
                  {rate}%
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <InfoNote>
        공격 성공 시 <b className="text-amber-200">랭킹 +100점</b>, 피해자는 그
        슬랩으로 얻었던 PCL 랭킹 점수를 잃어요(감별 이력이 삭제됩니다).
      </InfoNote>
    </>
  );
}

function InfoRankTab() {
  const rows: { label: string; value: string; highlight?: boolean }[] = [
    { label: "PCL 6·7 감별 성공", value: "+100점" },
    { label: "PCL 8 감별 성공", value: "+150점" },
    { label: "PCL 9 감별 성공", value: "+350점" },
    { label: "PCL 10 감별 성공", value: "+500점", highlight: true },
    { label: "부수기 성공", value: "+100점" },
  ];
  return (
    <>
      <InfoSectionTitle icon="🏆">랭킹 점수 요약</InfoSectionTitle>
      <div className="rounded-xl border border-white/10 overflow-hidden divide-y divide-white/5">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center justify-between px-3 py-2 text-[11px]"
          >
            <span className="text-zinc-200">{r.label}</span>
            <span
              className={clsx(
                "tabular-nums font-bold",
                r.highlight ? "text-amber-200" : "text-white"
              )}
            >
              {r.value}
            </span>
          </div>
        ))}
      </div>
      <InfoNote>
        자세한 랭킹 로직은 <b className="text-white">/users</b> 페이지의 도움말
        토글에서 확인할 수 있어요.
      </InfoNote>
    </>
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
