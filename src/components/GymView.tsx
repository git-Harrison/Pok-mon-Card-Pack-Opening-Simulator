"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import clsx from "clsx";
import { useAuth } from "@/lib/auth";
import { lockBodyScroll } from "@/lib/useBodyScrollLock";
import {
  claimGymDaily,
  computeUserCenterPower,
  extendGymProtection,
  fetchGymBattleHistory,
  fetchGymsState,
  startGymChallenge,
  type GymBattleLogEntry,
} from "@/lib/gym/db";
import {
  deriveGymStatus,
  DIFFICULTY_STYLE,
  type Gym,
  type GymStatus,
} from "@/lib/gym/types";
import { TYPE_STYLE, type WildType } from "@/lib/wild/types";
import { wildSpriteUrl } from "@/lib/wild/pool";
import { lookupDex } from "@/lib/wild/name-to-dex";
import { cardSpriteUrl } from "@/lib/wild/card-sprite";
import { getCard } from "@/lib/sets";
import type { DefenderPokemonInfo } from "@/lib/gym/types";
import { CenteredPokeLoader } from "./PokeLoader";
import PageHeader from "./PageHeader";
import Portal from "./Portal";
import GymChallengeOverlay from "./GymChallengeOverlay";
import GymMedalIcon from "./GymMedalIcon";
import GymDefenseDeckModal from "./GymDefenseDeckModal";
import NpcDialogModal from "./NpcDialogModal";

// 폴링 주기 — Phase 1 에서는 단순 setInterval. Phase 4 에서 Supabase
// realtime 으로 격상 검토.
const POLL_INTERVAL_MS = 5000;

const HELLO_LINES: string[] = [
  "오, 어서 오게! 오늘은 그냥 둘러보러 왔구나.",
  "내 체육관 분위기는 어떤가? 또 만나세!",
  "도전 준비가 되면 언제든 다시 오게.",
  "트레이너의 길은 길고도 험하다네... 잘 가게나.",
  "내 포켓몬들은 언제든 준비되어 있다네.",
  "차 한 잔 하고 가는 것도 나쁘지 않지!",
  "안녕히 가시게. 다음엔 정정당당히 겨뤄보자고.",
];

const TAUNT_LINES: string[] = [
  "애송이 녀석, 더 강해져서 다시 와라!",
  "그 실력으로 내 체육관에 도전하겠다고? 어림없다!",
  "아직 한참 부족하다. 펫을 더 키우고 와라!",
  "하하! 지금 실력으론 첫 번째 포켓몬도 못 넘을걸?",
  "도전 정신은 좋지만 실력이 따라오지 않는군.",
  "그 정도 전투력으론 내 발치에도 못 미친다!",
];

const PREBATTLE_LINES: string[] = [
  "흥, 도전을 받겠다! 후회하지 말거라!",
  "각오는 되어 있겠지? 가자!",
  "내 체육관에서 함부로 까불지 마라!",
  "재미있는 녀석이 왔구나. 진심으로 가겠다!",
  "오랜만에 흥미로운 도전이군. 받아주마!",
  "내 모든 걸 보여주마. 후회는 없겠지?",
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

const CHAPTER_META: Record<
  number,
  { name: string; subtitle: string }
> = {
  1: {
    name: "잎새 지방",
    subtitle: "풀/물/바위/전기/불꽃/땅/얼음/에스퍼",
  },
  2: {
    name: "불의 군도",
    subtitle: "노말/격투/벌레",
  },
  3: {
    name: "어둠의 협곡",
    subtitle: "독/비행/고스트/페어리/강철/악/드래곤",
  },
  4: {
    name: "미지의 영역",
    subtitle: "다음 시즌에 깨어날 영역",
  },
};

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
  underpowered:     { label: "도전 불가",     cls: "bg-rose-500/15 text-rose-300 border-rose-500/40" },
};

