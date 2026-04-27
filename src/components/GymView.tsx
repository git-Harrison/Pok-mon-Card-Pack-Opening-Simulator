"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import clsx from "clsx";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "@/lib/useIsMobile";
import { fetchGymsState } from "@/lib/gym/db";
import {
  deriveGymStatus,
  DIFFICULTY_STYLE,
  type Gym,
  type GymStatus,
} from "@/lib/gym/types";
import { effectiveness } from "@/lib/wild/typechart";
import { TYPE_STYLE } from "@/lib/wild/types";
import { wildSpriteUrl } from "@/lib/wild/pool";
import { CenteredPokeLoader } from "./PokeLoader";
import PageHeader from "./PageHeader";
import Portal from "./Portal";

// 폴링 주기 — Phase 1 에서는 단순 setInterval. Phase 4 에서 Supabase
// realtime 으로 격상 검토.
const POLL_INTERVAL_MS = 5000;

const HELLO_LINES: string[] = [
  "오늘은 그냥 둘러보러 왔구나.",
  "체육관 분위기는 어떠한가? 또 보세!",
  "도전 준비가 되면 다시 와라.",
  "트레이너로서의 길은 길고도 험하다네.",
  "내 포켓몬들은 언제든 준비되어 있다.",
];

const TAUNT_LINES: string[] = [
  "애송이 녀석, 더 강해져서 다시 와라!",
  "그 실력으로 내 체육관에 도전하겠다고?",
  "아직은 부족하다. 펫을 더 키우고 와라!",
  "하하! 지금 실력으론 첫 번째 포켓몬도 못 넘을걸?",
  "도전 정신은 좋지만 실력이 따라오지 않는군.",
];

const PROTECT_LINES: string[] = [
  "이 체육관은 방금 점령되어 아직 도전할 수 없습니다.",
  "체육관 정비 중입니다. 남은 시간 후 다시 도전해주세요.",
  "새로운 관장이 자리를 잡는 중입니다. 잠시 후 다시 오세요.",
  "지금은 보호 시간이 적용 중입니다.",
  "체육관이 재정비 중이라 도전을 받을 수 없습니다.",
];

