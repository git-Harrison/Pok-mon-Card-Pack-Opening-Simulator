"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import type { Card, SetInfo } from "@/lib/types";
import { drawBox } from "@/lib/pack-draw";
import { buyBox, recordPackPull } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { BOX_COST, RARITY_STYLE } from "@/lib/rarity";
import PackOpeningStage from "./PackOpeningStage";
import RarityBadge from "./RarityBadge";
import PointsChip from "./PointsChip";
import CoinIcon from "./CoinIcon";

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
  | "bulk-result";

export default function SetView({ set }: { set: SetInfo }) {
  const { user, setPoints } = useAuth();
  const [phase, setPhase] = useState<Phase>("sealed");
  const [packs, setPacks] = useState<Card[][]>([]);
  const [openedMask, setOpenedMask] = useState<boolean[]>([]);
  const [activePack, setActivePack] = useState<number | null>(null);
  const [bulkCards, setBulkCards] = useState<Card[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Guard so the initial restore doesn't write back over itself before
  // the user makes any change.
  const hydratedRef = useRef(false);

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

  const openBox = useCallback(async () => {
    if (!user || phase !== "sealed") return;
    setError(null);
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
    // Persist every pack's pulls BEFORE handing off to the grid. The 1.1s
    // opening animation runs in parallel, so a typical save finishes
    // before the user sees any cards. If persistence fails we surface
    // the error — otherwise pulls (MUR 등 고등급 포함) could be shown
    // in the animation without ever landing in card_ownership.
    const persistPromise = Promise.all(
      drawn.map((pack) =>
        recordPackPull(
          user.id,
          set.code,
          pack.map((c) => c.id)
        )
      )
    );
    const minAnimation = new Promise<void>((r) => setTimeout(r, 1100));
    try {
      await Promise.all([persistPromise, minAnimation]);
      setPhase("grid");
    } catch (e) {
      console.error("box persist failed", e);
      setError(
        "카드 저장에 실패했습니다. 잠시 후 다시 시도하거나 관리자에게 문의해주세요."
      );
      setPacks([]);
      setOpenedMask([]);
      setPhase("sealed");
    }
  }, [user, phase, set, setPoints]);

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
        <div className="flex items-center gap-2 text-xs">
          {user && <PointsChip points={user.points} size="sm" />}
          <Stat label="박스당" value={`${set.packsPerBox}팩`} />
          <Stat label="팩당" value={`${set.cardsPerPack}장`} />
          <Stat
            label="개봉"
            value={`${openedCount} / ${set.packsPerBox}`}
            highlight
          />
        </div>
      </div>

      <AnimatePresence mode="wait">
        {(phase === "sealed" || phase === "buying") && (
          <SealedBox
            key="sealed"
            set={set}
            cost={cost}
            canAfford={canAfford}
            loading={phase === "buying"}
            error={error}
            onOpen={openBox}
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
  canAfford,
  loading,
  error,
  onOpen,
}: {
  set: SetInfo;
  cost: number;
  canAfford: boolean;
  loading: boolean;
  error: string | null;
  onOpen: () => void;
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
      {!canAfford && !loading && (
        <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
          포인트가 부족해요. 상인에게 카드를 팔거나 선물로 모아보세요.
        </p>
      )}
      {error && (
        <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
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
      <p className="text-sm text-zinc-400">박스를 여는 중...</p>
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