export default function GymView() {
  const { user } = useAuth();
  const reduce = useReducedMotion();

  const [gyms, setGyms] = useState<Gym[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeChallenge, setActiveChallenge] = useState<{
    gym: Gym;
    challengeId: string;
  } | null>(null);
  const [defenseGym, setDefenseGym] = useState<Gym | null>(null);
  const [centerPower, setCenterPower] = useState<number | null>(null);
  // 챕터 carousel — 1 (기존 8) / 2 (신규 10) / 3 (예정).
  const [chapter, setChapter] = useState<number>(1);
  // 매초 다시 그려 보호/쿨타임 카운트다운이 자연스럽게 줄어들도록.
  const [, force] = useState(0);

  const userId = user?.id ?? null;

  const refresh = useCallback(async () => {
    if (!userId) return;
    // gyms 상태 + center_power 를 항상 함께 갱신 — 도전 자격 표시가
    // 전시/펫/도감 변동 즉시 반영되도록. 이전엔 mount 시 한 번만
    // 가져와 stale 상태로 도전 거부 케이스 발생.
    const [list, cp] = await Promise.all([
      fetchGymsState(userId),
      computeUserCenterPower(userId),
    ]);
    setGyms(list);
    setCenterPower(cp);
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

  // 현재 챕터의 체육관만 필터.
  const gymsInChapter = useMemo(
    () => gyms.filter((g) => (g.chapter ?? 1) === chapter),
    [gyms, chapter]
  );

  // 총 챕터 수 — 1~3 활성, 4 는 "미지의 영역" 예약.
  const MAX_CHAPTER = 4;
  const chapterMeta = CHAPTER_META[chapter] ?? CHAPTER_META[1];

  if (loading) return <CenteredPokeLoader />;

  return (
    <div className="relative max-w-3xl mx-auto px-3 md:px-6 py-3 md:py-6 fade-in">
      <PageHeader
        title="🏟️ 체육관 지도"
        subtitle={`챕터 ${chapter} · ${chapterMeta.name}`}
        tone="amber"
      />

      {/* 챕터 carousel 헤더 — 좌우 화살표 + 진행 표시 */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setChapter((c) => Math.max(1, c - 1))}
          disabled={chapter <= 1}
          aria-label="이전 챕터"
          style={{ touchAction: "manipulation" }}
          className={clsx(
            "shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg font-black border transition",
            chapter <= 1
              ? "bg-white/5 text-zinc-600 border-white/10 cursor-not-allowed"
              : "bg-amber-400/15 text-amber-200 border-amber-400/40 hover:bg-amber-400/25 active:scale-95"
          )}
        >
          ◀
        </button>
        <div className="flex-1 min-w-0 text-center">
          <p className="text-[11px] uppercase tracking-[0.18em] text-amber-300/80 font-black">
            CHAPTER {chapter} / {MAX_CHAPTER}
          </p>
          <p className="text-sm font-bold text-white truncate">
            {chapterMeta.subtitle}
          </p>
          <div className="mt-1 inline-flex items-center gap-1">
            {Array.from({ length: MAX_CHAPTER }).map((_, i) => (
              <span
                key={i}
                className={clsx(
                  "w-1.5 h-1.5 rounded-full",
                  i + 1 === chapter ? "bg-amber-300" : "bg-white/20"
                )}
              />
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setChapter((c) => Math.min(MAX_CHAPTER, c + 1))}
          disabled={chapter >= MAX_CHAPTER}
          aria-label="다음 챕터"
          style={{ touchAction: "manipulation" }}
          className={clsx(
            "shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg font-black border transition",
            chapter >= MAX_CHAPTER
              ? "bg-white/5 text-zinc-600 border-white/10 cursor-not-allowed"
              : "bg-amber-400/15 text-amber-200 border-amber-400/40 hover:bg-amber-400/25 active:scale-95"
          )}
        >
          ▶
        </button>
      </div>

      <GymTownMap
        gyms={gymsInChapter}
        chapter={chapter}
        myUserId={userId}
        centerPower={centerPower}
        onSelect={setSelectedId}
        reduce={!!reduce}
      />

      {/* 도움말 — 우하단 floating 버튼. 본문 영역 영향 X. */}
      <GymHelpButton />


      <AnimatePresence>
        {selectedGym && !activeChallenge && !defenseGym && (
          <GymDetailModal
            gym={selectedGym}
            myUserId={userId}
            centerPower={centerPower}
            onClose={() => setSelectedId(null)}
            onOpenDefense={() => {
              // iOS Safari 가 backdrop-blur 깔린 detail modal 와 defense
              // modal 이 AnimatePresence 로 동시에 마운트/언마운트되는
              // 사이에 페이지 크래시("This page couldn't load") 를 던지는
              // 케이스가 있어 — detail 을 먼저 닫고 exit 애니메이션이
              // 끝난 뒤 defense 를 연다.
              const next = selectedGym;
              setSelectedId(null);
              setTimeout(() => setDefenseGym(next), 240);
            }}
            onStartChallenge={async () => {
              if (!userId) return;
              const res = await startGymChallenge(userId, selectedGym.id);
              if (!res.ok || !res.challenge_id) {
                alert(res.error ?? "도전을 시작할 수 없어요.");
                refresh();
                return;
              }
              setActiveChallenge({
                gym: selectedGym,
                challengeId: res.challenge_id,
              });
              setSelectedId(null);
            }}
            onExtend={async () => {
              if (!userId) return;
              const ok = window.confirm(
                "1,000,000P를 사용해 보호를 1시간 연장할까요?"
              );
              if (!ok) return;
              const res = await extendGymProtection(userId, selectedGym.id);
              if (!res.ok) {
                alert(res.error ?? "보호 연장 실패");
              } else {
                alert(
                  "1,000,000P를 사용해 체육관 보호시간을 1시간 연장했습니다."
                );
              }
              refresh();
            }}
            onClaimDaily={async () => {
              if (!userId) return;
              const res = await claimGymDaily(userId, selectedGym.id);
              if (!res.ok) {
                alert(res.error ?? "일일 보상 청구 실패");
              } else {
                alert(
                  `+${(res.money ?? 0).toLocaleString("ko-KR")}P · 랭킹 +${(res.rank_points ?? 0).toLocaleString("ko-KR")}점 청구 완료!`
                );
              }
              refresh();
            }}
          />
        )}
        {activeChallenge && (
          <GymChallengeOverlay
            gym={activeChallenge.gym}
            challengeId={activeChallenge.challengeId}
            onClose={() => setActiveChallenge(null)}
            onResolved={refresh}
          />
        )}
        {defenseGym && (
          <GymDefenseDeckModal
            gym={defenseGym}
            onClose={() => setDefenseGym(null)}
            onSaved={() => {
              setDefenseGym(null);
              refresh();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─────────────── Pixel Town Map ───────────────
 * 포켓몬 GBA 도트 마을 풍 — 진짜 지도 아닌 픽셀 타일 배경.
 * 모바일 우선. SVG (shape-rendering: crispEdges) + 정수 좌표만 써서
 * 픽셀 아트 느낌. blur / backdrop-filter / 무한 framer 루프 없음 —
 * mid-tier Android 에서도 60fps 유지가 목표.
 */

function GymTownMap({
  gyms,
  chapter,
  myUserId,
  centerPower,
  onSelect,
  reduce,
}: {
  gyms: Gym[];
  chapter: number;
  myUserId: string | null;
  centerPower: number | null;
  onSelect: (id: string) => void;
  reduce: boolean;
}) {
  // 챕터별 외곽 테두리 색.
  const borderCls =
    chapter === 1
      ? "border-emerald-900 shadow-[0_0_0_2px_rgba(16,185,129,0.4),0_8px_24px_rgba(0,0,0,0.5)]"
      : chapter === 2
      ? "border-rose-900 shadow-[0_0_0_2px_rgba(244,63,94,0.4),0_8px_24px_rgba(0,0,0,0.5)]"
      : chapter === 3
      ? "border-violet-900 shadow-[0_0_0_2px_rgba(139,92,246,0.4),0_8px_24px_rgba(0,0,0,0.5)]"
      : "border-zinc-800 shadow-[0_0_0_2px_rgba(0,0,0,0.85),0_12px_36px_rgba(168,85,247,0.3)]";

  // 챕터별 배경 + 라우트 SVG.
  const Background =
    chapter === 1
      ? PixelTownBackground
      : chapter === 2
      ? PixelTownBackgroundCh2
      : chapter === 3
      ? PixelTownBackgroundCh3
      : PixelTownBackgroundCh4;
  const Routes =
    chapter === 1
      ? PixelRoutes
      : chapter === 2
      ? PixelRoutesCh2
      : chapter === 3
      ? PixelRoutesCh3
      : null;

  return (
    <div
      className={clsx(
        "mt-3 relative w-full max-w-md mx-auto aspect-[10/13] rounded-2xl overflow-hidden border-4",
        borderCls
      )}
      style={{ imageRendering: "pixelated" }}
    >
      <Background />
      {Routes && <Routes />}

      {/* 챕터 4 — 미지의 영역. 웅장한 dark 톤 안내 (자물쇠 X). */}
      {chapter === 4 && gyms.length === 0 && (
        <UnknownRealmOverlay />
      )}

      {/* 체육관 핀 */}
      {gyms.map((g) => (
        <PixelGymPin
          key={g.id}
          gym={g}
          myUserId={myUserId}
          centerPower={centerPower}
          onClick={() => onSelect(g.id)}
          reduce={reduce}
        />
      ))}
    </div>
  );
}

/** 픽셀 마을 배경 — 단일 SVG. shape-rendering crispEdges + 정수 좌표.
 *  영역 분포 (viewBox 100×130):
 *    · 0-25 (Y)   : 하늘 / 눈 / 산
 *    · 25-50      : 산악 / 평원 전이
 *    · 50-72      : 평원 + 화산 + 바위지대
 *    · 72-100     : 숲 + 호수 + 모래해변
 */
function PixelTownBackground() {
  return (
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox="0 0 100 130"
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      aria-hidden
    >
      {/* 하늘 (위) — 옅은 보라/푸른 톤 */}
      <rect x="0" y="0" width="100" height="22" fill="#2a1f4a" />
      <rect x="0" y="22" width="100" height="6" fill="#3b2d63" />
      {/* 별 도트 (정수 좌표만) */}
      {[
        [10, 5], [22, 8], [34, 3], [48, 6], [60, 4], [74, 9], [86, 5], [94, 12],
        [16, 14], [40, 16], [68, 14], [82, 18],
      ].map(([x, y], i) => (
        <rect key={`star-${i}`} x={x} y={y} width="1" height="1" fill="#fde68a" />
      ))}

      {/* 눈 산 (얼음 체육관 부근, 우상단) */}
      <PixelMountain x={58} y={20} w={36} h={14} fill="#94a3b8" snow />
      {/* 보랏빛 부유섬 (에스퍼 체육관, 좌상단) */}
      <PixelFloatingIsland x={4} y={6} w={28} h={10} />

      {/* 평원 — 진한 잔디 → 옅은 잔디 그라이언트 단계 (3 레이어) */}
      <rect x="0" y="28" width="100" height="42" fill="#365b3b" />
      <rect x="0" y="34" width="100" height="36" fill="#3f6e44" />
      <rect x="0" y="40" width="100" height="30" fill="#4a834e" />
      {/* 풀 잔무늬 도트 */}
      {[
        [6, 30], [14, 36], [26, 32], [38, 38], [44, 30], [56, 36], [62, 32], [74, 38], [86, 32], [92, 36],
        [10, 50], [22, 54], [44, 50], [56, 54], [78, 50], [90, 54],
      ].map(([x, y], i) => (
        <rect key={`grass-${i}`} x={x} y={y} width="1" height="1" fill="#7cc88a" />
      ))}

      {/* 바위지대 (좌중단) — 회색 돌 더미 */}
      <PixelRocks x={6} y={48} />

      {/* 화산 (우중단, 불꽃 체육관 부근) */}
      <PixelVolcano x={70} y={42} />

      {/* 모래길 (path 본선) — 베이지 띠. 라우트는 위에 점선으로 또 그림. */}
      <rect x="0" y="68" width="100" height="6" fill="#c8a16a" />
      <rect x="0" y="68" width="100" height="1" fill="#a87a48" />
      <rect x="0" y="73" width="100" height="1" fill="#a87a48" />

      {/* 숲 — 좌하단 (잎새 체육관) */}
      <rect x="0" y="74" width="48" height="56" fill="#2a4a2e" />
      <rect x="0" y="74" width="48" height="1" fill="#1a3320" />
      <PixelTrees x={2}  y={88} />
      <PixelTrees x={14} y={96} />
      <PixelTrees x={26} y={108} />
      <PixelTrees x={6}  y={116} />
      <PixelTrees x={36} y={114} />

      {/* 호수 — 우하단 (파도 체육관) */}
      <rect x="48" y="74" width="52" height="56" fill="#1e3a8a" />
      <rect x="48" y="74" width="52" height="1" fill="#0f1f5a" />
      <rect x="48" y="80" width="52" height="22" fill="#2c52bf" />
      <rect x="48" y="102" width="52" height="28" fill="#1e3a8a" />
      {/* 물결 라인 (수평 dash) */}
      {[
        [54, 86], [62, 90], [72, 88], [82, 92], [90, 86],
        [50, 100], [60, 104], [70, 100], [82, 104], [92, 100],
        [54, 116], [66, 118], [80, 116], [92, 118],
      ].map(([x, y], i) => (
        <g key={`wave-${i}`}>
          <rect x={x}     y={y} width="2" height="1" fill="#7cc4ff" />
          <rect x={x + 3} y={y} width="2" height="1" fill="#7cc4ff" />
        </g>
      ))}

      {/* 모래사장 (호수와 잔디 경계) */}
      <rect x="48" y="74" width="6" height="56" fill="#d8b27a" opacity="0.55" />
    </svg>
  );
}

/** 산봉우리 — 픽셀 계단 모양 + (snow=true 일 때) 정상에 흰 픽셀. */
function PixelMountain({
  x, y, w, h, fill, snow,
}: { x: number; y: number; w: number; h: number; fill: string; snow?: boolean }) {
  const cx = x + Math.floor(w / 2);
  const peak = y;
  return (
    <g>
      {Array.from({ length: h }, (_, i) => {
        const ry = peak + i;
        const half = Math.floor(((i + 1) / h) * (w / 2));
        const rx = cx - half;
        const rw = half * 2;
        return (
          <rect key={i} x={rx} y={ry} width={Math.max(rw, 1)} height="1" fill={fill} />
        );
      })}
      {/* 하단 그림자 */}
      <rect x={x} y={y + h - 1} width={w} height="1" fill="#475569" />
      {snow && (
        <>
          <rect x={cx - 1} y={peak}     width="3" height="1" fill="#f1f5f9" />
          <rect x={cx - 2} y={peak + 1} width="5" height="1" fill="#cbd5e1" />
        </>
      )}
    </g>
  );
}

/** 부유섬 — 보라/인디고 두 톤 그라데이션 + 별 1개. */
function PixelFloatingIsland({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <g>
      <rect x={x}     y={y}         width={w}     height={1}     fill="#7c3aed" />
      <rect x={x + 1} y={y + 1}     width={w - 2} height={h - 2} fill="#5b21b6" />
      <rect x={x + 2} y={y + h - 2} width={w - 4} height={1}     fill="#4c1d95" />
      <rect x={x + 4} y={y + h - 1} width={w - 8} height={1}     fill="#3b0764" />
      <rect x={x + Math.floor(w / 2)} y={y + 2} width={1} height={1} fill="#fde68a" />
    </g>
  );
}

/** 바위 더미 — 짙은 회색 큐브 3-4 개. */
function PixelRocks({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x}      y={y}      width={6} height={3} fill="#52525b" />
      <rect x={x + 1}  y={y - 1}  width={4} height={1} fill="#71717a" />
      <rect x={x + 8}  y={y + 1}  width={5} height={3} fill="#3f3f46" />
      <rect x={x + 9}  y={y}      width={3} height={1} fill="#71717a" />
      <rect x={x + 4}  y={y + 4}  width={7} height={2} fill="#3f3f46" />
    </g>
  );
}

/** 화산 — 검붉은 봉우리 + 정상 라바. */
function PixelVolcano({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x + 5} y={y}      width={6}  height={1} fill="#7c2d12" />
      <rect x={x + 4} y={y + 1}  width={8}  height={1} fill="#9a3412" />
      <rect x={x + 3} y={y + 2}  width={10} height={1} fill="#9a3412" />
      <rect x={x + 2} y={y + 3}  width={12} height={1} fill="#7c2d12" />
      <rect x={x + 1} y={y + 4}  width={14} height={1} fill="#7c2d12" />
      <rect x={x}     y={y + 5}  width={16} height={2} fill="#451a03" />
      {/* 라바 분출 */}
      <rect x={x + 6} y={y - 2}  width={4}  height={1} fill="#fb923c" />
      <rect x={x + 7} y={y - 3}  width={2}  height={1} fill="#fde047" />
      <rect x={x + 5} y={y + 1}  width={2}  height={1} fill="#fb923c" />
      <rect x={x + 9} y={y + 1}  width={2}  height={1} fill="#fb923c" />
    </g>
  );
}

/** 나무 한 그루 — 진녹 잎 더미 + 갈색 줄기. */
function PixelTrees({ x, y }: { x: number; y: number }) {
  return (
    <g>
      {/* 잎 */}
      <rect x={x + 1} y={y}     width={4} height={1} fill="#15803d" />
      <rect x={x}     y={y + 1} width={6} height={2} fill="#166534" />
      <rect x={x + 1} y={y + 3} width={4} height={1} fill="#14532d" />
      {/* 줄기 */}
      <rect x={x + 2} y={y + 4} width={2} height={2} fill="#78350f" />
    </g>
  );
}

/** 체육관 사이 path 점선 — 위 SVG 배경 위에 한 번 더 SVG 레이어. */
function PixelRoutes() {
  // 챕터 1 — 8 체육관 (20260635).
  //  Row 1 (y=18): psychic(22) / ice(78)
  //  Row 2 (y=36): ground(50)
  //  Row 3 (y=50/56/50): rock(22,50) / electric(50,56) / fire(78,50)
  //  Row 4 (y=80): grass(28) / water(72)
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 100 130"
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      aria-hidden
    >
      <g stroke="#fcd34d" strokeWidth="0.6" strokeDasharray="1.2 1.4" fill="none">
        <path d="M22 18 L50 36" />
        <path d="M78 18 L50 36" />
        <path d="M50 36 L22 50" />
        <path d="M50 36 L50 56" />
        <path d="M50 36 L78 50" />
        <path d="M22 50 L28 80" />
        <path d="M78 50 L72 80" />
        <path d="M50 56 L28 80" />
        <path d="M50 56 L72 80" />
      </g>
    </svg>
  );
}

/** 챕터 2 — "불의 군도" 배경. 화산 / 폐허 / 부유섬 / 어둠 숲 / 용암.
 *  10 신규 체육관이 분포할 위치 (격투 90,32 / 독 4,30 / 비행 50,12 /
 *  벌레 4,70 / 고스트 38,68 / 페어리 78,105 / 강철 90,68 / 악 28,110 /
 *  노말 50,105 / 드래곤 88,92) 에 어울리는 환경. */
function PixelTownBackgroundCh2() {
  return (
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox="0 0 100 130"
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      aria-hidden
    >
      {/* 어두운 진홍 하늘 */}
      <rect x="0" y="0" width="100" height="22" fill="#1a0612" />
      <rect x="0" y="22" width="100" height="6" fill="#2a0a1c" />
      {/* 별 + 보름달 */}
      {[
        [10, 4], [22, 7], [34, 5], [60, 3], [72, 6], [86, 4], [94, 8],
        [16, 14], [40, 16], [68, 14],
      ].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="1" height="1" fill="#fde68a" />
      ))}
      <rect x="48" y="6" width="6" height="6" fill="#fef3c7" />
      <rect x="46" y="8" width="2" height="2" fill="#fef3c7" />
      <rect x="54" y="8" width="2" height="2" fill="#fef3c7" />

      {/* 부유섬 — 좌상단 (독 / 비행 근처) */}
      <PixelFloatingIsland x={4} y={26} w={22} h={8} />
      <PixelFloatingIsland x={42} y={5} w={18} h={7} />

      {/* 폐허 신전 — 중앙 (고스트, 38,68) */}
      <g>
        <rect x="32" y="58" width="14" height="2" fill="#1f1b2e" />
        <rect x="30" y="60" width="18" height="2" fill="#3f3548" />
        <rect x="32" y="62" width="3" height="6" fill="#3f3548" />
        <rect x="38" y="62" width="3" height="6" fill="#3f3548" />
        <rect x="44" y="62" width="3" height="6" fill="#3f3548" />
        <rect x="30" y="68" width="18" height="2" fill="#1f1b2e" />
        {/* 갈라진 균열 */}
        <rect x="38" y="63" width="1" height="3" fill="#0a0418" />
      </g>

      {/* 큰 화산 — 우하단 (드래곤 88,92 근처) */}
      <PixelVolcano x={78} y={78} />
      {/* 용암 강 — 우하단 흐름 */}
      <rect x="60" y="92" width="40" height="2" fill="#7c2d12" />
      <rect x="60" y="94" width="40" height="2" fill="#9a3412" />
      <rect x="60" y="96" width="40" height="1" fill="#dc2626" opacity="0.7" />

      {/* 검은 모래 길 (도로) */}
      <rect x="0" y="56" width="100" height="3" fill="#1c1917" />
      <rect x="0" y="56" width="100" height="1" fill="#0a0907" />
      <rect x="0" y="58" width="100" height="1" fill="#3f3f46" opacity="0.6" />

      {/* 어둠 숲 — 좌하단 (벌레 4,70 / 악 28,110) */}
      <rect x="0" y="62" width="50" height="68" fill="#1a0e2c" />
      <rect x="0" y="62" width="50" height="1" fill="#0a0418" />
      <PixelDarkTree x={4} y={75} />
      <PixelDarkTree x={16} y={84} />
      <PixelDarkTree x={28} y={92} />
      <PixelDarkTree x={6} y={104} />
      <PixelDarkTree x={36} y={114} />
      <PixelDarkTree x={20} y={120} />
      {/* 보랏빛 안개 입자 */}
      {[
        [10, 88], [22, 96], [38, 102], [14, 110], [30, 118],
      ].map(([x, y], i) => (
        <rect key={`mist-${i}`} x={x} y={y} width="2" height="1" fill="#7c3aed" opacity="0.4" />
      ))}

      {/* 우하단 — 화산 평원 + 페어리 사원 (흰 빛) */}
      <rect x="50" y="62" width="50" height="68" fill="#3a0f1a" />
      <rect x="50" y="62" width="50" height="1" fill="#1a0612" />
      {/* 페어리 사원 — 78,105 근처 */}
      <g>
        <rect x="74" y="98" width="10" height="2" fill="#f9a8d4" opacity="0.7" />
        <rect x="72" y="100" width="14" height="3" fill="#f472b6" opacity="0.6" />
        <rect x="74" y="103" width="2" height="3" fill="#831843" />
        <rect x="82" y="103" width="2" height="3" fill="#831843" />
      </g>
      {/* 핫핑크 잔잎 */}
      {[[58, 100], [66, 110], [88, 120], [62, 122]].map(([x, y], i) => (
        <rect key={`pink-${i}`} x={x} y={y} width="1" height="1" fill="#f472b6" />
      ))}

      {/* 강철 산 (강철 90,68) */}
      <PixelMountain x={84} y={56} w={14} h={12} fill="#71717a" />
      <rect x="86" y="64" width="2" height="4" fill="#a1a1aa" />
      <rect x="92" y="64" width="2" height="4" fill="#a1a1aa" />
    </svg>
  );
}

/** 챕터 2 라우트 — 3 체육관 (노말/벌레/격투) 삼각.
 *  위치: 노말(50,28) / 벌레(24,74) / 격투(76,74). */
function PixelRoutesCh2() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 100 130"
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      aria-hidden
    >
      <g stroke="#ec4899" strokeWidth="0.6" strokeDasharray="1.2 1.4" fill="none">
        <path d="M50 28 L24 74" />
        <path d="M50 28 L76 74" />
        <path d="M24 74 L76 74" />
      </g>
    </svg>
  );
}

/** 챕터 3 — 어둠의 협곡. 깊은 보라/인디고 톤 + 폐허/협곡/달.
 *  체육관 위치: 페어리 (22,18) / 강철 (78,28) / 고스트 (50,56) /
 *               악 (22,90) / 드래곤 (78,92). */
function PixelTownBackgroundCh3() {
  return (
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox="0 0 100 130"
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      aria-hidden
    >
      {/* 어두운 인디고 하늘 + 자줏빛 그라데이션 */}
      <rect x="0" y="0" width="100" height="40" fill="#0e0820" />
      <rect x="0" y="40" width="100" height="20" fill="#1a0d2e" />
      {/* 별 — 차갑고 sparse */}
      {[
        [12, 5], [28, 9], [44, 4], [60, 7], [78, 6], [92, 10],
        [20, 16], [54, 18], [86, 15],
      ].map(([x, y], i) => (
        <rect key={`s-${i}`} x={x} y={y} width="1" height="1" fill="#c4b5fd" opacity="0.7" />
      ))}
      {/* 초승달 — 우상단 */}
      <g>
        <rect x="84" y="6"  width="6" height="2" fill="#e9d5ff" />
        <rect x="82" y="8"  width="8" height="3" fill="#e9d5ff" />
        <rect x="84" y="11" width="6" height="2" fill="#e9d5ff" />
        <rect x="86" y="8"  width="3" height="3" fill="#1a0d2e" />
      </g>
      {/* 협곡 절벽 — 좌우 거대한 바위 실루엣 */}
      <g fill="#1f1b3a">
        {/* 좌측 절벽 */}
        <polygon points="0,40 18,40 12,60 22,60 14,80 26,80 18,100 30,100 22,130 0,130" />
        {/* 우측 절벽 */}
        <polygon points="100,40 82,40 88,60 78,60 86,80 74,80 82,100 70,100 78,130 100,130" />
      </g>
      {/* 절벽 하이라이트 */}
      <g fill="#3b2e5e" opacity="0.6">
        <polygon points="0,40 18,40 12,60 22,60 14,68 6,68" />
        <polygon points="100,40 82,40 88,60 78,60 86,68 94,68" />
      </g>
      {/* 협곡 바닥 — 깊은 균열 */}
      <rect x="20" y="62" width="60" height="2" fill="#0a0418" />
      <rect x="22" y="64" width="56" height="2" fill="#1f1b3a" opacity="0.6" />
      {/* 보랏빛 안개 띠 */}
      <rect x="0" y="58" width="100" height="3" fill="#7c3aed" opacity="0.18" />
      <rect x="0" y="74" width="100" height="3" fill="#a855f7" opacity="0.12" />
      {/* 폐허 기둥 — 중앙 (고스트 위치 근처) */}
      <g>
        <rect x="44" y="48" width="3" height="10" fill="#3b2e5e" />
        <rect x="53" y="48" width="3" height="10" fill="#3b2e5e" />
        <rect x="42" y="46" width="14" height="2" fill="#5b4a8a" />
        <rect x="42" y="58" width="14" height="2" fill="#3b2e5e" />
      </g>
      {/* 부서진 돌무더기 */}
      {[[28, 110], [70, 112], [40, 118], [60, 120]].map(([x, y], i) => (
        <g key={`r-${i}`}>
          <rect x={x} y={y} width="3" height="2" fill="#3b2e5e" />
          <rect x={x + 1} y={y - 1} width="2" height="1" fill="#5b4a8a" />
        </g>
      ))}
      {/* 도깨비 불 / 영혼 입자 — 부유 */}
      {[
        [22, 38], [50, 28], [78, 42], [38, 100], [62, 104], [88, 80],
      ].map(([x, y], i) => (
        <g key={`f-${i}`}>
          <rect x={x} y={y} width="2" height="2" fill="#a78bfa" opacity="0.8" />
          <rect x={x - 1} y={y + 1} width="1" height="1" fill="#c4b5fd" opacity="0.5" />
          <rect x={x + 2} y={y + 1} width="1" height="1" fill="#c4b5fd" opacity="0.5" />
        </g>
      ))}
      {/* 거대 그림자 — 좌하/우하 corner glow */}
      <radialGradient id="canyon-glow" cx="50%" cy="50%">
        <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.3" />
        <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
      </radialGradient>
      <ellipse cx="22" cy="92" rx="14" ry="6" fill="url(#canyon-glow)" />
      <ellipse cx="78" cy="94" rx="14" ry="6" fill="url(#canyon-glow)" />
    </svg>
  );
}

/** 챕터 3 라우트 — 어둠의 협곡 7 체육관.
 *  위치: 독(16,24) / 비행(50,18) / 강철(84,26) / 고스트(30,50) /
 *        페어리(72,54) / 악(22,78) / 드래곤(78,78). */
function PixelRoutesCh3() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 100 130"
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      aria-hidden
    >
      <g stroke="#a78bfa" strokeWidth="0.6" strokeDasharray="1.2 1.4" fill="none">
        {/* 상단 trio */}
        <path d="M16 24 L50 18" />
        <path d="M50 18 L84 26" />
        {/* 상단 → 중단 */}
        <path d="M16 24 L30 50" />
        <path d="M84 26 L72 54" />
        {/* 중단 가로 */}
        <path d="M30 50 L72 54" />
        {/* 중단 → 하단 */}
        <path d="M30 50 L22 78" />
        <path d="M72 54 L78 78" />
        {/* 하단 가로 */}
        <path d="M22 78 L78 78" />
      </g>
    </svg>
  );
}

/** 챕터 4 — 미지의 영역. 웅장 / 어둠 / 공포 톤. 자물쇠 이모지 사용 X. */
function PixelTownBackgroundCh4() {
  return (
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox="0 0 100 130"
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      aria-hidden
    >
      {/* 칠흑 배경 — 가장 어둡게 */}
      <rect x="0" y="0" width="100" height="130" fill="#020208" />
      {/* 위에서부터 옅어지는 자줏빛 mist */}
      <defs>
        <linearGradient id="ch4-haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.18" />
          <stop offset="50%" stopColor="#7c3aed" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.18" />
        </linearGradient>
        <radialGradient id="ch4-eye" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#dc2626" stopOpacity="0.95" />
          <stop offset="35%" stopColor="#7f1d1d" stopOpacity="0.85" />
          <stop offset="70%" stopColor="#1a0612" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#020208" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ch4-vignette" cx="50%" cy="50%" r="60%">
          <stop offset="60%" stopColor="#020208" stopOpacity="0" />
          <stop offset="100%" stopColor="#020208" stopOpacity="0.95" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="100" height="130" fill="url(#ch4-haze)" />

      {/* 깊은 fog 도트 패턴 */}
      {Array.from({ length: 60 }).map((_, i) => {
        const x = (i * 19) % 100;
        const y = ((i * 11) % 130) + 1;
        const op = ((i * 7) % 4) / 10 + 0.05;
        return (
          <rect
            key={`fog-${i}`}
            x={x}
            y={y}
            width="1"
            height="1"
            fill="#3b0764"
            opacity={op}
          />
        );
      })}

      {/* 거대 실루엣 — 스토리적 위협. 정 가운데 거대한 형체.
          몸통 사다리꼴 + 어깨 넓은 그림자 + 뿔 / 머리 */}
      <g fill="#0a0418" opacity="0.95">
        {/* 어깨 / 망토 윤곽 */}
        <polygon points="22,90 38,72 62,72 78,90 78,130 22,130" />
        {/* 머리 그림자 */}
        <rect x="40" y="58" width="20" height="14" />
        {/* 양 뿔 */}
        <polygon points="40,58 36,46 42,58" />
        <polygon points="60,58 64,46 58,58" />
      </g>
      {/* 형체 윤곽 보강 — 미세 highlight */}
      <g fill="#1a0612" opacity="0.9">
        <rect x="40" y="58" width="2" height="14" />
        <rect x="58" y="58" width="2" height="14" />
        <rect x="22" y="90" width="2" height="40" />
        <rect x="76" y="90" width="2" height="40" />
      </g>

      {/* 핏빛 두 눈 (radial glow) */}
      <circle cx="46" cy="64" r="3.5" fill="url(#ch4-eye)" />
      <circle cx="54" cy="64" r="3.5" fill="url(#ch4-eye)" />
      {/* 동공 — 정 가운데 어둡게 */}
      <rect x="45" y="63" width="2" height="2" fill="#0a0000" />
      <rect x="53" y="63" width="2" height="2" fill="#0a0000" />

      {/* 룬 글리프 — 좌/우 도트 패턴 (고대 마법진 느낌) */}
      <g fill="#7c3aed" opacity="0.55">
        {/* 좌측 룬 */}
        <rect x="6" y="20" width="2" height="1" />
        <rect x="9" y="22" width="1" height="2" />
        <rect x="6" y="25" width="2" height="1" />
        <rect x="11" y="20" width="1" height="6" />
        <rect x="6" y="100" width="6" height="1" />
        <rect x="6" y="103" width="1" height="3" />
        <rect x="11" y="103" width="1" height="3" />
        <rect x="6" y="107" width="6" height="1" />
        {/* 우측 룬 */}
        <rect x="92" y="20" width="2" height="1" />
        <rect x="89" y="22" width="1" height="2" />
        <rect x="92" y="25" width="2" height="1" />
        <rect x="88" y="20" width="1" height="6" />
        <rect x="88" y="100" width="6" height="1" />
        <rect x="88" y="103" width="1" height="3" />
        <rect x="93" y="103" width="1" height="3" />
        <rect x="88" y="107" width="6" height="1" />
      </g>

      {/* 가운데 균열 / 광선 — 사이드부터 위로 비스듬한 빔 */}
      <g fill="#7c3aed" opacity="0.18">
        <polygon points="48,0 50,0 52,40 50,40" />
        <polygon points="0,30 12,28 14,32 0,34" />
        <polygon points="100,30 88,28 86,32 100,34" />
      </g>

      {/* 핏빛 줄기 — 형체 발 아래 흘러내림 */}
      <g fill="#7f1d1d" opacity="0.6">
        <rect x="46" y="120" width="1" height="10" />
        <rect x="50" y="118" width="2" height="12" />
        <rect x="55" y="122" width="1" height="8" />
      </g>

      {/* 떠다니는 작은 도깨비 입자 (영혼) — 형체 주변 */}
      {[
        [30, 70], [70, 70], [26, 84], [74, 86], [40, 50], [60, 50],
        [18, 110], [82, 110],
      ].map(([x, y], i) => (
        <g key={`spirit-${i}`}>
          <rect x={x} y={y} width="2" height="2" fill="#a78bfa" opacity="0.7" />
          <rect x={x - 1} y={y + 1} width="1" height="1" fill="#c4b5fd" opacity="0.4" />
        </g>
      ))}

      {/* vignette — 가장자리 어둠 강조 */}
      <rect x="0" y="0" width="100" height="130" fill="url(#ch4-vignette)" />
    </svg>
  );
}

/** 미지의 영역 안내 overlay — 자물쇠 이모티콘 X, 웅장한 dark text +
 *  점멸 룬 + 핏빛 강조. */
function UnknownRealmOverlay() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <style>{`
        @keyframes ch4-pulse-red {
          0%, 100% { text-shadow: 0 0 12px rgba(220,38,38,0.85), 0 0 32px rgba(127,29,29,0.7); }
          50% { text-shadow: 0 0 18px rgba(220,38,38,1), 0 0 48px rgba(127,29,29,0.9); }
        }
        @keyframes ch4-rune-flicker {
          0%, 100% { opacity: 0.85; }
          50% { opacity: 0.4; }
        }
        @keyframes ch4-shake {
          0%, 100% { transform: translate(0, 0); }
          25% { transform: translate(-0.5px, 0.3px); }
          50% { transform: translate(0.4px, -0.4px); }
          75% { transform: translate(-0.3px, 0.5px); }
        }
      `}</style>
      <div
        className="relative rounded-xl px-7 py-5 text-center"
        style={{
          background: "rgba(2,2,8,0.55)",
          border: "1px solid rgba(124,58,237,0.45)",
          boxShadow:
            "inset 0 0 32px -8px rgba(124,58,237,0.45), 0 16px 36px -10px rgba(2,2,8,0.9)",
          animation: "ch4-shake 7s ease-in-out infinite",
        }}
      >
        <p
          className="text-[10px] uppercase tracking-[0.42em] font-black"
          style={{
            color: "#c4b5fd",
            animation: "ch4-rune-flicker 3.6s ease-in-out infinite",
            fontFamily: "monospace",
          }}
        >
          ▽ ◇ ▽ &nbsp; SEALED &nbsp; ▽ ◇ ▽
        </p>
        <p
          className="mt-3 text-3xl md:text-4xl font-black tracking-[0.18em]"
          style={{
            fontFamily: "monospace",
            color: "#fecaca",
            animation: "ch4-pulse-red 2.4s ease-in-out infinite",
          }}
        >
          미지의 영역
        </p>
        <p
          className="mt-2 text-[11px] tracking-[0.22em] font-bold"
          style={{
            color: "#7f1d1d",
            fontFamily: "monospace",
          }}
        >
          THE REALM AWAKENS SOON
        </p>
        <p className="mt-3 text-[10px] text-violet-300/65 leading-snug max-w-[18rem] mx-auto">
          잊혀진 차원의 봉인이 약해지고 있다.<br />
          때가 되면 어둠 속에서 형체들이 깨어날 것이다.
        </p>
        <div
          className="mt-3 inline-flex items-center gap-2 text-[9px] font-mono"
          style={{
            color: "#a78bfa",
            animation: "ch4-rune-flicker 2.8s ease-in-out infinite",
          }}
        >
          <span>Σ</span>
          <span>Ξ</span>
          <span>Ω</span>
          <span>Φ</span>
          <span>Ψ</span>
        </div>
      </div>
    </div>
  );
}