function pickLine(arr: readonly string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "0초";
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분 ${s}초`;
  return `${s}초`;
}

const STATUS_PILL: Record<
  GymStatus,
  { label: string; cls: string }
> = {
  open:             { label: "도전 가능",     cls: "bg-emerald-500/20 text-emerald-200 border-emerald-500/40" },
  owned_open:       { label: "도전 가능",     cls: "bg-emerald-500/20 text-emerald-200 border-emerald-500/40" },
  protected:        { label: "보호 중",       cls: "bg-amber-500/20 text-amber-200 border-amber-500/40" },
  challenge_active: { label: "도전 중",       cls: "bg-rose-500/20 text-rose-200 border-rose-500/40" },
  user_cooldown:    { label: "재도전 쿨타임", cls: "bg-zinc-500/20 text-zinc-300 border-zinc-500/40" },
  owned_by_me:      { label: "내 체육관",     cls: "bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-500/40" },
};

export default function GymView() {
  const { user } = useAuth();
  const reduce = useReducedMotion();
  const isMobile = useIsMobile();

  const [gyms, setGyms] = useState<Gym[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 매초 다시 그려 보호/쿨타임 카운트다운이 자연스럽게 줄어들도록.
  const [, force] = useState(0);

  const userId = user?.id ?? null;

  const refresh = useCallback(async () => {
    if (!userId) return;
    const list = await fetchGymsState(userId);
    setGyms(list);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Phase 1: 단순 폴링. Phase 4 에서 supabase realtime 으로 격상.
  useEffect(() => {
    if (!userId) return;
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [userId, refresh]);

  // 1초마다 force re-render — 카운트다운 표기.
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const selectedGym = useMemo(
    () => gyms.find((g) => g.id === selectedId) ?? null,
    [gyms, selectedId]
  );

  if (loading) return <CenteredPokeLoader />;

  return (
    <div className="relative max-w-3xl mx-auto px-3 md:px-6 py-3 md:py-6 fade-in">
      <PageHeader
        title="🏟️ 체육관 지도"
        subtitle="속성별 8개 체육관. 관장을 이기면 점령 + 메달."
        tone="amber"
        stats={
          <span className="px-2 py-1 rounded-full bg-amber-400/15 border border-amber-400/40 text-amber-100 text-[11px] font-bold">
            Phase 1 미리보기
          </span>
        }
      />

      <PhaseNotice />

      <GymMap
        gyms={gyms}
        myUserId={userId}
        onSelect={setSelectedId}
        reduce={!!reduce}
        isMobile={isMobile}
      />

      <AnimatePresence>
        {selectedGym && (
          <GymDetailModal
            gym={selectedGym}
            myUserId={userId}
            onClose={() => setSelectedId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/** Phase 1 단계 안내 — 전투 시스템(펫 선택/배틀 연출/메달 지급)은
 *  Phase 2-4 에서 순차 출시 예정. 본 화면은 지도/상세/락 검증까지. */
function PhaseNotice() {
  return (
    <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] px-3 py-2 text-[11px] md:text-xs text-amber-100 leading-snug">
      <div className="flex items-start gap-2">
        <span aria-hidden className="text-base leading-none mt-[1px]">📣</span>
        <div>
          <b className="text-amber-200">Phase 1 미리보기</b> — 지도/체육관
          상세/도전 락은 활성화. <b className="text-white">전투 / 펫 선택 /
          메달 지급 / 보호 연장</b>은 다음 페이즈에서 순차 추가됩니다.
        </div>
      </div>
    </div>
  );
}

/* ─────────────── Map ─────────────── */

function GymMap({
  gyms,
  myUserId,
  onSelect,
  reduce,
  isMobile,
}: {
  gyms: Gym[];
  myUserId: string | null;
  onSelect: (id: string) => void;
  reduce: boolean;
  isMobile: boolean;
}) {
  // 모바일에서는 절대 좌표 기반 픽셀 맵 대신 카드 그리드 (탭/시인성↑).
  // 데스크탑은 좌표 기반 가상 지도 — 단, 사용자 정책 상 PC 가 모바일을
  // 끌어내리면 안 되므로 이펙트는 가벼운 SVG 만.
  if (isMobile) {
    return (
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        {gyms.map((g, i) => (
          <GymCard
            key={g.id}
            gym={g}
            myUserId={myUserId}
            onClick={() => onSelect(g.id)}
            index={i}
            reduce={reduce}
          />
        ))}
      </div>
    );
  }
  return (
    <DesktopMap gyms={gyms} myUserId={myUserId} onSelect={onSelect} reduce={reduce} />
  );
}

/* ─────────────── Mobile gym card ─────────────── */

function GymCard({
  gym,
  myUserId,
  onClick,
  index,
  reduce,
}: {
  gym: Gym;
  myUserId: string | null;
  onClick: () => void;
  index: number;
  reduce: boolean;
}) {
  const status = deriveGymStatus(gym, myUserId);
  const pill = STATUS_PILL[status];
  const diff = DIFFICULTY_STYLE[gym.difficulty];
  const typeStyle = TYPE_STYLE[gym.type];

  return (
    <motion.button
      type="button"
      onClick={onClick}
      style={{ touchAction: "manipulation" }}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: Math.min(index, 6) * 0.04 }}
      className={clsx(
        "relative rounded-2xl border bg-white/[0.04] p-3 text-left flex flex-col gap-2 active:scale-[0.98] transition",
        "border-white/10 hover:bg-white/[0.07]"
      )}
    >
      {/* 속성 톤의 은은한 글로우 */}
      <span
        aria-hidden
        className={clsx(
          "absolute -inset-px rounded-2xl pointer-events-none opacity-30",
          typeStyle.glow
        )}
      />
      <div className="relative flex items-center gap-2">
        <span
          className={clsx(
            "shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-base font-black",
            typeStyle.badge
          )}
        >
          🏟️
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] md:text-sm font-black text-white truncate">
            {gym.name}
          </p>
          <p className="text-[10px] text-zinc-400 truncate">
            관장 {gym.leader_name}
          </p>
        </div>
      </div>

      <div className="relative flex items-center gap-1 flex-wrap">
        <span
          className={clsx(
            "px-1.5 py-0.5 rounded text-[9px] font-black",
            typeStyle.badge
          )}
        >
          {gym.type}
        </span>
        <span
          className={clsx(
            "px-1.5 py-0.5 rounded text-[9px] font-black",
            diff.badge
          )}
        >
          {diff.label}
        </span>
      </div>

      <div className="relative flex items-center justify-between gap-1">
        <span
          className={clsx(
            "px-1.5 py-0.5 rounded-full border text-[9px] md:text-[10px] font-bold",
            pill.cls
          )}
        >
          {pill.label}
        </span>
        <span className="text-[9px] text-zinc-500 tabular-nums">
          ≥ {gym.min_power.toLocaleString("ko-KR")}
        </span>
      </div>
    </motion.button>
  );
}

/* ─────────────── Desktop pseudo-map ─────────────── */

function DesktopMap({
  gyms,
  myUserId,
  onSelect,
  reduce,
}: {
  gyms: Gym[];
  myUserId: string | null;
  onSelect: (id: string) => void;
  reduce: boolean;
}) {
  // PC 전용 — sky/forest 톤의 가벼운 SVG 배경 + 좌표 기반 핀 배치.
  // 사용자 명시: 모바일에 영향 주는 PC 효과는 금지. 이 컴포넌트는
  // GymMap 에서 isMobile=false 일 때만 마운트되므로 모바일은 영향 없음.
  return (
    <div className="mt-4 relative w-full aspect-[4/3] rounded-2xl border border-emerald-500/20 overflow-hidden bg-gradient-to-b from-emerald-950/40 via-zinc-950 to-zinc-950">
      {/* 가벼운 격자 — 지도 느낌 */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      {gyms.map((g) => (
        <DesktopPin
          key={g.id}
          gym={g}
          myUserId={myUserId}
          onClick={() => onSelect(g.id)}
          reduce={reduce}
        />
      ))}
    </div>
  );
}

function DesktopPin({
  gym,
  myUserId,
  onClick,
  reduce,
}: {
  gym: Gym;
  myUserId: string | null;
  onClick: () => void;
  reduce: boolean;
}) {
  const status = deriveGymStatus(gym, myUserId);
  const pill = STATUS_PILL[status];
  const typeStyle = TYPE_STYLE[gym.type];

  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1"
      style={{
        left: `${gym.location_x}%`,
        top: `${gym.location_y}%`,
      }}
    >
      <motion.span
        className={clsx(
          "relative w-10 h-10 rounded-xl flex items-center justify-center text-lg font-black border-2 border-white/30 shadow-lg",
          typeStyle.badge
        )}
        whileHover={reduce ? undefined : { scale: 1.12 }}
        whileTap={{ scale: 0.92 }}
      >
        🏟️
      </motion.span>
      <span
        className={clsx(
          "px-1.5 py-0.5 rounded-full border text-[9px] font-bold whitespace-nowrap",
          pill.cls
        )}
      >
        {pill.label}
      </span>
      <span className="text-[10px] text-white/90 font-bold drop-shadow whitespace-nowrap">
        {gym.name}
      </span>
    </button>
  );
}

/* ─────────────── Detail modal ─────────────── */

function GymDetailModal({
  gym,
  myUserId,
  onClose,
}: {
  gym: Gym;
  myUserId: string | null;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  const status = deriveGymStatus(gym, myUserId);
  const diff = DIFFICULTY_STYLE[gym.difficulty];
  const typeStyle = TYPE_STYLE[gym.type];

  // ESC 닫기 + body 스크롤 잠금.
  const closedRef = useRef(false);
  useEffect(() => {
    closedRef.current = false;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const protectionLeftMs =
    gym.ownership && gym.ownership.protection_until
      ? new Date(gym.ownership.protection_until).getTime() - Date.now()
      : 0;
  const cooldownLeftMs = gym.user_cooldown_until
    ? new Date(gym.user_cooldown_until).getTime() - Date.now()
    : 0;

  // "인사만 하고 나오기" — 랜덤 인사.
  const [bubble, setBubble] = useState<string | null>(null);
  const handleHello = () => {
    if (closedRef.current) return;
    setBubble(pickLine(HELLO_LINES));
    setTimeout(() => {
      closedRef.current = true;
      onClose();
    }, 1500);
  };

  // Phase 1: 대결 요청 버튼은 "Phase 2 출시 예정" 안내. Phase 2 부터
  // 펫 선택 화면으로 라우팅.
  const challengeBlocked =
    status === "protected" ||
    status === "challenge_active" ||
    status === "user_cooldown" ||
    status === "owned_by_me";

  const blockedMsg = (() => {
    if (status === "protected") return pickLine(PROTECT_LINES);
    if (status === "challenge_active")
      return `${gym.active_challenge?.display_name ?? "다른 트레이너"}가 도전 중이에요.`;
    if (status === "user_cooldown") return "재도전 쿨타임 중이에요.";
    if (status === "owned_by_me") return "내가 점령 중인 체육관이에요.";
    return "";
  })();

  return (
    <Portal>
      <motion.div
        className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-end md:items-center justify-center px-2 md:px-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="relative w-full max-w-md bg-zinc-950 border border-white/10 rounded-2xl flex flex-col overflow-hidden max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
          initial={reduce ? false : { y: 24, opacity: 0, scale: 0.96 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { y: 24, opacity: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
        >
          {/* Header */}
          <div
            className={clsx(
              "relative px-4 py-3 border-b border-white/10",
              "bg-gradient-to-br from-zinc-900 to-zinc-950"
            )}
          >
            <span
              aria-hidden
              className={clsx(
                "absolute inset-0 opacity-30 pointer-events-none",
                typeStyle.glow
              )}
            />
            <div className="relative flex items-center gap-2">
              <span
                className={clsx(
                  "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-lg font-black",
                  typeStyle.badge
                )}
              >
                🏟️
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm md:text-base font-black text-white truncate">
                  {gym.name}
                </h2>
                <p className="text-[10px] text-zinc-400 truncate">
                  관장 {gym.leader_name}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="닫기"
                className="shrink-0 w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 text-sm"
                style={{ touchAction: "manipulation" }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Body — 스크롤 가능 */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className={clsx("px-1.5 py-0.5 rounded text-[10px] font-black", typeStyle.badge)}
              >
                {gym.type}
              </span>
              <span
                className={clsx("px-1.5 py-0.5 rounded text-[10px] font-black", diff.badge)}
              >
                {diff.label}
              </span>
              <span className={clsx("px-1.5 py-0.5 rounded-full border text-[10px] font-bold", STATUS_PILL[status].cls)}>
                {STATUS_PILL[status].label}
              </span>
              <span className="ml-auto text-[10px] text-zinc-500 tabular-nums">
                도전 최소 전투력 {gym.min_power.toLocaleString("ko-KR")}
              </span>
            </div>

            {/* 상태별 인포 */}
            <StatusInfo
              gym={gym}
              status={status}
              protectionLeftMs={protectionLeftMs}
              cooldownLeftMs={cooldownLeftMs}
            />

            {/* 관장 멘트 인사 토스트 */}
            <AnimatePresence>
              {bubble && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[12px] text-white"
                >
                  💬 {bubble}
                </motion.div>
              )}
            </AnimatePresence>

            {/* 관장 포켓몬 */}
            <section>
              <h3 className="text-[11px] uppercase tracking-wider text-zinc-400 mb-2">
                관장 포켓몬
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {gym.pokemon.map((p) => (
                  <PokemonStatCard key={p.id} pokemon={p} gymType={gym.type} />
                ))}
              </div>
            </section>

            {/* 메달 정보 */}
            {gym.medal && (
              <section>
                <h3 className="text-[11px] uppercase tracking-wider text-zinc-400 mb-2">
                  지급 메달
                </h3>
                <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.06] px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span aria-hidden className="text-xl">🏅</span>
                    <div>
                      <p className="text-[13px] font-black text-amber-100">
                        {gym.medal.name}
                      </p>
                      <p className="text-[11px] text-zinc-400">
                        {gym.medal.description}
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* 차단 사유 */}
            {challengeBlocked && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/[0.07] px-3 py-2 text-[12px] text-rose-200 leading-snug">
                💢 {blockedMsg}
              </div>
            )}
          </div>

          {/* Footer — CTA */}
          <div className="border-t border-white/10 p-3 grid grid-cols-2 gap-2 bg-zinc-950/95">
            <button
              type="button"
              onClick={handleHello}
              style={{ touchAction: "manipulation" }}
              className="h-11 rounded-xl bg-white/5 border border-white/15 text-white font-bold text-sm active:scale-[0.98]"
            >
              👋 인사만 하고 나오기
            </button>
            <button
              type="button"
              disabled
              title="Phase 2 출시 예정"
              className="h-11 rounded-xl bg-white/5 border border-white/10 text-zinc-500 font-bold text-sm cursor-not-allowed inline-flex flex-col items-center justify-center"
            >
              <span>⚔️ 대결 요청</span>
              <span className="text-[9px] text-zinc-600 leading-none">
                Phase 2 출시 예정
              </span>
            </button>
          </div>
        </motion.div>
      </motion.div>
    </Portal>
  );
}

/* ─────────────── Status info block ─────────────── */

function StatusInfo({
  gym,
  status,
  protectionLeftMs,
  cooldownLeftMs,
}: {
  gym: Gym;
  status: GymStatus;
  protectionLeftMs: number;
  cooldownLeftMs: number;
}) {
  if (status === "protected" && gym.ownership) {
    return (
      <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.06] px-3 py-2 text-[12px] text-amber-100 leading-snug">
        🛡️ <b className="text-white">{gym.ownership.display_name}</b> 점령 ·
        보호 남은 시간{" "}
        <b className="tabular-nums">{formatRemaining(protectionLeftMs)}</b>
      </div>
    );
  }
  if (status === "owned_open" && gym.ownership) {
    return (
      <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.06] px-3 py-2 text-[12px] text-emerald-100 leading-snug">
        🟢 <b className="text-white">{gym.ownership.display_name}</b> 점령 중 ·
        보호 종료 — 다른 트레이너 도전 가능
      </div>
    );
  }
  if (status === "owned_by_me" && gym.ownership) {
    return (
      <div className="rounded-xl border border-fuchsia-500/40 bg-fuchsia-500/[0.07] px-3 py-2 text-[12px] text-fuchsia-100 leading-snug">
        🏅 내가 점령 중 · 보호 남은 시간{" "}
        <b className="tabular-nums">{formatRemaining(protectionLeftMs)}</b>
      </div>
    );
  }
  if (status === "challenge_active" && gym.active_challenge) {
    return (
      <div className="rounded-xl border border-rose-500/40 bg-rose-500/[0.07] px-3 py-2 text-[12px] text-rose-100 leading-snug">
        ⚔️ <b className="text-white">{gym.active_challenge.display_name}</b>{" "}
        도전 중 — 잠시 후 다시 확인하세요.
      </div>
    );
  }
  if (status === "user_cooldown") {
    return (
      <div className="rounded-xl border border-zinc-500/40 bg-zinc-500/[0.07] px-3 py-2 text-[12px] text-zinc-200 leading-snug">
        ⏳ 재도전 쿨타임{" "}
        <b className="tabular-nums">{formatRemaining(cooldownLeftMs)}</b>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.06] px-3 py-2 text-[12px] text-emerald-100 leading-snug">
      🟢 비점령 — NPC 관장에게 도전 가능
    </div>
  );
}

/* ─────────────── Pokemon stat tile ─────────────── */

function PokemonStatCard({
  pokemon,
  gymType,
}: {
  pokemon: { name: string; type: string; dex: number; hp: number; atk: number; def: number; spd: number };
  gymType: string;
}) {
  const t = pokemon.type as keyof typeof TYPE_STYLE;
  const style = TYPE_STYLE[t];
  const sameAsGym = pokemon.type === gymType;
  // 외부 sprite 가 깨지는 경우(iOS hotlink 등) 이름만 노출되도록 폴백.
  const [broken, setBroken] = useState(false);
  return (
    <div
      className={clsx(
        "relative rounded-lg border bg-zinc-900/60 p-2 flex flex-col items-center gap-1",
        "border-white/10"
      )}
    >
      <div className="relative w-14 h-14 flex items-center justify-center">
        {!broken && (
          <img
            src={wildSpriteUrl(pokemon.dex, true)}
            alt=""
            draggable={false}
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setBroken(true)}
            className="w-full h-full object-contain"
            style={{ imageRendering: "pixelated" }}
          />
        )}
        {broken && (
          <span className="text-[10px] text-zinc-400 text-center px-1">
            {pokemon.name}
          </span>
        )}
      </div>
      <p className="text-[10px] font-bold text-white truncate max-w-full">
        {pokemon.name}
      </p>
      <div className="flex items-center gap-1">
        <span
          className={clsx("px-1 py-0.5 rounded text-[8px] font-black", style.badge)}
        >
          {pokemon.type}
        </span>
        {sameAsGym && (
          <span className="text-[8px] text-amber-300 font-bold">★</span>
        )}
      </div>
      <ul className="text-[9px] text-zinc-300 grid grid-cols-2 gap-x-1 gap-y-0 w-full leading-tight tabular-nums">
        <li>HP {pokemon.hp}</li>
        <li>ATK {pokemon.atk}</li>
        <li>DEF {pokemon.def}</li>
        <li>SPD {pokemon.spd}</li>
      </ul>
    </div>
  );
}

/* ─────────────── (export) — 미사용 effectiveness import 가드 ─────────────── */
// 향후 Phase 2 의 펫 선택 / 전투 화면에서 effectiveness 를 직접 사용하기
// 위해 import 만 유지. 트리쉐이커가 빈 import 라고 잘못 잡아내지 않도록
// 명시적 const 1 회 참조.
const _phase2Reserved = effectiveness;
void _phase2Reserved;
