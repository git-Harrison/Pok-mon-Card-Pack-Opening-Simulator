"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/lib/auth";
import {
  fetchCenterByLogin,
  sabotageCard,
  type CenterShowcase,
  type VisitCenter,
} from "@/lib/db";
import { notifySabotage } from "@/lib/discord";
import { SHOWCASES } from "@/lib/center";
import { getCard } from "@/lib/sets";
import { RARITY_STYLE } from "@/lib/rarity";
import PointsChip from "./PointsChip";
import CoinIcon from "./CoinIcon";
import PsaSlab from "./PsaSlab";
import { CenterBackdrop, CenterGrid, ModalShell } from "./CenterView";

const SABOTAGE_COST = 100_000;

export default function VisitCenterView({ loginId }: { loginId: string }) {
  const { user, setPoints } = useAuth();
  const [data, setData] = useState<VisitCenter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [sabotage, setSabotage] = useState<{
    showcaseId: string;
    slotIndex: number;
    cardId: string;
  } | null>(null);
  const [result, setResult] = useState<{
    success: boolean;
    cardId: string;
    cardsDestroyed: number;
  } | null>(null);
  const [sabotaging, setSabotaging] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await fetchCenterByLogin(loginId);
    setData(res);
    setLoading(false);
  }, [loginId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const showcases = data?.showcases ?? [];
  const byCell = useMemo(() => {
    const m = new Map<string, CenterShowcase>();
    for (const s of showcases) m.set(`${s.slot_x}:${s.slot_y}`, s);
    return m;
  }, [showcases]);

  const viewingShowcase = viewing
    ? showcases.find((s) => s.id === viewing) ?? null
    : null;

  const runSabotage = useCallback(async () => {
    if (!user || !sabotage || !data?.display_name) return;
    setSabotaging(true);
    setError(null);
    const res = await sabotageCard(
      user.id,
      sabotage.showcaseId,
      sabotage.slotIndex
    );
    setSabotaging(false);
    if (!res.ok) {
      setError(res.error ?? "부수기 실패");
      return;
    }
    if (typeof res.points === "number") setPoints(res.points);
    const success = !!res.success;
    setResult({
      success,
      cardId: sabotage.cardId,
      cardsDestroyed: res.cards_destroyed ?? 0,
    });
    // Fire-and-forget Discord alert
    notifySabotage(
      user.display_name,
      data.display_name,
      sabotage.cardId,
      success
    );
    setSabotage(null);
    if (success) setViewing(null);
    await refresh();
  }, [user, sabotage, data?.display_name, setPoints, refresh]);

  if (loading) {
    return (
      <div className="relative min-h-[calc(100dvh-4rem)]">
        <CenterBackdrop />
        <div className="relative z-10 max-w-3xl mx-auto px-4 py-12 flex justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
        </div>
      </div>
    );
  }

  if (!data?.ok) {
    return (
      <div className="relative min-h-[calc(100dvh-4rem)]">
        <CenterBackdrop />
        <div className="relative z-10 max-w-3xl mx-auto px-4 py-12 text-center">
          <p className="text-lg text-white font-bold">
            {data?.error ?? "센터를 찾을 수 없어요."}
          </p>
          <Link
            href="/center"
            className="mt-4 inline-block px-4 py-2 rounded-lg bg-white/10 text-white text-sm font-semibold hover:bg-white/15"
          >
            내 센터로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  const isOwn = user?.id === data.owner_id;
  const totalCards = showcases.reduce((s, sc) => s + sc.cards.length, 0);

  return (
    <div className="relative min-h-[calc(100dvh-4rem)]">
      <CenterBackdrop />
      <div className="relative z-10 max-w-3xl mx-auto px-4 md:px-6 py-5 md:py-8 fade-in">
        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <Link
              href="/center"
              className="text-[11px] text-zinc-300/80 hover:text-white"
            >
              ← 내 센터
            </Link>
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight mt-1">
              {data.display_name}님의 포켓몬센터
            </h1>
            <p className="text-[11px] md:text-xs text-zinc-300/80 mt-1">
              {isOwn
                ? "여기는 당신의 센터예요. 자기 센터는 부술 수 없어요."
                : "전시된 카드를 눌러 부수기를 시도할 수 있어요 (10만p · 30%)."}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {user && <PointsChip points={user.points} size="sm" />}
            <Kpi label="보관함" value={`${showcases.length}`} />
            <Kpi label="박제" value={`${totalCards}장`} highlight />
          </div>
        </header>

        {error && (
          <div className="mt-3 text-xs text-rose-200 bg-rose-500/15 border border-rose-500/40 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {showcases.length === 0 ? (
          <p className="mt-16 text-center text-sm text-zinc-300">
            아직 전시된 보관함이 없어요.
          </p>
        ) : (
          <CenterGrid
            byCell={byCell}
            interactable
            onFilled={(id) => setViewing(id)}
          />
        )}
      </div>

      <AnimatePresence>
        {viewingShowcase && (
          <VisitShowcaseModal
            showcase={viewingShowcase}
            canSabotage={!isOwn && !!user}
            onClose={() => setViewing(null)}
            onAttack={(slotIndex, cardId) =>
              setSabotage({
                showcaseId: viewingShowcase.id,
                slotIndex,
                cardId,
              })
            }
          />
        )}
        {sabotage && (
          <SabotageConfirmModal
            cardId={sabotage.cardId}
            victim={data.display_name ?? ""}
            points={user?.points ?? 0}
            sabotaging={sabotaging}
            onCancel={() => setSabotage(null)}
            onConfirm={runSabotage}
          />
        )}
        {result && (
          <SabotageResultModal
            result={result}
            victim={data.display_name ?? ""}
            onClose={() => setResult(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function VisitShowcaseModal({
  showcase,
  canSabotage,
  onClose,
  onAttack,
}: {
  showcase: CenterShowcase;
  canSabotage: boolean;
  onClose: () => void;
  onAttack: (slotIndex: number, cardId: string) => void;
}) {
  const spec = SHOWCASES[showcase.showcase_type];
  return (
    <ModalShell
      title={`${spec.icon} ${spec.name}`}
      subtitle={
        canSabotage
          ? "부수고 싶은 카드를 선택해 주세요 (10만p)"
          : "전시된 카드들"
      }
      onClose={onClose}
    >
      <div className="p-3 md:p-4">
        <div
          className={clsx(
            "grid gap-2",
            spec.capacity <= 2
              ? "grid-cols-2"
              : spec.capacity <= 4
              ? "grid-cols-2"
              : "grid-cols-3"
          )}
        >
          {Array.from({ length: spec.capacity }).map((_, i) => {
            const row = showcase.cards.find((c) => c.slot_index === i);
            const card = row ? getCard(row.card_id) : null;
            if (!card || !row) {
              return (
                <div
                  key={i}
                  className="aspect-[5/7] rounded-lg border-2 border-dashed border-white/15 bg-white/[0.02]"
                />
              );
            }
            const clickable = canSabotage;
            return (
              <button
                key={i}
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onAttack(i, row.card_id)}
                style={{ touchAction: "manipulation" }}
                className={clsx(
                  "relative flex flex-col items-center gap-1 text-left rounded-lg transition",
                  clickable && "hover:scale-[1.03] active:scale-[0.98]"
                )}
              >
                <PsaSlab card={card} grade={row.grade} size="sm" />
                {clickable && (
                  <span className="text-[9px] font-bold text-rose-300">
                    💥 부수기 가능
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </ModalShell>
  );
}

function SabotageConfirmModal({
  cardId,
  victim,
  points,
  sabotaging,
  onCancel,
  onConfirm,
}: {
  cardId: string;
  victim: string;
  points: number;
  sabotaging: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const card = getCard(cardId);
  const afford = points >= SABOTAGE_COST;
  return (
    <ModalShell title="💥 카드 부수기" subtitle="성공률 30%, 실패해도 10만p 소진" onClose={onCancel}>
      <div className="p-4 space-y-3">
        {card && (
          <div className="flex items-center gap-3">
            <div
              className={clsx(
                "relative w-16 aspect-[5/7] rounded-md overflow-hidden ring-2 bg-zinc-900 shrink-0",
                RARITY_STYLE[card.rarity].frame
              )}
            >
              {card.imageUrl && (
                <img
                  src={card.imageUrl}
                  alt=""
                  className="w-full h-full object-contain"
                  draggable={false}
                />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">
                {card.name}
              </p>
              <p className="text-[11px] text-zinc-400">
                {card.rarity} · {victim}님 소장
              </p>
            </div>
          </div>
        )}

        <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 px-3 py-2 text-[11px] text-rose-200 leading-relaxed">
          성공하면 <b>보관함과 그 안의 카드가 전부 소멸</b>해요. 실패해도 10만p는
          돌아오지 않습니다. 부수기 시도는 디스코드에 자동 공지됩니다.
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={sabotaging}
            className="flex-1 h-11 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-semibold"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!afford || sabotaging}
            style={{ touchAction: "manipulation" }}
            className={clsx(
              "flex-1 h-11 rounded-xl font-black text-sm inline-flex items-center justify-center gap-1.5",
              afford && !sabotaging
                ? "bg-gradient-to-r from-rose-500 to-amber-500 text-zinc-950 hover:scale-[1.02] active:scale-[0.98]"
                : "bg-white/5 text-zinc-500 cursor-not-allowed"
            )}
          >
            {sabotaging ? (
              "시도 중..."
            ) : (
              <>
                <CoinIcon size="xs" />
                {SABOTAGE_COST.toLocaleString("ko-KR")}p · 부수기
              </>
            )}
          </button>
        </div>
        {!afford && (
          <p className="text-[11px] text-rose-300 text-center">
            포인트가 부족해요.
          </p>
        )}
      </div>
    </ModalShell>
  );
}

function SabotageResultModal({
  result,
  victim,
  onClose,
}: {
  result: { success: boolean; cardId: string; cardsDestroyed: number };
  victim: string;
  onClose: () => void;
}) {
  const card = getCard(result.cardId);
  return (
    <ModalShell
      title={result.success ? "💥 부수기 성공!" : "🛡️ 부수기 실패"}
      subtitle={
        result.success
          ? `${victim}님의 ${card?.rarity ?? ""} 카드를 산산조각냈습니다`
          : "공격이 튕겨나갔어요"
      }
      onClose={onClose}
    >
      <div className="p-4 space-y-3">
        {card && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 18 }}
            className={clsx(
              "mx-auto w-32 aspect-[5/7] rounded-lg overflow-hidden ring-2 bg-zinc-900",
              RARITY_STYLE[card.rarity].frame,
              result.success && "grayscale opacity-40"
            )}
          >
            {card.imageUrl && (
              <img
                src={card.imageUrl}
                alt=""
                className="w-full h-full object-contain"
                draggable={false}
              />
            )}
          </motion.div>
        )}
        <p className="text-center text-xs text-zinc-300">
          {result.success ? (
            <>
              <b className="text-rose-300">{result.cardsDestroyed}장</b>의 박제
              카드가 영원히 사라졌습니다.
            </>
          ) : (
            "이번엔 놓쳤어요. 다음엔 꼭…"
          )}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="w-full h-10 rounded-lg bg-white/10 hover:bg-white/15 text-sm text-white font-semibold"
        >
          확인
        </button>
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
