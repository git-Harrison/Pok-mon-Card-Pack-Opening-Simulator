"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import type { Card, SetInfo } from "@/lib/types";
import { drawBox } from "@/lib/pack-draw";
import {
  buyBox,
  recordPackPull,
  recordPackPullsBatch,
  refundBoxPurchase,
  type BatchPullPack,
} from "@/lib/db";

// Postgres errcode for our own RAISE EXCEPTION (wallet cap, etc.).
// These are intentional server-side rejections — retrying is pointless
// and the user needs the real message, not a generic "저장 실패".
function isIntentionalRejection(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const r = e as { code?: string; message?: string };
  if (r.code === "P0001") return true;
  if (typeof r.message === "string" && r.message.includes("지갑 보유 한도"))
    return true;
  return false;
}

function errorMessage(e: unknown): string {
  if (!e) return "";
  if (typeof e === "string") return e;
  if (typeof e === "object" && e !== null) {
    const r = e as { message?: unknown };
    if (typeof r.message === "string") return r.message;
  }
  return "";
}

/**
 * recordPackPull with exponential backoff. Network blips or cold
 * Supabase connections shouldn't cost the user a box — retry a few
 * times before surfacing the failure. Intentional server rejections
 * (wallet cap, etc.) bypass the retry and are thrown immediately so
 * the user sees the actual reason.
 */
async function persistPackWithRetry(
  userId: string,
  setCode: SetInfo["code"],
  cardIds: string[],
  rarities: string[],
  autoSellSubAR: boolean,
  tries = 3
): Promise<{ sold_count: number; sold_earned: number; points: number }> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await recordPackPull(
        userId,
        setCode,
        cardIds,
        rarities,
        autoSellSubAR
      );
      return {
        sold_count: res.sold_count ?? 0,
        sold_earned: res.sold_earned ?? 0,
        points: res.points ?? 0,
      };
    } catch (e) {
      lastErr = e;
      if (isIntentionalRejection(e)) throw e;
      if (i < tries - 1) {
        await new Promise((r) => setTimeout(r, 500 * (i + 1)));
      }
    }
  }
  throw lastErr;
}

async function persistBatchWithRetry(
  userId: string,
  setCode: SetInfo["code"],
  pulls: BatchPullPack[],
  autoSellSubAR: boolean,
  tries = 3
): Promise<{
  total_sold_count: number;
  total_sold_earned: number;
  total_kept: number;
  points: number;
}> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await recordPackPullsBatch(
        userId,
        setCode,
        pulls,
        autoSellSubAR
      );
      return {
        total_sold_count: res.total_sold_count ?? 0,
        total_sold_earned: res.total_sold_earned ?? 0,
        total_kept: res.total_kept ?? 0,
        points: res.points ?? 0,
      };
    } catch (e) {
      lastErr = e;
      if (isIntentionalRejection(e)) throw e;
      if (i < tries - 1) {
        await new Promise((r) => setTimeout(r, 500 * (i + 1)));
      }
    }
  }
  throw lastErr;
}
import { useAuth } from "@/lib/auth";
import { BOX_COST, RARITY_STYLE } from "@/lib/rarity";
import PackOpeningStage from "./PackOpeningStage";
import RarityBadge from "./RarityBadge";
import CoinIcon from "./CoinIcon";
import HelpButton from "./HelpButton";

// Persist an in-progress box across navigations so that pressing the
// browser back button (e.g. from wallet → back to set) doesn't nuke
// the packs the user already paid for.
const BOX_STATE_TTL_MS = 24 * 60 * 60 * 1000;
interface BoxPersist {
  packs: Card[][];
  openedMask: boolean[];
  savedAt: number;
}
function boxKey(userId: string | undefined, setCode: string) {
  return userId ? `box-state:${userId}:${setCode}` : null;
}

type Phase =
  | "sealed"
  | "buying"
  | "opening"
  | "grid"
  | "opening-pack"
  | "bulk"
  | "bulk-result"
  | "multi-buying"
  | "multi-result";

// Bulk-purchase sizes offered by the "여러 박스 한번에" shortcut.
const MULTI_OPTIONS: number[] = [3, 5, 10];

