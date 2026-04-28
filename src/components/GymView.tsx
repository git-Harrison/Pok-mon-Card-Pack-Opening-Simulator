"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import clsx from "clsx";
import { useAuth } from "@/lib/auth";
import {
  claimGymDaily,
  computeUserCenterPower,
  extendGymProtection,
  fetchGymsState,
  startGymChallenge,
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
import { slabStats } from "@/lib/wild/stats";
import { getCard } from "@/lib/sets";
import type { Rarity } from "@/lib/types";
import type { DefenderPokemonInfo } from "@/lib/gym/types";
import { CenteredPokeLoader } from "./PokeLoader";
import PageHeader from "./PageHeader";
import Portal from "./Portal";
import GymChallengeOverlay from "./GymChallengeOverlay";
import GymMedalIcon from "./GymMedalIcon";
import GymDefenseDeckModal from "./GymDefenseDeckModal";

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

  if (loading) return <CenteredPokeLoader />;

  return (
    <div className="relative max-w-3xl mx-auto px-3 md:px-6 py-3 md:py-6 fade-in">
      <PageHeader
        title="🏟️ 체육관 지도"
        subtitle="속성별 8개 체육관. 관장을 이기면 점령 + 메달."
        tone="amber"
      />

      <GymTownMap
        gyms={gyms}
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
                "10,000,000P를 사용해 보호를 1시간 연장할까요?"
              );
              if (!ok) return;
              const res = await extendGymProtection(userId, selectedGym.id);
              if (!res.ok) {
                alert(res.error ?? "보호 연장 실패");
              } else {
                alert(
                  "10,000,000P를 사용해 체육관 보호시간을 1시간 연장했습니다."
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
  myUserId,
  centerPower,
  onSelect,
  reduce,
}: {
  gyms: Gym[];
  myUserId: string | null;
  centerPower: number | null;
  onSelect: (id: string) => void;
  reduce: boolean;
}) {
  return (
    <div
      className="mt-4 relative w-full max-w-md mx-auto aspect-[10/13] rounded-2xl overflow-hidden border-4 border-emerald-900 shadow-[0_0_0_2px_rgba(16,185,129,0.4),0_8px_24px_rgba(0,0,0,0.5)]"
      style={{ imageRendering: "pixelated" }}
    >
      <PixelTownBackground />

      {/* 동선 — 체육관 사이 path. SVG 위에 absolute 배치. */}
      <PixelRoutes />

      {/* 체육관 핀 — HTML 버튼 (touch / accessibility 위해). */}
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
  // 정해진 좌표 사이를 점선 path 로 잇는다. 모든 좌표 정수.
  // (psychic 18,10) → (ground 34,28) → (rock 18,52) → (electric 50,48) →
  // (fire 80,50) → (ice 72,18) ↑↑
  // (electric 50,48) → (grass 22,78) / (water 62,82)
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 100 130"
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      aria-hidden
    >
      <g stroke="#fcd34d" strokeWidth="0.6" strokeDasharray="1.2 1.4" fill="none">
        <path d="M18 10 L34 28" />
        <path d="M34 28 L50 48" />
        <path d="M50 48 L18 52" />
        <path d="M50 48 L80 50" />
        <path d="M50 48 L22 82" />
        <path d="M50 48 L62 86" />
        <path d="M72 18 L80 50" />
      </g>
    </svg>
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

  // 전투력 부족 — 버튼은 클릭 가능하게 두고, 클릭 시 NPC 도발 모달.
  const underpowered =
    centerPower !== null && centerPower < gym.min_power;
  // 보호/도전 중/쿨타임/내 소유 → 버튼 자체 disable.
  const challengeDisabled =
    status === "protected" ||
    status === "challenge_active" ||
    status === "user_cooldown" ||
    status === "owned_by_me";

  // 도발 모달 노출 상태 — 전투력 부족 클릭 시 set.
  const [tauntOpen, setTauntOpen] = useState(false);
  const [tauntLine, setTauntLine] = useState<string>("");

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
                {gym.ownership && (
                  <p className="text-[10px] text-fuchsia-200 truncate mt-0.5">
                    🏆 점령한 체육관장:{" "}
                    <b className="text-white">{gym.ownership.display_name}</b>
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

          </div>

          {/* Footer — CTA */}
          <div className="border-t border-white/10 p-3 bg-zinc-950/95 space-y-2">
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
                🛡️ 1시간 보호 연장 (10,000,000P)
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
                    setTauntLine(pickLine(TAUNT_LINES));
                    setTauntOpen(true);
                    return;
                  }
                  onStartChallenge();
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

      {/* 전투력 부족 — 관장 NPC 도발 모달 (위 detail modal 위에 스택) */}
      <AnimatePresence>
        {tauntOpen && (
          <UnderpoweredTauntDialog
            gym={gym}
            line={tauntLine}
            centerPower={centerPower ?? 0}
            onClose={() => setTauntOpen(false)}
          />
        )}
      </AnimatePresence>
    </Portal>
  );
}

/* ─────────────── Underpowered taunt dialog ─────────────── */

function UnderpoweredTauntDialog({
  gym,
  line,
  centerPower,
  onClose,
}: {
  gym: Gym;
  line: string;
  centerPower: number;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  const typeStyle = TYPE_STYLE[gym.type];
  return (
    <motion.div
      className="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center px-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="relative w-full max-w-sm bg-zinc-950 border border-white/10 rounded-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        initial={reduce ? false : { y: 12, opacity: 0, scale: 0.96 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={reduce ? { opacity: 0 } : { y: 12, opacity: 0 }}
      >
        {/* 헤더 — 관장 정보 */}
        <div
          className={clsx(
            "px-4 py-3 border-b border-white/10",
            "bg-gradient-to-br from-zinc-900 to-zinc-950"
          )}
        >
          <span aria-hidden className={clsx("absolute inset-0 opacity-30 pointer-events-none", typeStyle.glow)} />
          <p className="text-[10px] uppercase tracking-wider text-rose-300/85 mb-0.5">
            ▍{gym.name} 관장
          </p>
          <p className="text-base font-black text-white">{gym.leader_name}</p>
        </div>

        {/* NPC 도트 캐릭터 — 텍스트 + 풍선 */}
        <div className="p-4 flex items-start gap-3">
          <div className="shrink-0">
            <NpcSprite type={gym.type} />
          </div>
          <div className="min-w-0 flex-1">
            {/* 말풍선 */}
            <div className="relative rounded-xl bg-white text-zinc-900 px-3 py-2 text-[12px] font-bold leading-snug">
              {line}
              <span
                aria-hidden
                className="absolute top-3 -left-1.5 w-0 h-0 border-y-[6px] border-y-transparent border-r-[7px] border-r-white"
              />
            </div>
            <div className="mt-2 text-[10px] text-zinc-400 tabular-nums">
              내 전투력{" "}
              <b className="text-white">{centerPower.toLocaleString("ko-KR")}</b>
              <span className="mx-1">/</span>
              필요{" "}
              <b className="text-rose-300">
                {gym.min_power.toLocaleString("ko-KR")}
              </b>
            </div>
          </div>
        </div>

        {/* CTA — 그냥 닫기 */}
        <div className="border-t border-white/10 p-3">
          <button
            type="button"
            onClick={onClose}
            style={{ touchAction: "manipulation" }}
            className="w-full h-11 rounded-xl bg-white/10 border border-white/15 text-white font-bold text-sm active:scale-[0.98]"
          >
            물러난다
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** 단순 도트 NPC 트레이너 — 모자 + 머리 + 몸. type 색 모자 + 빨간 옷.
 *  이미지 에셋 없이 SVG 만으로. */
function NpcSprite({ type }: { type: WildType }) {
  const c = TYPE_STYLE[type as keyof typeof TYPE_STYLE];
  void c;
  return (
    <svg viewBox="0 0 24 24" width={56} height={56} shapeRendering="crispEdges" aria-hidden>
      {/* 모자 */}
      <rect x="6"  y="3"  width="12" height="2" fill="#dc2626" />
      <rect x="5"  y="5"  width="14" height="1" fill="#7f1d1d" />
      <rect x="9"  y="6"  width="6"  height="1" fill="#fbbf24" />
      {/* 머리 */}
      <rect x="8"  y="6"  width="8"  height="6" fill="#fde68a" />
      <rect x="9"  y="8"  width="1"  height="1" fill="#0f172a" />
      <rect x="14" y="8"  width="1"  height="1" fill="#0f172a" />
      <rect x="11" y="10" width="2"  height="1" fill="#7f1d1d" />
      {/* 몸 (조끼) */}
      <rect x="6"  y="12" width="12" height="6" fill="#dc2626" />
      <rect x="6"  y="12" width="12" height="1" fill="#7f1d1d" />
      <rect x="11" y="13" width="2"  height="4" fill="#fbbf24" />
      {/* 팔 */}
      <rect x="4"  y="13" width="2"  height="4" fill="#fde68a" />
      <rect x="18" y="13" width="2"  height="4" fill="#fde68a" />
      {/* 다리 */}
      <rect x="8"  y="18" width="3"  height="4" fill="#1e3a8a" />
      <rect x="13" y="18" width="3"  height="4" fill="#1e3a8a" />
      {/* 신발 */}
      <rect x="7"  y="22" width="4"  height="1" fill="#0f172a" />
      <rect x="13" y="22" width="4"  height="1" fill="#0f172a" />
    </svg>
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
  const sameAsGym = defender.type === gymType;
  const card = getCard(defender.card_id);
  const cardName = card?.name ?? defender.card_id;
  const dex = lookupDex(cardName);
  // 메가/특수 폼 카드 sprite 우선 (메가 리자몽 X, 메가가디안 등 — gen5
  // BW 에 없는 폼). 매칭 없으면 dex 기반 PokeAPI sprite 로 fallback.
  const megaSprite = cardSpriteUrl(cardName);
  const baseStats = slabStats(
    (card?.rarity ?? defender.rarity) as Rarity,
    defender.grade
  );
  const [broken, setBroken] = useState(false);
  const [megaBroken, setMegaBroken] = useState(false);
  return (
    <div className="relative rounded-lg border bg-zinc-900/60 p-2 flex flex-col items-center gap-1 border-fuchsia-400/30">
      <div className="relative w-14 h-14 shrink-0 overflow-hidden flex items-center justify-center">
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
        ) : !broken && card?.imageUrl ? (
          <img
            src={card.imageUrl}
            alt={cardName}
            draggable={false}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setBroken(true)}
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <span className="text-[10px] text-zinc-400 text-center px-1">
            {cardName}
          </span>
        )}
      </div>
      <p className="text-[10px] font-bold text-white truncate max-w-full">
        {cardName}
      </p>
      <div className="flex items-center gap-1">
        <span className={clsx("px-1 py-0.5 rounded text-[8px] font-black", style.badge)}>
          {defender.type}
        </span>
        {sameAsGym && (
          <span className="text-[8px] text-amber-300 font-bold">★</span>
        )}
      </div>
      <ul className="text-[9px] text-zinc-300 grid grid-cols-2 gap-x-1 gap-y-0 w-full leading-tight tabular-nums">
        <li>HP {baseStats.hp}</li>
        <li>ATK {baseStats.atk}</li>
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
        : "🎁 일일 보상 받기 (+20,000,000P · 랭킹 +10,000)"}
    </button>
  );
}

/** /gym 페이지 우하단 floating 도움말 버튼. position: fixed 라 본문
 *  레이아웃에 영향 X. 클릭 시 전체 화면 모달로 시스템 안내. */
function GymHelpButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="체육관 도움말"
        style={{ touchAction: "manipulation" }}
        className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] md:right-6 md:bottom-6 z-30 w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-rose-500 text-zinc-950 font-black text-lg shadow-[0_10px_28px_-8px_rgba(244,114,128,0.6)] flex items-center justify-center hover:scale-105 active:scale-95 transition"
      >
        ?
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
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
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
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3 text-[12px] leading-relaxed text-zinc-200">
            <Section icon="⚔️" title="기본 — 도전과 점령">
              체육관 8곳은 각자 고유 속성(풀/물/바위/전기/불꽃/땅/얼음/에스퍼).
              관장 NPC 또는 점령자의 방어 덱과 3:3 펫 배틀로 도전 가능.
              승리하면 그 체육관의 새 소유자가 됩니다.
            </Section>
            <Section icon="🎯" title="도전 조건">
              • 도전 펫 3마리 모두 <b>체육관 속성과 동일</b>해야 합니다.<br />
              • 내 <b>전투력(center_power)</b>이 체육관 최소치 이상.<br />
              • 같은 체육관에 다른 사람이 도전 중이면 대기.<br />
              • 패배 시 8분 재도전 쿨타임.
            </Section>
            <Section icon="🛡️" title="점령 효과 — 보호 시간">
              점령 직후 <b>1시간 보호</b> — 다른 트레이너 도전 불가.
              보호 끝난 뒤에는 누구나 도전 가능. 소유자는 10,000,000P 결제로
              보호를 추가 1시간 연장 가능.
            </Section>
            <Section icon="🐾" title="방어 덱 (점령자 전용)">
              내 PCL10 펫 3마리(체육관 속성 동일)를 <b>방어 덱</b>으로 셋업.
              다른 트레이너가 도전하면 NPC 대신 이 3마리가 등장.<br />
              • 방어 덱에 든 펫은 펫 슬롯에서 자동 빠짐 (전투력은 그대로 합산).<br />
              • <b>MUR 카드는 도전/방어 양측 동일</b>하게 효율 ×2 + 캡 ×10
              적용 — 같은 power 면 MUR 이 비-MUR 을 압도.<br />
              • 다른 사람에게 점령당하면 방어 덱 슬랩 <b>영구 삭제</b> + pet_score
              감소.
            </Section>
            <Section icon="💪" title="전투력(center_power) 버프">
              체육관 1개 점령 = <b>전투력 +10,000</b> 자동 추가. 여러 곳을
              점령할수록 누적 — 도감/펫/전시 외 별도 보너스.
            </Section>
            <Section icon="🏅" title="메달">
              체육관을 점령할 때마다 그 속성의 고유 메달이 계정에 등록.
              같은 메달은 <b>1개씩만</b> 보유 — 이미 있으면 no-op. 메달은
              <b>영구</b> 보존(점령 잃어도 그대로). 프로필 헤더 / 랭킹 행
              에 노출.
            </Section>
            <Section icon="🎁" title="일일 보상 — 24시간 쿨타임">
              점령 중인 체육관에서 1일 1회 청구: <b>+20,000,000P · 랭킹 +10,000</b>.<br />
              체육관 단위 24h 쿨타임 — 다른 사람이 점령해도 이전 청구 시점
              부터 계산 유지.
            </Section>
            <Section icon="📊" title="전투 공식 요약">
              펫 능력치 = 카드 기본 스탯(slabStats) + center_power 비례 보너스.
              슬롯 1/2/3 = ATK 보너스 비율 10% / 8% / 6%, 캡 = 기본 ATK × 5.
              <b>MUR 카드는 양측 동일 ×2 효율 + 캡 ×10</b>. 속성 상성 표
              (2× / 0.5×) 적용.
            </Section>
            <Section icon="💡" title="팁">
              • 첫 도전은 가장 약한 체육관 1개로 메달 + 점령 버프 +10,000 확보.<br />
              • 점령 직후 일일 보상 1회 청구 → 랭킹 +10,000 즉시 반영.<br />
              • <b>MUR 슬랩</b>은 도전/방어 모두 강력 — power 동등 시 비-MUR 압도.<br />
              • 도감/펫/전시 전투력으로 min_power 부족 시 도감 채우기 우선.
            </Section>
          </div>
        </motion.div>
      </motion.div>
    </Portal>
  );
}

/** 도움말 모달 내부 카드 1개 — 아이콘 + 제목 + 본문. */
function Section({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <h3 className="text-[12px] font-black text-white mb-1 inline-flex items-center gap-1.5">
        <span aria-hidden>{icon}</span>
        {title}
      </h3>
      <div className="text-[11.5px] leading-relaxed text-zinc-300">
        {children}
      </div>
    </section>
  );
}