/** 어둠 숲 나무 — 보라/검정 잎. */
function PixelDarkTree({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x + 1} y={y}     width={4} height={1} fill="#581c87" />
      <rect x={x}     y={y + 1} width={6} height={2} fill="#3b0764" />
      <rect x={x + 1} y={y + 3} width={4} height={1} fill="#1e1b4b" />
      <rect x={x + 2} y={y + 4} width={2} height={2} fill="#1c1917" />
    </g>
  );
}

/** 핀 지붕 색 — type 별 (light, dark) 한 쌍. SVG inline fill 로 쓰임. */
const ROOF_COLORS: Record<string, { light: string; dark: string }> = {
  "노말":   { light: "#a1a1aa", dark: "#52525b" },
  "불꽃":   { light: "#f97316", dark: "#9a3412" },
  "물":     { light: "#3b82f6", dark: "#1e3a8a" },
  "풀":     { light: "#22c55e", dark: "#14532d" },
  "전기":   { light: "#facc15", dark: "#a16207" },
  "얼음":   { light: "#67e8f9", dark: "#0e7490" },
  "격투":   { light: "#dc2626", dark: "#7f1d1d" },
  "독":     { light: "#a855f7", dark: "#581c87" },
  "땅":     { light: "#b45309", dark: "#78350f" },
  "비행":   { light: "#818cf8", dark: "#3730a3" },
  "에스퍼": { light: "#ec4899", dark: "#831843" },
  "벌레":   { light: "#84cc16", dark: "#3f6212" },
  "바위":   { light: "#78716c", dark: "#44403c" },
  "고스트": { light: "#7c3aed", dark: "#3b0764" },
  "드래곤": { light: "#4f46e5", dark: "#312e81" },
  "악":     { light: "#27272a", dark: "#0a0a0a" },
  "강철":   { light: "#94a3b8", dark: "#475569" },
  "페어리": { light: "#f472b6", dark: "#9d174d" },
};