export default function SetView({ set }: { set: SetInfo }) {
  const { user, setPoints } = useAuth();
  const [phase, setPhase] = useState<Phase>("sealed");
  const [packs, setPacks] = useState<Card[][]>([]);
  const [openedMask, setOpenedMask] = useState<boolean[]>([]);
  const [activePack, setActivePack] = useState<number | null>(null);
  const [bulkCards, setBulkCards] = useState<Card[]>([]);
  const [multiResult, setMultiResult] = useState<{
    boxCount: number;
    totalSpent: number;
    cards: Card[];
  } | null>(null);
  const [multiProgress, setMultiProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  // Separate channel for "wallet is full" so the UI can show a bigger
  // banner with a direct link to 일괄 판매 instead of a tiny tooltip.
  const [capError, setCapError] = useState<string | null>(null);
  const [autoSellSubAR, setAutoSellSubAR] = useState(false);
  const [autoSellEarned, setAutoSellEarned] = useState(0);
  // Guard so the initial restore doesn't write back over itself before
  // the user makes any change.
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = window.localStorage.getItem("box-auto-sell-sub-ar");
    if (v === "1") setAutoSellSubAR(true);
  }, []);

  const toggleAutoSell = useCallback((next: boolean) => {
    setAutoSellSubAR(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("box-auto-sell-sub-ar", next ? "1" : "0");
    }
  }, []);

  // Clear both channels on any new attempt.
  const clearErrors = useCallback(() => {
    setError(null);
    setCapError(null);
  }, []);

  const cost = BOX_COST[set.code] ?? 30_000;
  const canAfford = !!user && user.points >= cost;

  // Restore any in-progress box on mount.
  useEffect(() => {
    const key = boxKey(user?.id, set.code);
    if (!key || typeof window === "undefined") {
      hydratedRef.current = true;
      return;
    }
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as BoxPersist;
        const fresh = Date.now() - parsed.savedAt < BOX_STATE_TTL_MS;
        const complete = parsed.openedMask?.every(Boolean);
        if (
          fresh &&
          !complete &&
          Array.isArray(parsed.packs) &&
          parsed.packs.length > 0
        ) {
          setPacks(parsed.packs);
          setOpenedMask(parsed.openedMask);
          setPhase("grid");
        } else {
          window.localStorage.removeItem(key);
        }
      }
    } catch {
      // swallow — corrupt state should not block the UI
    }
    hydratedRef.current = true;
  }, [user?.id, set.code]);

  // Persist whenever the in-progress state changes.
  useEffect(() => {
    if (!hydratedRef.current) return;
    const key = boxKey(user?.id, set.code);
    if (!key || typeof window === "undefined") return;
    if (packs.length === 0) {
      window.localStorage.removeItem(key);
      return;
    }
    const payload: BoxPersist = {
      packs,
      openedMask,
      savedAt: Date.now(),
    };
    try {
      window.localStorage.setItem(key, JSON.stringify(payload));
    } catch {
      // storage full — nothing to do, next interaction will retry
    }
  }, [packs, openedMask, user?.id, set.code]);

  const openMulti = useCallback(
    async (boxCount: number) => {
      if (!user || phase !== "sealed") return;
      const totalCost = cost * boxCount;
      if (user.points < totalCost) {
        setError(
          `포인트가 부족해요. 필요 ${totalCost.toLocaleString("ko-KR")}p · 보유 ${user.points.toLocaleString("ko-KR")}p`
        );
        return;
      }
      clearErrors();
      setPhase("multi-buying");
      setMultiProgress({ done: 0, total: boxCount });
      setAutoSellEarned(0);

      const allCards: Card[] = [];
      let spent = 0;
      let earnedFromAutoSell = 0;

      // Buy + draw + persist each box sequentially so partial failure
      // surfaces cleanly and we don't overdraw on points.
      for (let i = 0; i < boxCount; i++) {
        const res = await buyBox(user.id, set.code);
        if (!res.ok || typeof res.points !== "number") {
          setError(res.error ?? "박스 구매 실패");
          setPhase("sealed");
          return;
        }
        setPoints(res.points);
        spent += res.price ?? cost;
        const drawn = drawBox(set);
        try {
          // Sequential: the server holds a per-user advisory lock, so
          // parallel calls would serialize anyway — better to send one
          // at a time than tie up 10 Supabase connections.
          for (const pack of drawn) {
            const r = await persistPackWithRetry(
              user.id,
              set.code,
              pack.map((c) => c.id),
              pack.map((c) => c.rarity),
              autoSellSubAR
            );
            earnedFromAutoSell += r.sold_earned;
            if (typeof r.points === "number" && r.points > 0) {
              setPoints(r.points);
            }
          }
        } catch (e) {
          console.error("multi-box persist failed", e);
          const serverMsg = errorMessage(e);
          const refund = await refundBoxPurchase(user.id, set.code);
          const refunded = refund.ok ? refund.refunded ?? cost : 0;
          if (refund.ok && typeof refund.points === "number") {
            setPoints(refund.points);
          }
          const refundTail = refund.ok
            ? `${refunded.toLocaleString("ko-KR")}p 환불됐어요.`
            : "환불은 실패했어요. 관리자에게 문의해주세요.";
          if (isIntentionalRejection(e) && serverMsg) {
            setCapError(
              `${serverMsg}\n(지금까지 ${i}박스는 정상 저장됐고, ${refundTail})`
            );
          } else {
            setError(
              refund.ok
                ? `${i + 1}/${boxCount}번째 박스 저장 실패 — ${refunded.toLocaleString("ko-KR")}p 환불. ${i}박스까지는 정상이에요.`
                : "카드 저장 및 환불에 실패했어요. 관리자에게 문의해주세요."
            );
          }
          // If some earlier boxes did land successfully, at least show
          // those cards instead of tossing the user back to sealed with
          // no receipt.
          if (allCards.length > 0) {
            allCards.sort(
              (a, b) => RARITY_STYLE[b.rarity].tier - RARITY_STYLE[a.rarity].tier
            );
            setMultiResult({
              boxCount: i,
              totalSpent: spent - refunded,
              cards: allCards,
            });
            setPhase("multi-result");
          } else {
            setPhase("sealed");
          }
          return;
        }
        for (const pack of drawn) for (const c of pack) allCards.push(c);
        setMultiProgress({ done: i + 1, total: boxCount });
      }

      allCards.sort(
        (a, b) => RARITY_STYLE[b.rarity].tier - RARITY_STYLE[a.rarity].tier
      );
      setAutoSellEarned(earnedFromAutoSell);
      setMultiResult({ boxCount, totalSpent: spent, cards: allCards });
      setPhase("multi-result");
    },
    [user, phase, set, cost, setPoints, autoSellSubAR]
  );

  const closeMulti = useCallback(() => {
    setMultiResult(null);
    setPhase("sealed");
  }, []);

  const openBox = useCallback(async () => {
    if (!user || phase !== "sealed") return;
    clearErrors();
    setPhase("buying");
    const res = await buyBox(user.id, set.code);
    if (!res.ok || typeof res.points !== "number") {
      setError(res.error ?? "박스 구매 실패");
      setPhase("sealed");
      return;
    }
    setPoints(res.points);
    const drawn = drawBox(set);
    setPacks(drawn);
    setOpenedMask(new Array(drawn.length).fill(false));
    setPhase("opening");
    setAutoSellEarned(0);
    // Persist every pack BEFORE revealing the grid. Keep the user on
    // the "opening" overlay (which now reads "카드 저장 중…") for the
    // full duration — no artificial min-animation race, just wait for
    // the actual saves to finish. Each save has 3 retries with backoff
    // so transient network blips don't cost the user a box.
    try {
      // Sequential (server has per-user advisory lock; see multi-box).
      let earned = 0;
      for (const pack of drawn) {
        const r = await persistPackWithRetry(
          user.id,
          set.code,
          pack.map((c) => c.id),
          pack.map((c) => c.rarity),
          autoSellSubAR
        );
        earned += r.sold_earned;
        if (typeof r.points === "number" && r.points > 0) setPoints(r.points);
      }
      setAutoSellEarned(earned);
      setPhase("grid");
    } catch (e) {
      console.error("box persist failed", e);
      const serverMsg = errorMessage(e);
      const refund = await refundBoxPurchase(user.id, set.code);
      const refunded = refund.ok ? (refund.refunded ?? cost) : 0;
      if (refund.ok && typeof refund.points === "number") {
        setPoints(refund.points);
      }
      const refundNote = refund.ok
        ? `${refunded.toLocaleString("ko-KR")}p 환불됐어요.`
        : "환불은 실패했어요. 관리자에게 문의해주세요.";
      if (isIntentionalRejection(e) && serverMsg) {
        setCapError(`${serverMsg}\n(${refundNote})`);
      } else {
        setError(
          refund.ok
            ? `카드 저장에 실패해 ${refundNote} 잠시 후 다시 시도해주세요.`
            : "저장 및 환불에 실패했어요. 관리자에게 문의해주세요."
        );
      }
      setPacks([]);
      setOpenedMask([]);
      setPhase("sealed");
    }
  }, [user, phase, set, cost, setPoints, clearErrors, autoSellSubAR]);

  const choosePack = useCallback(
    (index: number) => {
      if (openedMask[index]) return;
      setActivePack(index);
      setPhase("opening-pack");
      // Pulls were already saved at box-open time; this is now purely
      // animation state. (Discord pack-hit brag was removed — too noisy.)
      setOpenedMask((prev) => {
        const next = [...prev];
        next[index] = true;
        return next;
      });
    },
    [openedMask, packs, user]
  );

  const openAllRemaining = useCallback(async () => {
    if (!user) return;
    const remaining = packs
      .map((pack, i) => ({ pack, i }))
      .filter(({ i }) => !openedMask[i]);
    if (remaining.length === 0) return;
    setPhase("bulk");
    const allCards = remaining
      .flatMap(({ pack }) => pack)
      .sort(
        (a, b) => RARITY_STYLE[b.rarity].tier - RARITY_STYLE[a.rarity].tier
      );
    setBulkCards(allCards);
    setOpenedMask(new Array(packs.length).fill(true));
    setPhase("bulk-result");
  }, [user, packs, openedMask]);

  const backToGrid = useCallback(() => {
    setActivePack(null);
    setPhase("grid");
  }, []);

  const closeBulk = useCallback(() => {
    setPhase("grid");
  }, []);

  const resetBox = useCallback(() => {
    setPhase("sealed");
    setPacks([]);
    setOpenedMask([]);
    setActivePack(null);
    setBulkCards([]);
    const key = boxKey(user?.id, set.code);
    if (key && typeof window !== "undefined") {
      window.localStorage.removeItem(key);
    }
  }, [user?.id, set.code]);

  const openedCount = useMemo(
    () => openedMask.filter(Boolean).length,
    [openedMask]
  );
  const remainingCount = packs.length - openedCount;

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-12">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <Link href="/" className="text-xs text-zinc-400 hover:text-white">
            ← 팩 선택으로
          </Link>
          <h1 className="mt-2 text-2xl md:text-4xl font-black text-white tracking-tight">
            {set.name}
          </h1>
          <p className="text-xs md:text-sm text-zinc-400 mt-1">{set.subtitle}</p>
        </div>
        <div className="flex items-center gap-2 text-xs flex-wrap min-w-0 justify-end">
          <Stat label="박스당" value={`${set.packsPerBox}팩`} />
          <Stat label="팩당" value={`${set.cardsPerPack}장`} />
          <Stat
            label="개봉"
            value={`${openedCount} / ${set.packsPerBox}`}
            highlight
          />
          <HelpButton
            size="sm"
            title="박스 개봉"
            sections={[
              {
                heading: "박스 vs 팩",
                icon: "📦",
                body: (
                  <>
                    박스를 열면 그 안에서 <b>5팩</b>이 나와요. 각 팩에는{" "}
                    <b>5장</b>의 카드가 들어 있고, 슬롯별로 등급 가중치가 달라
                    마지막 슬롯은 보통 RR/AR/SR 이상 보장이에요.
                  </>
                ),
              },
              {
                heading: "한 박스 가격",
                icon: "🪙",
                body: (
                  <>
                    세트마다 박스 가격이 다르게 책정돼요. 우측 상단에 보이는{" "}
                    <b>박스당</b> 슬롯 표기와 같이, 자세한 단가는 박스 구매 버튼
                    위 가격 칩에서 확인하세요.
                  </>
                ),
              },
              {
                heading: "AR 미만 자동 판매",
                icon: "💸",
                body: (
                  <>
                    체크하면 C · U · R · RR 카드는 지갑에 저장하지 않고
                    일괄판매 단가로 즉시 포인트로 환산돼요.
                    <ul className="mt-1.5">
                      <li>지갑 한도(10,000장)에 잘 안 닿게 해줘요</li>
                      <li>박스 한 판 / 여러 박스 한번에 모두 적용</li>
                      <li>설정은 자동 저장 (다음 박스 열 때도 유지)</li>
                    </ul>
                  </>
                ),
              },
              {
                heading: "여러 박스 한번에",
                icon: "🚀",
                body: (
                  <>
                    3 / 5 / 10박스를 한 번에 자동 개봉할 수 있어요. 결과 화면에
                    모든 카드와 자동판매 수익이 합산돼서 표시돼요. 한 박스라도
                    저장 실패 시 그 박스 비용만 환불, 그 전까지는 정상 저장.
                  </>
                ),
              },
              {
                heading: "지갑이 가득 찰 때",
                icon: "💼",
                body: (
                  <>
                    일반 카드 <b>10,000장</b>을 넘기면 박스가 거부되고 비용이
                    자동 환불돼요. 이럴 땐 자동 판매 옵션을 켜거나,{" "}
                    <b>일괄 판매</b>로 잡카드를 정리한 뒤 다시 시도하세요.
                  </>
                ),
              },
              {
                heading: "팁",
                icon: "💡",
                body: (
                  <ul>
                    <li>
                      어떤 등급이든 <b>감별</b>해서 슬랩으로 만들 수 있어요 —
                      일괄 판매보다 보너스가 훨씬 커요.
                    </li>
                    <li>감별 실패 시 카드가 사라지니 신중히 (실패 70%).</li>
                    <li>
                      박스 도중 페이지를 떠나도 깐 카드는 24시간 동안 자동
                      복원돼요.
                    </li>
                  </ul>
                ),
              },
            ]}
          />
        </div>
      </div>

      <AnimatePresence mode="wait">
        {(phase === "sealed" || phase === "buying") && (
          <SealedBox
            key="sealed"
            set={set}
            cost={cost}
            userPoints={user?.points ?? 0}
            canAfford={canAfford}
            loading={phase === "buying"}
            error={error}
            capError={capError}
            autoSellSubAR={autoSellSubAR}
            onToggleAutoSell={toggleAutoSell}
            onOpen={openBox}
            onOpenMulti={openMulti}
          />
        )}
        {phase === "multi-buying" && (
          <MultiBuyingOverlay
            key="multi-buying"
            done={multiProgress.done}
            total={multiProgress.total}
          />
        )}
        {phase === "opening" && <BoxOpening key="opening" set={set} />}
        {(phase === "grid" ||
          phase === "opening-pack" ||
          phase === "bulk" ||
          phase === "bulk-result") && (
          <motion.div
            key="grid"
            className="mt-6 md:mt-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="mb-4 md:mb-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-zinc-400">
                {remainingCount > 0
                  ? "팩 하나를 눌러 개봉하거나, 모든 팩을 한번에 열어보세요."
                  : "모든 팩을 개봉했어요."}
              </p>
              <div className="flex items-center gap-2">
                {remainingCount > 0 && phase === "grid" && (
                  <button
                    onClick={openAllRemaining}
                    className="h-11 px-4 rounded-xl bg-gradient-to-r from-amber-400 to-rose-500 text-zinc-950 font-bold text-sm hover:scale-[1.02] active:scale-[0.98] transition"
                  >
                    모든 팩 한번에 열기 ({remainingCount})
                  </button>
                )}
                {openedCount >= set.packsPerBox && (
                  <button
                    onClick={resetBox}
                    className="h-11 px-5 rounded-xl bg-white text-zinc-900 font-semibold text-sm hover:bg-zinc-100 transition"
                  >
                    새 박스 열기
                  </button>
                )}
              </div>
            </div>
            <PackGrid
              set={set}
              openedMask={openedMask}
              onChoose={choosePack}
              disabled={phase !== "grid"}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {phase === "opening-pack" && activePack !== null && (
          <PackOpeningStage
            key="overlay"
            pack={packs[activePack]}
            packImage={set.packImage}
            setName={set.name}
            onClose={backToGrid}
          />
        )}
        {phase === "bulk-result" && (
          <BulkResultOverlay
            key="bulk"
            cards={bulkCards}
            setName={set.name}
            onClose={closeBulk}
          />
        )}
        {phase === "bulk" && <BulkLoading key="bulk-loading" />}
        {phase === "multi-result" && multiResult && (
          <MultiResultOverlay
            key="multi-result"
            setName={set.name}
            boxCount={multiResult.boxCount}
            totalSpent={multiResult.totalSpent}
            cards={multiResult.cards}
            autoSellEarned={autoSellEarned}
            onClose={closeMulti}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function Stat({
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
        "rounded-lg px-3 py-1.5 border",
        highlight
          ? "bg-amber-400/10 border-amber-400/40 text-amber-200"
          : "bg-white/5 border-white/10 text-zinc-200"
      )}
    >
      <div className="text-[10px] uppercase tracking-wider text-zinc-400">
        {label}
      </div>
      <div className="text-sm font-bold">{value}</div>
    </div>
  );
}

function SealedBox({
  set,
  cost,
  userPoints,
  canAfford,
  loading,
  error,
  capError,
  autoSellSubAR,
  onToggleAutoSell,
  onOpen,
  onOpenMulti,
}: {
  set: SetInfo;
  cost: number;
  userPoints: number;
  canAfford: boolean;
  loading: boolean;
  error: string | null;
  capError: string | null;
  autoSellSubAR: boolean;
  onToggleAutoSell: (next: boolean) => void;
  onOpen: () => void;
  onOpenMulti: (n: number) => void;
}) {
  return (
    <motion.div
      key="sealed"
      className="mt-8 md:mt-14 flex flex-col items-center gap-5 md:gap-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
    >
      <motion.div
        className="relative w-full max-w-[360px] md:max-w-[520px] aspect-[3/2]"
        whileHover={{ rotate: 1.5, y: -4 }}
        transition={{ type: "spring", stiffness: 150, damping: 16 }}
      >
        <div
          className="absolute inset-0 blur-3xl rounded-full opacity-60 pointer-events-none"
          style={{
            background: `radial-gradient(closest-side, ${set.primaryColor}88, transparent 70%)`,
          }}
        />
        <div className="relative w-full h-full animate-bob">
          <Image
            src={set.boxImage}
            alt={`${set.name} 박스`}
            fill
            sizes="(max-width: 768px) 90vw, 520px"
            className="object-contain drop-shadow-2xl select-none pointer-events-none"
            priority
            draggable={false}
          />
        </div>
      </motion.div>
      <button
        onClick={onOpen}
        disabled={!canAfford || loading}
        style={{ touchAction: "manipulation" }}
        className={clsx(
          "h-12 md:h-14 px-6 md:px-8 rounded-xl font-bold text-sm md:text-base inline-flex items-center gap-2 transition",
          canAfford && !loading
            ? "bg-gradient-to-r from-amber-400 to-rose-500 text-zinc-950 shadow-[0_12px_40px_-10px_rgba(251,113,133,0.8)] hover:scale-[1.03] active:scale-[0.98]"
            : "bg-white/5 text-zinc-400 cursor-not-allowed border border-white/10"
        )}
      >
        {loading ? (
          "구매 중..."
        ) : (
          <>
            📦 박스 열기
            <span className="inline-flex items-center gap-1 font-black">
              <CoinIcon size="sm" />
              {cost.toLocaleString("ko-KR")}p
            </span>
          </>
        )}
      </button>

      {/* Multi-box shortcut: buys + auto-opens N boxes all at once. */}
      <div className="flex flex-col items-center gap-1.5">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500">
          여러 박스 한번에 (자동 개봉)
        </p>
        <div className="flex items-center gap-1.5">
          {MULTI_OPTIONS.map((n) => {
            const total = cost * n;
            const afford = userPoints >= total;
            return (
              <button
                key={n}
                onClick={() => onOpenMulti(n)}
                disabled={!afford || loading}
                style={{ touchAction: "manipulation" }}
                className={clsx(
                  "h-10 px-3 rounded-lg text-xs font-black inline-flex items-center gap-1 transition",
                  afford && !loading
                    ? "bg-white/10 border border-white/20 text-white hover:bg-white/15 active:scale-[0.97]"
                    : "bg-white/5 border border-white/10 text-zinc-500 cursor-not-allowed"
                )}
              >
                <span>×{n}</span>
                <span className="text-[10px] font-semibold opacity-80 tabular-nums">
                  {total.toLocaleString("ko-KR")}p
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Auto-sell toggle — applies to single 박스 열기 AND 여러 박스 한번에 */}
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={autoSellSubAR}
          onChange={(e) => onToggleAutoSell(e.target.checked)}
          className="w-4 h-4 rounded accent-amber-400"
          style={{ touchAction: "manipulation" }}
        />
        <span className="text-xs text-zinc-300">
          AR 미만(C·U·R·RR) 자동 판매
        </span>
      </label>

      {!canAfford && !loading && (
        <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
          포인트가 부족해요. 일괄판매·감별·전시 수익으로 채워보세요.
        </p>
      )}
      {capError && (
        <div className="text-sm text-amber-100 bg-amber-500/10 border border-amber-400/40 rounded-xl px-4 py-3 space-y-2">
          <div className="flex items-start gap-2">
            <span className="text-lg leading-none">💼</span>
            <div className="flex-1">
              <div className="font-semibold text-amber-200">
                지갑이 가득 찼어요
              </div>
              <div className="mt-1 whitespace-pre-line text-amber-100/90 text-[13px]">
                {capError}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Link
              href="/wallet/bulk-sell"
              className="text-[12px] px-3 py-1.5 rounded-full bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/40 text-amber-100 transition"
            >
              🎫 일괄 판매로 이동
            </Link>
            <Link
              href="/wallet"
              className="text-[12px] px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-200 transition"
            >
              📖 지갑 확인
            </Link>
          </div>
        </div>
      )}
      {error && (
        <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2 whitespace-pre-line">
          {error}
        </p>
      )}
    </motion.div>
  );
}

function BoxOpening({ set }: { set: SetInfo }) {
  return (
    <motion.div
      key="opening"
      className="mt-12 md:mt-16 flex flex-col items-center gap-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="relative w-full max-w-[360px] md:max-w-[520px] aspect-[3/2]">
        <motion.div
          className="absolute inset-0"
          initial={{ scale: 1, rotate: 0 }}
          animate={{ scale: [1, 1.05, 1.12], rotate: [0, -2, 2, 0] }}
          transition={{ duration: 0.9, times: [0, 0.5, 1] }}
        >
          <Image
            src={set.boxImage}
            alt={set.name}
            fill
            sizes="(max-width: 768px) 90vw, 520px"
            className="object-contain select-none pointer-events-none"
            draggable={false}
          />
        </motion.div>
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 1, times: [0, 0.6, 1] }}
          style={{
            background: `radial-gradient(closest-side, white, transparent 60%)`,
            mixBlendMode: "screen",
          }}
        />
      </div>
      <p className="text-sm text-zinc-200 font-semibold">카드 저장 중…</p>
      <p className="mt-1 text-[11px] text-zinc-500">
        박스를 열고 전체 팩을 DB에 기록하고 있어요. 닫지 말고 잠시만요.
      </p>
    </motion.div>
  );
}

function BulkLoading() {
  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-full border-4 border-white/15 border-t-amber-400 animate-spin" />
        <p className="text-sm text-white">모든 팩을 한번에 여는 중...</p>
      </div>
    </motion.div>
  );
}

function BulkResultOverlay({
  cards,
  setName,
  onClose,
}: {
  cards: Card[];
  setName: string;
  onClose: () => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black/95 flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div
        className="shrink-0 border-b border-white/10 bg-black/95"
        style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 16px)" }}
      >
        <div className="flex items-center justify-between gap-2 px-3 md:px-6 h-12">
          <div className="text-xs md:text-sm text-zinc-200 font-semibold truncate">
            {setName} · 전체 개봉 결과 ({cards.length}장)
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white"
            style={{ touchAction: "manipulation" }}
          >
            ✕
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div
          className="grid gap-3 md:gap-4 px-4 md:px-6 py-4 md:py-6 mx-auto max-w-5xl"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
          }}
        >
          {cards.map((card, i) => (
            <BulkMiniCard key={i} card={card} />
          ))}
        </div>
      </div>
      <div
        className="shrink-0 border-t border-white/10 bg-black/70 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="max-w-3xl mx-auto px-3 md:px-6 py-3 flex items-center justify-center gap-2">
          <Link
            href="/wallet"
            className="h-11 px-5 rounded-xl bg-white/10 text-white font-semibold text-sm hover:bg-white/15 inline-flex items-center"
          >
            지갑 보기
          </Link>
          <button
            onClick={onClose}
            className="h-11 px-5 rounded-xl bg-white text-zinc-900 font-bold text-sm"
          >
            확인
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function BulkMiniCard({ card }: { card: Card }) {
  const style = RARITY_STYLE[card.rarity];
  return (
    <div
      className={clsx(
        "relative w-full aspect-[5/7] rounded-lg overflow-hidden isolate ring-2 bg-zinc-900",
        style.frame,
        style.glow
      )}
    >
      {card.imageUrl ? (
        <img
          src={card.imageUrl}
          alt={card.name}
          loading="lazy"
          draggable={false}
          className="w-full h-full object-contain bg-zinc-900 select-none pointer-events-none"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-700 to-amber-600 p-2 text-center text-white text-[10px] select-none">
          {card.name}
        </div>
      )}
      <div className="absolute left-1.5 bottom-1.5 pointer-events-none">
        <RarityBadge rarity={card.rarity} size="xs" />
      </div>
    </div>
  );
}

function PackGrid({
  set,
  openedMask,
  onChoose,
  disabled,
}: {
  set: SetInfo;
  openedMask: boolean[];
  onChoose: (i: number) => void;
  disabled: boolean;
}) {
  return (
    <motion.div
      className="grid gap-2.5 md:gap-4"
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(96px, 1fr))`,
      }}
    >
      {openedMask.map((opened, i) => (
        <motion.button
          key={i}
          type="button"
          disabled={opened || disabled}
          onClick={() => onChoose(i)}
          initial={{ opacity: 0, y: 20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: Math.min(i * 0.02, 0.3), type: "spring", stiffness: 220 }}
          whileHover={!opened && !disabled ? { y: -6, scale: 1.04 } : {}}
          whileTap={!opened && !disabled ? { scale: 0.95 } : {}}
          className={clsx(
            "relative rounded-xl overflow-hidden border transition-all",
            opened
              ? "opacity-30 grayscale cursor-not-allowed border-white/5"
              : "border-white/10 hover:border-white/30 cursor-pointer"
          )}
        >
          <div className="relative aspect-[2/3]">
            <img
              src={set.packImage}
              alt={`${set.name} 팩 ${i + 1}`}
              className="w-full h-full object-contain bg-zinc-900"
            />
            {!opened && <div className="pack-shine absolute inset-0" />}
          </div>
          <div className="absolute top-1 left-1 text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white">
            #{String(i + 1).padStart(2, "0")}
          </div>
          {opened && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[10px] md:text-xs px-2 py-0.5 rounded bg-emerald-600 text-white font-semibold">
                개봉 완료
              </span>
            </div>
          )}
        </motion.button>
      ))}
    </motion.div>
  );
}

function MultiBuyingOverlay({
  done,
  total,
}: {
  done: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black/92 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="text-center">
        <div className="w-14 h-14 mx-auto rounded-full border-4 border-white/15 border-t-amber-400 animate-spin" />
        <p className="mt-4 text-base font-black text-white tabular-nums">
          박스 {done} / {total}
        </p>
        <p className="mt-1 text-xs text-zinc-400">
          박스를 열고 카드를 DB에 저장 중… 닫지 말고 잠시만요.
        </p>
        <div className="mt-3 h-1 w-60 mx-auto rounded-full bg-white/10 overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-amber-400 to-rose-500"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>
    </motion.div>
  );
}

function MultiResultOverlay({
  setName,
  boxCount,
  totalSpent,
  cards,
  autoSellEarned,
  onClose,
}: {
  setName: string;
  boxCount: number;
  totalSpent: number;
  cards: Card[];
  autoSellEarned: number;
  onClose: () => void;
}) {
  const byRarity = cards.reduce<Record<string, number>>((acc, c) => {
    acc[c.rarity] = (acc[c.rarity] ?? 0) + 1;
    return acc;
  }, {});
  const hitTiers = ["MUR", "UR", "SAR", "MA", "SR", "AR", "RR"] as const;
  const topHits = hitTiers.filter((t) => (byRarity[t] ?? 0) > 0);
  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black/95 flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div
        className="shrink-0 border-b border-white/10 bg-black/95"
        style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 16px)" }}
      >
        <div className="flex items-center justify-between gap-2 px-3 md:px-6 h-12">
          <div className="text-xs md:text-sm text-zinc-200 font-semibold truncate">
            {setName} · 박스 ×{boxCount} 결과 ({cards.length}장)
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="shrink-0 bg-black/70 border-b border-white/5 px-3 md:px-6 py-2">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[11px] text-zinc-400 tabular-nums flex items-center gap-2">
            <span>소비 {totalSpent.toLocaleString("ko-KR")}p</span>
            {autoSellEarned > 0 && (
              <span className="text-emerald-300">
                · 자동판매 +{autoSellEarned.toLocaleString("ko-KR")}p
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {topHits.length === 0 && (
              <span className="text-[11px] text-zinc-500">큰 히트 없음</span>
            )}
            {topHits.map((r) => (
              <span
                key={r}
                className={clsx(
                  "text-[10px] font-black px-2 py-0.5 rounded-full",
                  RARITY_STYLE[r].badge
                )}
              >
                {r} ×{byRarity[r]}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div
          className="grid gap-3 md:gap-4 px-4 md:px-6 py-4 md:py-6 mx-auto max-w-5xl"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))",
          }}
        >
          {cards.map((card, i) => (
            <BulkMiniCard key={i} card={card} />
          ))}
        </div>
      </div>
      <div
        className="shrink-0 border-t border-white/10 bg-black/70 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="max-w-3xl mx-auto px-3 md:px-6 py-3 flex items-center justify-center gap-2">
          <Link
            href="/wallet"
            className="h-11 px-5 rounded-xl bg-white/10 text-white font-semibold text-sm hover:bg-white/15 inline-flex items-center"
          >
            지갑 보기
          </Link>
          <button
            onClick={onClose}
            className="h-11 px-5 rounded-xl bg-white text-zinc-900 font-bold text-sm"
          >
            확인
          </button>
        </div>
      </div>
    </motion.div>
  );
}