/** 픽셀 체육관 핀 — 작은 도트 건물 + 이름/상태. type 별 지붕 색 +
 *  status 별 깃발 마크. 도트 느낌 위해 SVG crispEdges + 정수 좌표. */
function PixelGymPin({
  gym,
  myUserId,
  centerPower,
  onClick,
  reduce,
}: {
  gym: Gym;
  myUserId: string | null;
  centerPower: number | null;
  onClick: () => void;
  reduce: boolean;
}) {
  const status = deriveGymStatus(gym, myUserId, Date.now(), centerPower);
  const pill = STATUS_PILL[status];
  const typeStyle = TYPE_STYLE[gym.type];
  const roof = ROOF_COLORS[gym.type] ?? { light: "#a1a1aa", dark: "#52525b" };

  // 상태별 깃발/마크.
  const flag =
    status === "owned_by_me" ? "👑" :
    status === "protected"   ? "🛡️" :
    status === "challenge_active" ? "⚔️" :
    status === "user_cooldown" ? "⌛" :
    status === "underpowered" ? "🚫" :
    null;

  // 도전 가능 / 비점령 후 도전 가능 핀에만 살짝 떠오르는 bobbing.
  const bobbing =
    !reduce && (status === "open" || status === "owned_open");

  return (
    <motion.button
      type="button"
      onClick={onClick}
      style={{
        left: `${gym.location_x}%`,
        top: `${gym.location_y}%`,
        touchAction: "manipulation",
      }}
      className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 group"
      whileTap={{ scale: 0.9 }}
      animate={bobbing ? { y: [0, -1.5, 0] } : undefined}
      transition={
        bobbing
          ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
          : { duration: 0 }
      }
    >
      <div
        className="relative shrink-0"
        style={{ width: 36, height: 38, imageRendering: "pixelated" }}
      >
        <svg
          viewBox="0 0 15 16"
          width={36}
          height={38}
          shapeRendering="crispEdges"
          aria-hidden
        >
          {/* 지붕 (type 색) — 위가 light, 처마는 dark */}
          <rect x="3" y="0" width="9"  height="1" fill={roof.light} />
          <rect x="2" y="1" width="11" height="1" fill={roof.light} />
          <rect x="1" y="2" width="13" height="2" fill={roof.light} />
          <rect x="0" y="4" width="15" height="1" fill={roof.dark} />
          {/* 벽 */}
          <rect x="1" y="5"  width="13" height="9" fill="#f5f5f4" />
          <rect x="1" y="13" width="13" height="1" fill="#a8a29e" />
          {/* 창 (양쪽) */}
          <rect x="3"  y="7" width="2" height="2" fill="#7dd3fc" />
          <rect x="10" y="7" width="2" height="2" fill="#7dd3fc" />
          {/* 문 */}
          <rect x="6" y="10" width="3" height="4" fill="#7c2d12" />
          <rect x="7" y="12" width="1" height="1" fill="#fbbf24" />
          {/* 바닥 */}
          <rect x="0" y="14" width="15" height="2" fill="#57534e" />
        </svg>
      </div>

      {/* 이름 + 상태 */}
      <div className="flex flex-col items-center -mt-0.5">
        <span
          className="px-1 py-[1px] rounded text-[8px] md:text-[9px] font-black whitespace-nowrap bg-black/75 text-white border border-white/20"
          style={{ textShadow: "0 1px 0 rgba(0,0,0,0.85)" }}
        >
          {gym.name}
        </span>
        <span
          className={clsx(
            "mt-0.5 inline-flex items-center gap-0.5 px-1 py-[1px] rounded-full border text-[8px] font-bold whitespace-nowrap",
            pill.cls
          )}
        >
          {flag && <span aria-hidden>{flag}</span>}
          {pill.label}
        </span>
        <span
          className={clsx(
            "mt-[1px] px-1 rounded text-[7px] font-black whitespace-nowrap",
            typeStyle.badge
          )}
        >
          {gym.type}
        </span>
      </div>
    </motion.button>
  );
}

/* ─────────────── Detail modal ─────────────── */

function GymDetailModal({
  gym,
  myUserId,
  centerPower,
  onClose,
  onStartChallenge,
  onExtend,
  onOpenDefense,
  onClaimDaily,
}: {
  gym: Gym;
  myUserId: string | null;
  centerPower: number | null;
  onClose: () => void;
  onStartChallenge: () => void;
  onExtend: () => void;
  onOpenDefense: () => void;
  onClaimDaily: () => void;
}) {
  const reduce = useReducedMotion();
  const status = deriveGymStatus(gym, myUserId, Date.now(), centerPower);
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
    const releaseLock = lockBodyScroll();
    return () => {
      window.removeEventListener("keydown", onKey);
      releaseLock();
    };
  }, [onClose]);

  const protectionLeftMs =
    gym.ownership && gym.ownership.protection_until
      ? new Date(gym.ownership.protection_until).getTime() - Date.now()
      : 0;
  const cooldownLeftMs = gym.user_cooldown_until
    ? new Date(gym.user_cooldown_until).getTime() - Date.now()
    : 0;

  // ── NPC 대화 모달 — 인사 / 도발 / 도전 수락 ────────────────
  // 점령된 체육관일 땐 NPC 관장 이름을 점령자 이름으로 대체 (UI 일관).
  const npcDisplayName = gym.ownership?.display_name ?? gym.leader_name;
  const [npcOpen, setNpcOpen] = useState(false);
  const [npcTone, setNpcTone] = useState<"greeting" | "taunt" | "prebattle">(
    "greeting"
  );
  const [npcLine, setNpcLine] = useState<string>("");

  const handleHello = () => {
    if (closedRef.current) return;
    setNpcTone("greeting");
    setNpcLine(pickLine(HELLO_LINES));
    setNpcOpen(true);
  };

  // 전투력 부족 — 버튼은 클릭 가능하게 두고, 클릭 시 NPC 도발 모달.
  const underpowered =
    centerPower !== null && centerPower < gym.min_power;
  // 보호/도전 중/쿨타임/내 소유 → 버튼 자체 disable.
  const challengeDisabled =
    status === "protected" ||
    status === "challenge_active" ||
    status === "user_cooldown" ||
    status === "owned_by_me";

  // 보호 끝났고 내가 소유 중이면 보호 연장 가능.
  const canExtend = status === "owned_by_me" && (
    !gym.ownership ||
    new Date(gym.ownership.protection_until).getTime() <= Date.now()
  );

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
          className="relative w-full max-w-md bg-zinc-950 border border-white/10 rounded-2xl flex flex-col overflow-hidden"
          style={{ maxHeight: "calc(100dvh - 24px)" }}
          onClick={(e) => e.stopPropagation()}
          initial={reduce ? false : { y: 24, opacity: 0, scale: 0.96 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { y: 24, opacity: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
        >
          {/* Header */}
          <div
            className={clsx(
              "relative shrink-0 px-4 py-3 border-b border-white/10",
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
                {/* 점령됐을 땐 NPC 관장 이름 숨기고 점령자만 표시. */}
                {gym.ownership ? (
                  <p className="text-[10px] text-fuchsia-200 truncate mt-0.5">
                    🏆 점령한 체육관장:{" "}
                    <b className="text-white">{gym.ownership.display_name}</b>
                  </p>
                ) : (
                  <p className="text-[10px] text-zinc-400 truncate">
                    관장 {gym.leader_name}
                  </p>
                )}
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

            {/* 관장/방어덱 표시 분기:
                · 점령됨 + 방어덱 셋업    → 점령자 펫 3마리
                · 점령됨 + 방어덱 미설정  → 안내 메시지 (NPC fallback 금지)
                · 미점령                   → NPC 관장 포켓몬 */}
            <section>
              <h3 className="text-[11px] uppercase tracking-wider text-zinc-400 mb-2">
                {gym.ownership?.has_defense_deck
                  ? `방어 덱 (${gym.ownership.display_name})`
                  : gym.ownership?.user_id
                  ? `방어 덱 미설정 (${gym.ownership.display_name})`
                  : "관장 포켓몬"}
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {gym.ownership?.has_defense_deck && gym.ownership.defender_pokemon
                  ? gym.ownership.defender_pokemon.map((p) => (
                      <DefenderStatCard
                        key={`def-${p.slot}`}
                        defender={p}
                        gymType={gym.type}
                      />
                    ))
                  : gym.ownership?.user_id
                  ? // 점령됐는데 방어덱 미설정 — NPC 표시 X, 안내 placeholder.
                    Array.from({ length: 3 }).map((_, i) => (
                      <div
                        key={`empty-def-${i}`}
                        className="rounded-lg border border-dashed border-amber-400/40 bg-amber-400/5 p-2 flex items-center justify-center text-center text-[10px] text-amber-200/80 leading-tight aspect-[5/7]"
                      >
                        방어 덱
                        <br />
                        미설정
                      </div>
                    ))
                  : gym.pokemon.map((p) => (
                      <PokemonStatCard
                        key={p.id}
                        pokemon={p}
                        gymType={gym.type}
                      />
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
                  <div className="flex items-center gap-2.5">
                    <GymMedalIcon type={gym.type} size={48} className="shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-black text-amber-100">
                        {gym.medal.name}
                      </p>
                      <p className="text-[11px] text-zinc-400">
                        {gym.medal.description}
                      </p>
                    </div>
                    {gym.has_my_medal && (
                      <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-[9px] font-bold">
                        보유 중
                      </span>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* 체육관 전투 기록 — 최신 20건. */}
            <GymBattleHistorySection gymId={gym.id} myUserId={myUserId} />

          </div>

          {/* Footer — CTA */}
          <div className="shrink-0 border-t border-white/10 p-3 bg-zinc-950/95 space-y-2">
            {status === "owned_by_me" && (
              <DailyClaimButton
                gym={gym}
                onClaimDaily={onClaimDaily}
              />
            )}
            {status === "owned_by_me" && (
              <button
                type="button"
                onClick={onOpenDefense}
                style={{ touchAction: "manipulation" }}
                className="w-full h-11 rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white font-black text-sm active:scale-[0.98]"
              >
                🛡️ 방어 덱 설정 (관장 포켓몬 = 내 펫 3마리)
                {gym.ownership?.has_defense_deck && (
                  <span className="ml-1.5 text-[10px] font-bold opacity-90">· 설정 중</span>
                )}
              </button>
            )}
            {canExtend && (
              <button
                type="button"
                onClick={onExtend}
                style={{ touchAction: "manipulation" }}
                className="w-full h-11 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-zinc-950 font-black text-sm active:scale-[0.98]"
              >
                🛡️ 1시간 보호 연장 (1,000,000P)
              </button>
            )}
            <div className="grid grid-cols-2 gap-2">
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
                disabled={challengeDisabled}
                onClick={() => {
                  if (underpowered) {
                    setNpcTone("taunt");
                    setNpcLine(pickLine(TAUNT_LINES));
                    setNpcOpen(true);
                    return;
                  }
                  setNpcTone("prebattle");
                  setNpcLine(pickLine(PREBATTLE_LINES));
                  setNpcOpen(true);
                }}
                style={{ touchAction: "manipulation" }}
                className={clsx(
                  "h-11 rounded-xl font-black text-sm",
                  challengeDisabled
                    ? "bg-white/5 border border-white/10 text-zinc-500 cursor-not-allowed"
                    : "bg-gradient-to-r from-rose-500 to-amber-500 text-zinc-950 active:scale-[0.98]"
                )}
              >
                ⚔️ 대결 요청
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* NPC 대화 모달 — greeting / taunt / prebattle */}
      <AnimatePresence>
        {npcOpen && (
          <NpcDialogModal
            type={gym.type}
            leaderName={npcDisplayName}
            gymName={gym.name}
            tone={npcTone}
            line={npcLine}
            onClose={() => {
              setNpcOpen(false);
              if (npcTone === "greeting") {
                closedRef.current = true;
                onClose();
              }
            }}
            onPrimary={
              npcTone === "prebattle"
                ? () => {
                    setNpcOpen(false);
                    onStartChallenge();
                  }
                : undefined
            }
          >
            {npcTone === "taunt" && (
              <div className="text-[10px] text-zinc-300 tabular-nums">
                내 전투력{" "}
                <b className="text-white">
                  {(centerPower ?? 0).toLocaleString("ko-KR")}
                </b>
                <span className="mx-1">/</span>
                필요{" "}
                <b className="text-rose-300">
                  {gym.min_power.toLocaleString("ko-KR")}
                </b>
              </div>
            )}
          </NpcDialogModal>
        )}
      </AnimatePresence>
    </Portal>
  );
}

/* ─────────────── 체육관 전투 기록 섹션 ─────────────── */

function relTimeKr(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}시간 전`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR");
}

function GymBattleHistorySection({
  gymId,
  myUserId,
}: {
  gymId: string;
  myUserId: string | null;
}) {
  const [logs, setLogs] = useState<GymBattleLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const r = await fetchGymBattleHistory(gymId, 20);
      if (!alive) return;
      setLogs(r);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [gymId]);

  // 항상 "점령자(defender) vs 도전자(challenger)" 고정 순서로 노출.
  // 결과(result)에 따라 양쪽의 승/패 라벨/색만 바뀜. 이전엔 loser-winner
  // 순이라 결과에 따라 좌우가 뒤바뀌어 사용자가 어느 쪽이 도전자인지
  // 매번 다시 읽어야 했음.
  const formatLine = useCallback(
    (l: GymBattleLogEntry) => {
      const challengerName =
        (myUserId && l.challenger_user_id === myUserId
          ? l.challenger_display_name ?? "나"
          : l.challenger_display_name) ?? "도전자";
      const defenderName =
        l.defender_user_id === null
          ? "기본 관장"
          : (myUserId && l.defender_user_id === myUserId
              ? l.defender_display_name ?? "나"
              : l.defender_display_name) ?? "점령자";
      // result === "won" → 도전자 승 → 점령자(패) vs 도전자(승)
      // result === "lost" → 도전자 패 → 점령자(승) vs 도전자(패)
      const challengerWon = l.result === "won";
      return {
        defenderName,
        defenderWon: !challengerWon,
        challengerName,
        challengerWon,
      };
    },
    [myUserId]
  );

  return (
    <section>
      <h3 className="text-[11px] uppercase tracking-wider text-zinc-400 mb-2">
        전투 기록
      </h3>
      <div className="rounded-xl border border-white/10 bg-white/[0.03] divide-y divide-white/5 overflow-hidden">
        {loading ? (
          <p className="text-[12px] text-zinc-500 text-center py-4">
            불러오는 중...
          </p>
        ) : logs.length === 0 ? (
          <p className="text-[12px] text-zinc-500 text-center py-4">
            아직 전투 기록이 없어요.
          </p>
        ) : (
          logs.map((l) => {
            const { defenderName, defenderWon, challengerName, challengerWon } =
              formatLine(l);
            const defenderColor = defenderWon
              ? "text-emerald-300/90"
              : "text-rose-300/90";
            const defenderTagColor = defenderWon
              ? "text-emerald-400/80"
              : "text-rose-400/80";
            const challengerColor = challengerWon
              ? "text-emerald-300/90"
              : "text-rose-300/90";
            const challengerTagColor = challengerWon
              ? "text-emerald-400/80"
              : "text-rose-400/80";
            return (
              <div
                key={l.id}
                className="px-3 py-2 flex items-center gap-2 text-[12px]"
              >
                <span className="shrink-0 text-zinc-500 tabular-nums w-[60px]">
                  {relTimeKr(l.ended_at)}
                </span>
                <span className="min-w-0 flex-1 text-zinc-300 break-keep">
                  <span className={defenderColor}>{defenderName}</span>
                  <span className={defenderTagColor}>
                    ({defenderWon ? "승" : "패"})
                  </span>
                  <span className="text-zinc-500 mx-1">vs</span>
                  <span className={challengerColor}>{challengerName}</span>
                  <span className={challengerTagColor}>
                    ({challengerWon ? "승" : "패"})
                  </span>
                </span>
              </div>
            );
          })
        )}
      </div>
    </section>
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
      <div className="relative w-14 h-14 shrink-0 overflow-hidden flex items-center justify-center">
        {!broken && (
          <img
            src={wildSpriteUrl(pokemon.dex, true)}
            alt=""
            draggable={false}
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setBroken(true)}
            className="max-w-full max-h-full object-contain"
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


/** 방어 덱 펫 카드 — 점령자가 셋업한 펫 카드 정보. PokemonStatCard 와
 *  비슷하지만 dex 가 카드 이름→lookup 으로 결정되고 HP/ATK 는 클라
 *  카드 카탈로그(slabStats) 로 미리보기. */
function DefenderStatCard({
  defender,
  gymType,
}: {
  defender: DefenderPokemonInfo;
  gymType: string;
}) {
  const t = defender.type as keyof typeof TYPE_STYLE;
  const style = TYPE_STYLE[t];
  // MUR 두 속성 중 하나라도 체육관 속성과 일치 → ★
  const sameAsGym =
    defender.type === gymType || defender.wild_type_2 === gymType;
  // stale 슬롯 — psa_gradings row 가 사라진 경우 server 가 card_id/
  // rarity/grade null 로 반환. "데이터 손상" placeholder 표시해
  // 점령은 그대로 인지하되 default NPC 로 떨어지지 않게.
  const isStale = defender.card_id == null;
  const card = defender.card_id ? getCard(defender.card_id) : null;
  const cardName = card?.name ?? defender.card_id ?? "?";
  const dex = !isStale ? lookupDex(cardName) : null;
  const megaSprite = !isStale ? cardSpriteUrl(cardName) : null;
  // 표시 stat — 서버 gym_defender_display_stats() 결과 그대로 사용.
  // 방어자 멀티플라이어 / MUR 보너스 / 속성 일치까지 반영된 실제 전투
  // 스탯과 동일. 클라 slabStats 는 base 표가 서버와 달라 폐기.
  const displayStats = !isStale
    ? {
        hp: defender.display_hp ?? 0,
        atk: defender.display_atk ?? 0,
      }
    : { hp: 0, atk: 0 };
  const [broken, setBroken] = useState(false);
  const [megaBroken, setMegaBroken] = useState(false);
  if (isStale) {
    return (
      <div className="relative rounded-lg border border-rose-400/40 bg-rose-500/[0.06] p-2 flex flex-col items-center gap-1 aspect-[5/7]">
        <div className="w-14 h-14 flex items-center justify-center text-2xl">⚠️</div>
        <p className="text-[10px] font-bold text-rose-200 truncate max-w-full">데이터 손상</p>
        <span className={clsx("px-1 py-0.5 rounded text-[8px] font-black", style.badge)}>
          {defender.type}
        </span>
        <p className="text-[8px] text-rose-300/85 text-center leading-tight">
          점령자 재셋업 필요
        </p>
      </div>
    );
  }
  return (
    <div className="relative rounded-lg border bg-zinc-900/60 p-2 flex flex-col items-center gap-1 border-fuchsia-400/30">
      <div className="relative w-14 h-14 shrink-0 overflow-hidden flex items-center justify-center">
        {/* 캐릭터화 chain — GymChallengeOverlay 와 동일 정책:
            (1) Pokemon Showdown ani (메가/특수폼)
            (2) PokeAPI gen5 BW animated (lookupDex base 매칭)
            (3) type-색 silhouette 👾 — 카드 art 직노출 / 텍스트-only 모두 회피. */}
        {!megaBroken && megaSprite ? (
          <img
            src={megaSprite}
            alt=""
            draggable={false}
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setMegaBroken(true)}
            className="max-w-full max-h-full object-contain"
            style={{ imageRendering: "pixelated" }}
          />
        ) : !broken && dex ? (
          <img
            src={wildSpriteUrl(dex, true)}
            alt=""
            draggable={false}
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setBroken(true)}
            className="max-w-full max-h-full object-contain"
            style={{ imageRendering: "pixelated" }}
          />
        ) : (
          <div
            className={clsx(
              "w-full h-full flex items-center justify-center rounded ring-1 ring-white/10",
              style.badge
            )}
            title={cardName}
          >
            <span aria-hidden className="text-2xl leading-none select-none">
              👾
            </span>
          </div>
        )}
      </div>
      <p className="text-[10px] font-bold text-white truncate max-w-full">
        {cardName}
      </p>
      <div className="flex items-center gap-1 flex-wrap justify-center">
        <span className={clsx("px-1 py-0.5 rounded text-[8px] font-black", style.badge)}>
          {defender.type}
        </span>
        {/* MUR 보조 속성 — 두 번째 배지 (UR/SAR 는 항상 null) */}
        {defender.wild_type_2 && (
          <span
            className={clsx(
              "px-1 py-0.5 rounded text-[8px] font-black",
              (TYPE_STYLE[defender.wild_type_2 as keyof typeof TYPE_STYLE] ?? style).badge
            )}
          >
            {defender.wild_type_2}
          </span>
        )}
        {sameAsGym && (
          <span className="text-[8px] text-amber-300 font-bold">★</span>
        )}
      </div>
      <ul className="text-[9px] text-zinc-300 grid grid-cols-2 gap-x-1 gap-y-0 w-full leading-tight tabular-nums">
        <li>HP {displayStats.hp}</li>
        <li>ATK {displayStats.atk}</li>
        <li className="col-span-2 text-fuchsia-300/85 font-bold text-[8px]">
          PCL {defender.grade} · {defender.rarity}
        </li>
      </ul>
    </div>
  );
}

/** 일일 보상 버튼 — 24h cooldown 지속, 1초마다 카운트다운 갱신. */
function DailyClaimButton({
  gym,
  onClaimDaily,
}: {
  gym: Gym;
  onClaimDaily: () => void;
}) {
  const [, force] = useState(0);
  const claimed = gym.ownership?.daily_claimed_today ?? false;
  const nextAt = gym.ownership?.daily_next_claim_at ?? null;
  const remainingMs = nextAt
    ? new Date(nextAt).getTime() - Date.now()
    : 0;
  const showCountdown = remainingMs > 0;
  // claimed 가 true 면 무조건 cooldown — 백엔드 마이그레이션 적용 전
  // 환경(daily_next_claim_at 미반환)도 안전하게 disable 유지.
  const inCooldown = claimed || showCountdown;

  // 1초마다 재렌더 — 남은 시간 라이브 카운트다운.
  useEffect(() => {
    if (!showCountdown) return;
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [showCountdown]);

  const remain = formatRemaining(remainingMs);
  return (
    <button
      type="button"
      onClick={onClaimDaily}
      disabled={inCooldown}
      style={{ touchAction: "manipulation" }}
      className={clsx(
        "w-full h-11 rounded-xl font-black text-sm",
        inCooldown
          ? "bg-white/5 border border-white/10 text-zinc-500 cursor-not-allowed"
          : "bg-gradient-to-r from-emerald-500 to-cyan-500 text-zinc-950 active:scale-[0.98]"
      )}
    >
      {showCountdown
        ? `⏳ 다음 보상까지 ${remain}`
        : claimed
        ? "✅ 일일 보상 받음 — 24시간 후 다시 받을 수 있어요"
        : `🎁 일일 보상 받기 (+${(gym.daily_money ?? 20000000).toLocaleString(
            "ko-KR"
          )}P · 랭킹 +${(gym.daily_rank_pts ?? 10000).toLocaleString(
            "ko-KR"
          )})`}
    </button>
  );
}

/** /gym 페이지 도움말 버튼. 지도를 가리지 않도록 헤더 영역 안쪽
 *  (페이지 헤더 우측) 인라인 small 버튼으로 배치. 모바일에서도 지도
 *  영역을 침범하지 않음. 클릭 시 모달로 단순화된 안내. */
function GymHelpButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="체육관 도움말"
        style={{ touchAction: "manipulation" }}
        className="fixed left-3 top-[calc(env(safe-area-inset-top,0px)+4.5rem)] md:left-5 md:top-20 z-30 h-8 px-2.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/20 text-white/80 text-[11px] font-bold flex items-center gap-1 active:scale-95 transition backdrop-blur-sm"
      >
        <span aria-hidden>❔</span>
        도움말
      </button>
      <AnimatePresence>
        {open && <GymHelpModal onClose={() => setOpen(false)} />}
      </AnimatePresence>
    </>
  );
}

/** 체육관 시스템 통합 안내 모달 — 처음 보는 사람도 이해할 수 있게.
 *  도전 조건 / 점령 효과 / 방어 덱 / 메달 / 보상 / 일일 보상 등. */
function GymHelpModal({ onClose }: { onClose: () => void }) {
  const reduce = useReducedMotion();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const releaseLock = lockBodyScroll();
    return () => {
      window.removeEventListener("keydown", onKey);
      releaseLock();
    };
  }, [onClose]);

  return (
    <Portal>
      <motion.div
        className="fixed inset-0 z-[140] bg-black/85 backdrop-blur-sm flex items-end md:items-center justify-center px-2 md:px-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="relative w-full max-w-md bg-zinc-950 border border-white/10 rounded-2xl flex flex-col overflow-hidden max-h-[92vh]"
          onClick={(e) => e.stopPropagation()}
          initial={reduce ? false : { y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { y: 24, opacity: 0 }}
        >
          <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2 bg-gradient-to-r from-amber-500/15 via-rose-500/10 to-fuchsia-500/15">
            <span aria-hidden className="text-base">📖</span>
            <h2 className="text-sm font-black text-white flex-1">
              체육관 시스템 — 처음이라면
            </h2>
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
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2 text-[12px] leading-relaxed text-zinc-200">
            {/* 핵심 한 줄 요약 — 처음 본 사람도 즉시 이해 */}
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.06] px-3 py-2 text-[12px] text-amber-100 leading-snug">
              <b className="text-white">PCL 10 펫 3마리</b>로 체육관 관장과
              3:3 배틀. 이기면 그 체육관을 점령하고 메달을 받습니다.
            </div>
            <Collapsible icon="⚔️" title="도전 방법">
              • 펫 3마리 모두 <b>체육관과 같은 속성</b> 이어야 합니다.<br />
              • PCL 등급 <b>10 슬랩만</b> 출전 가능.<br />
              • 내 <b>총 전투력</b>이 체육관 최소치 이상.<br />
              • 패배 시 8분 재도전 대기.
            </Collapsible>
            <Collapsible icon="🛡️" title="점령 후 보호 시간">
              점령 직후 <b>1시간</b> 동안 다른 트레이너의 도전을 받지 않아요.
              보호가 끝나면 누구나 도전 가능. 1,000만P 로 1시간 추가 연장 가능.
            </Collapsible>
            <Collapsible icon="🐾" title="방어 덱">
              점령 후 내 PCL 10 펫 3마리를 방어 덱으로 등록하면, 다른
              트레이너가 도전할 때 관장 대신 내 펫 3마리가 막아요.
              방어 덱에 등록된 카드는 펫 등록 슬롯에서 자동 빠집니다.
              <br />· 패배 시 <b>방어 덱 슬랩은 영구 삭제</b> 됩니다.
            </Collapsible>
            <Collapsible icon="🏅" title="메달 — 영구 업적">
              체육관 점령 시 해당 속성 메달이 계정에 영구 등록 (점령 잃어도
              그대로). 같은 메달은 1개만 — 중복 지급 X. 메달마다 고유한
              <b> 메달 전투력</b>이 총 전투력에 합산돼요.
            </Collapsible>
            <Collapsible icon="🎁" title="일일 보상">
              점령 중인 체육관에서 1일 1회 청구. 난이도가 높을수록 보상이
              커요. 체육관 단위 24시간 쿨타임.
            </Collapsible>
            <Collapsible icon="💪" title="총 전투력은 어떻게 결정되나요?">
              <b>총 전투력</b> = 전시 슬랩 + 도감 보너스 + 도감 세트효과 +
              펫 등록 전투력 + 메달 전투력. 펫 등록 전투력은 등급별 정액:
              MUR 40k · UR 20k · SAR 12k · SR 7k · MA 5k · AR 4k · RR 2k ·
              R 1k · U/C 0.5k. PCL 9 이하는 0점.
            </Collapsible>
            <Collapsible icon="📊" title="전투 능력치 결정 방식">
              펫 능력치 = <b>카드 희귀도</b> 기본값 + 총 전투력 비례 보정.
              체육관과 속성이 일치하면 공격력 +10%. 도전자는 항상 선공,
              방어자는 HP 보정 +10%. <b>MUR 카드는 공격/방어 모두 최고 효율</b>.
            </Collapsible>
            <Collapsible icon="💡" title="공략 팁">
              • 처음엔 가장 쉬운 풀 체육관부터 — 메달 확보 시 총 전투력 즉시 +10K.<br />
              • 점령 직후 일일 보상 1회 청구.<br />
              • MUR 슬랩은 도전/방어 모두 압도적 — 우선 확보.<br />
              • 도감을 채우면 총 전투력이 같이 올라가 더 강한 체육관 도전 가능.
            </Collapsible>
          </div>
        </motion.div>
      </motion.div>
    </Portal>
  );
}

/** 도움말 접기/펼치기 — 첫 화면은 제목만 보이고 클릭 시 본문 노출. */
function Collapsible({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2.5 flex items-center gap-2 text-left active:bg-white/5"
        style={{ touchAction: "manipulation" }}
      >
        <span aria-hidden>{icon}</span>
        <span className="text-[12px] font-black text-white flex-1">
          {title}
        </span>
        <span
          aria-hidden
          className={clsx(
            "text-[11px] text-zinc-400 transition-transform",
            open && "rotate-180"
          )}
        >
          ▾
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 text-[11.5px] leading-relaxed text-zinc-300 border-t border-white/5">
          <div className="pt-2">{children}</div>
        </div>
      )}
    </section>
  );
}