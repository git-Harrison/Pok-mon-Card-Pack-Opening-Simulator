"use client";

import Link from "next/link";
import Image from "next/image";
import { memo, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import type { Variants } from "framer-motion";
import { getCard, SET_ORDER, SETS } from "@/lib/sets";
import { formatKoreanPoints } from "@/lib/format";
import type { PsaGrading, SetCode } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import {
  fetchPsaGradings,
  fetchUserActivity,
  fetchUserRankings,
  fetchWallet,
  type RankingRow,
  type UserActivityEvent,
  type WalletSnapshot,
} from "@/lib/db";
import { fetchPokedex, type PokedexEntry } from "@/lib/pokedex";
import {
  BookIcon,
  HomeIcon,
  LeafIcon,
  MagnifyIcon,
  MuseumIcon,
  TrophyIcon,
  UserIcon,
  WalletIcon,
} from "./icons/NavIcons";

type NavIconType = (props: { className?: string }) => React.JSX.Element;

const ADMIN_LOGIN = "hun";

interface HomeStats {
  packsOpened: number;
  cards: number;
  slabs: number;
  pokedexCount: number;
  loading: boolean;
}

interface ActivityTeasers {
  latestSlab: { card_id: string; grade: number; graded_at: string } | null;
  latestWildWin: UserActivityEvent | null;
  pokedexToday: number;
  loading: boolean;
}

const FALLBACK_STATS: HomeStats = {
  packsOpened: 0,
  cards: 0,
  slabs: 0,
  pokedexCount: 0,
  loading: true,
};

const FALLBACK_TEASERS: ActivityTeasers = {
  latestSlab: null,
  latestWildWin: null,
  pokedexToday: 0,
  loading: true,
};

function fmtNumber(n: number): string {
  return n.toLocaleString("ko-KR");
}

function startOfTodayKstISO(): string {
  // KST = UTC+9. Truncate to day boundary in KST.
  const now = new Date();
  const utcMs = now.getTime();
  const kst = new Date(utcMs + 9 * 60 * 60 * 1000);
  kst.setUTCHours(0, 0, 0, 0);
  return new Date(kst.getTime() - 9 * 60 * 60 * 1000).toISOString();
}

export default function HomeView() {
  const reduce = useReducedMotion();
  const { user } = useAuth();

  const [stats, setStats] = useState<HomeStats>(FALLBACK_STATS);
  const [teasers, setTeasers] = useState<ActivityTeasers>(FALLBACK_TEASERS);
  const [topRankers, setTopRankers] = useState<RankingRow[]>([]);

  // One combined fetch — slabs and pokedex were previously fetched
  // twice (once for stats, once for teasers). Folding both effects
  // into a single Promise.all halves the request count and lets the
  // dashboard settle in a single paint instead of shimmering twice.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      try {
        const [wallet, slabs, pokedex, activity]: [
          WalletSnapshot,
          PsaGrading[],
          PokedexEntry[],
          UserActivityEvent[],
        ] = await Promise.all([
          fetchWallet(user.id),
          fetchPsaGradings(user.id),
          fetchPokedex(user.id),
          fetchUserActivity(user.id, "rank"),
        ]);
        if (!alive) return;
        const packs = Object.values(wallet.packsOpenedBySet).reduce(
          (a, b) => a + b,
          0
        );
        setStats({
          packsOpened: packs,
          cards: wallet.totalCards,
          slabs: slabs.length,
          pokedexCount: pokedex.length,
          loading: false,
        });
        const sortedSlabs = [...slabs].sort((a, b) =>
          a.graded_at < b.graded_at ? 1 : -1
        );
        const top = sortedSlabs[0] ?? null;
        const wildWin =
          activity.find(
            (e) =>
              e.source === "wild_win" ||
              /야생/.test(e.label) ||
              /승리/.test(e.label)
          ) ?? null;
        const todayIso = startOfTodayKstISO();
        const pokedexToday = pokedex.filter(
          (p) => p.registered_at >= todayIso
        ).length;
        setTeasers({
          latestSlab: top
            ? {
                card_id: top.card_id,
                grade: top.grade,
                graded_at: top.graded_at,
              }
            : null,
          latestWildWin: wildWin,
          pokedexToday,
          loading: false,
        });
      } catch {
        if (!alive) return;
        setStats((prev) => ({ ...prev, loading: false }));
        setTeasers((prev) => ({ ...prev, loading: false }));
      }
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  // Top 3 trainers for the "이번 주 강자" mini-leaderboard. Uses the same RPC
  // as /users so it stays in sync with the canonical ranking source.
  useEffect(() => {
    let alive = true;
    (async () => {
      const rows = await fetchUserRankings();
      if (!alive) return;
      setTopRankers(rows.slice(0, 3));
    })();
    return () => {
      alive = false;
    };
  }, []);

  const isAdmin = user?.user_id === ADMIN_LOGIN;

  // Stagger variants for set grid + nav tiles.
  // Cap stagger at 0.025/child so 6-pack grid finishes within 0.15s and the
  // 7-tile quick-nav finishes within 0.18s — feels snappy on mid-tier mobile
  // devices where the previous 0.06 step caused a visible "rolling" delay.
  const gridVariants: Variants = useMemo(
    () => ({
      hidden: {},
      show: {
        transition: {
          staggerChildren: reduce ? 0 : 0.025,
          delayChildren: reduce ? 0 : 0.06,
        },
      },
    }),
    [reduce]
  );
  const itemVariants: Variants = useMemo(
    () => ({
      hidden: reduce
        ? { opacity: 1, y: 0 }
        : { opacity: 0, y: 14, scale: 0.97 },
      show: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { duration: 0.36, ease: [0.2, 0.8, 0.2, 1] },
      },
    }),
    [reduce]
  );

  return (
    <div className="relative min-h-[calc(100vh-64px)] overflow-hidden">
      {/* ---------- Background ambience ---------- */}
      <BackgroundFx reduce={!!reduce} />

      <div className="relative max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10">
        {/* ---------- Hero ---------- */}
        <Hero reduce={!!reduce} displayName={user?.display_name ?? null} />

        {/* ---------- Quick stats strip ---------- */}
        {user ? (
          <QuickStats stats={stats} points={user.points} reduce={!!reduce} />
        ) : (
          <p className="mt-6 text-center text-xs text-zinc-500">
            로그인하면 내 카드·팩·슬랩 통계가 여기 표시돼요.
          </p>
        )}

        {/* ---------- Pack carousel/grid ---------- */}
        <section className="mt-10 md:mt-14">
          <SectionTitle
            label="팩 선택"
            sub="여섯 세트의 박스를 골라 한 팩씩 까보세요"
            reduce={!!reduce}
          />
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6"
            initial="hidden"
            animate="show"
            variants={gridVariants}
          >
            {SET_ORDER.map((code) => (
              <motion.div key={code} variants={itemVariants}>
                <PackTile code={code} />
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* ---------- Activity teasers ---------- */}
        {user && (
          <section className="mt-10 md:mt-14">
            <SectionTitle
              label="활동"
              sub="오늘의 트레이너 일지"
              reduce={!!reduce}
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
              <ActivityCard
                tone="amber"
                href="/wallet?tab=psa"
                title="최신 PCL 슬랩"
                emoji="💎"
                body={
                  teasers.loading ? (
                    <SkeletonLine />
                  ) : teasers.latestSlab ? (
                    <span>
                      <b className="text-amber-200">
                        PCL {teasers.latestSlab.grade}
                      </b>{" "}
                      <span className="text-zinc-400">·</span>{" "}
                      <span className="text-zinc-300">
                        {getCard(teasers.latestSlab.card_id)?.name ??
                          teasers.latestSlab.card_id}
                      </span>
                    </span>
                  ) : (
                    <span className="text-zinc-500">
                      아직 감별한 슬랩이 없어요
                    </span>
                  )
                }
                cta={teasers.latestSlab ? "지갑에서 보기" : "감별하러 가기"}
                ctaHref={teasers.latestSlab ? "/wallet?tab=psa" : "/grading"}
              />
              <ActivityCard
                tone="rose"
                href="/wild"
                title="최근 야생 활동"
                emoji="🌿"
                body={
                  teasers.loading ? (
                    <SkeletonLine />
                  ) : teasers.latestWildWin ? (
                    <span>
                      <span className="text-rose-200 font-semibold">
                        +{fmtNumber(teasers.latestWildWin.points)}p
                      </span>{" "}
                      <span className="text-zinc-400">·</span>{" "}
                      <span className="text-zinc-300">
                        {teasers.latestWildWin.label}
                      </span>
                    </span>
                  ) : (
                    <span className="text-zinc-500">
                      야생을 만나러 떠나볼까요?
                    </span>
                  )
                }
                cta="야생 배틀"
                ctaHref="/wild"
              />
              <ActivityCard
                tone="emerald"
                href="/pokedex"
                title="오늘의 도감 진척"
                emoji="📔"
                body={
                  teasers.loading ? (
                    <SkeletonLine />
                  ) : (
                    <span>
                      <b className="text-emerald-200">
                        오늘 +{teasers.pokedexToday}장
                      </b>{" "}
                      <span className="text-zinc-400">·</span>{" "}
                      <span className="text-zinc-300">
                        총 {fmtNumber(stats.pokedexCount)}장 박제
                      </span>
                    </span>
                  )
                }
                cta="도감 열기"
                ctaHref="/pokedex"
              />
            </div>
          </section>
        )}

        {/* ---------- Top 3 mini leaderboard ---------- */}
        {topRankers.length > 0 && (
          <section className="mt-10 md:mt-14">
            <SectionTitle
              label="이번 주 강자"
              sub="누적 랭킹 점수 상위"
              reduce={!!reduce}
            />
            <ol className="rounded-2xl border border-white/10 bg-white/[0.02] divide-y divide-white/5 overflow-hidden">
              {topRankers.map((row, idx) => (
                <li
                  key={row.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] transition"
                >
                  <span
                    className={
                      "shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-full text-xs font-black " +
                      (idx === 0
                        ? "bg-amber-400/20 text-amber-200 border border-amber-300/40"
                        : idx === 1
                        ? "bg-zinc-300/15 text-zinc-100 border border-zinc-200/30"
                        : "bg-orange-400/15 text-orange-200 border border-orange-300/30")
                    }
                  >
                    {idx + 1}
                  </span>
                  <Link
                    href={`/center/${row.user_id}`}
                    className="min-w-0 flex-1 truncate text-sm text-white hover:underline"
                  >
                    {row.display_name}
                  </Link>
                  <span className="shrink-0 text-xs text-zinc-400">
                    <b className="text-amber-200">
                      {fmtNumber(row.rank_score ?? 0)}
                    </b>
                    점
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* ---------- Footer-style nav grid ---------- */}
        <section className="mt-10 md:mt-14">
          <SectionTitle label="빠른 이동" reduce={!!reduce} />
          <motion.div
            className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2 md:gap-3"
            initial="hidden"
            animate="show"
            variants={gridVariants}
          >
            {NAV_ITEMS.filter((it) => !it.adminOnly || isAdmin).map((it) => (
              <motion.div key={it.href} variants={itemVariants}>
                <NavTile {...it} />
              </motion.div>
            ))}
          </motion.div>
        </section>

        <footer className="mt-12 text-center text-[11px] text-zinc-500 py-6 px-4">
          © {new Date().getFullYear()} Pokémon TCG Sim · 카드 이미지 저작권은
          The Pokémon Company / 포켓몬 코리아에 있습니다.
        </footer>
      </div>
    </div>
  );
}

/* ============================================================
 * Hero
 * ============================================================ */

function Hero({
  reduce,
  displayName,
}: {
  reduce: boolean;
  displayName: string | null;
}) {
  // Cycle the "blur-clear flicker" once per visit. If reduced motion is on,
  // skip the keyframes entirely.
  return (
    <section className="relative text-center max-w-3xl mx-auto pt-2">
      <motion.div
        className="flex items-center justify-center gap-2 flex-wrap mb-3"
        initial={reduce ? false : { opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: "easeOut" }}
      >
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold bg-white/5 border border-white/10 text-zinc-300 backdrop-blur">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_2px_rgba(52,211,153,0.8)]" />
          포켓몬 TCG 시뮬레이터
        </span>
      </motion.div>

      <motion.h1
        className="text-2xl sm:text-3xl md:text-5xl font-black tracking-tight leading-[1.15]"
        // The original "blur-flicker" keyframes (6→0→2→0px filter on a huge
        // gradient text node) were the single biggest paint hit on first
        // render — every blur step forces a full-text repaint. Collapse to
        // a single fade + tiny lift; the hero now draws in one frame on
        // mid-tier phones instead of stuttering through 4 filter phases.
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut", delay: 0.04 }}
      >
        <span className="bg-gradient-to-r from-amber-300 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent bg-[length:220%_100%] animate-[hero-sweep_8s_linear_infinite]">
          까고, 감별하고, 전시하고, 싸우자
        </span>
      </motion.h1>

      <motion.p
        className="mt-4 text-sm md:text-base text-zinc-300/90 max-w-xl mx-auto"
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut", delay: 0.18 }}
      >
        {displayName ? (
          <>
            <span className="text-amber-200 font-semibold">{displayName}</span>{" "}
            트레이너님, 다음 박스가 기다리고 있어요.
            <br className="hidden sm:block" />
            카드를 모으고, PCL을 찍고, 도감을 채우고, 야생에 도전하세요.
          </>
        ) : (
          <>
            한국어판 6세트 · 박스 개봉 · PCL 감별 · 센터 전시 · 야생 배틀 ·
            도감 박제까지, 트레이너의 한 시즌이 여기 있어요.
          </>
        )}
      </motion.p>

      <motion.div
        className="mt-5 flex items-center justify-center gap-2 flex-wrap"
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut", delay: 0.26 }}
      >
        <a
          href="#packs"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold bg-amber-400 text-zinc-900 hover:bg-amber-300 active:scale-[0.98] transition shadow-[0_8px_30px_-10px_rgba(251,191,36,0.7)]"
        >
          🎁 박스 고르기
        </a>
        <Link
          href="/grading"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold bg-white/5 border border-white/15 text-white hover:bg-white/10 transition"
        >
          🔎 감별하기
        </Link>
      </motion.div>

      {/* Local keyframes for the gradient sweep — safe to inline because Tailwind
          arbitrary-anim names just need the @keyframes to exist. */}
      <style jsx>{`
        @keyframes hero-sweep {
          0% {
            background-position: 0% 50%;
          }
          100% {
            background-position: 220% 50%;
          }
        }
      `}</style>
    </section>
  );
}

/* ============================================================
 * Quick stats
 * ============================================================ */

function QuickStats({
  stats,
  points,
  reduce,
}: {
  stats: HomeStats;
  points: number;
  reduce: boolean;
}) {
  const items = [
    { label: "지갑 포인트", value: formatKoreanPoints(points), tone: "amber" },
    { label: "개봉한 팩", value: stats.loading ? "—" : fmtNumber(stats.packsOpened), tone: "fuchsia" },
    { label: "보유 카드", value: stats.loading ? "—" : fmtNumber(stats.cards) + "장", tone: "cyan" },
    { label: "PCL 슬랩", value: stats.loading ? "—" : fmtNumber(stats.slabs) + "장", tone: "emerald" },
  ] as const;
  return (
    <motion.div
      className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, ease: "easeOut", delay: 0.32 }}
    >
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur px-3 py-2.5 md:px-4 md:py-3"
        >
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">
            {it.label}
          </div>
          <div
            className={
              "mt-0.5 text-base md:text-xl font-extrabold " +
              (it.tone === "amber"
                ? "text-amber-200"
                : it.tone === "fuchsia"
                ? "text-fuchsia-200"
                : it.tone === "cyan"
                ? "text-cyan-200"
                : "text-emerald-200")
            }
          >
            {it.value}
          </div>
        </div>
      ))}
    </motion.div>
  );
}

/* ============================================================
 * Pack tile (centerpiece)
 * ============================================================ */

const PackTile = memo(function PackTile({ code }: { code: SetCode }) {
  const set = SETS[code];
  return (
    <Link
      href={`/set/${set.code}`}
      id={set.code === SET_ORDER[0] ? "packs" : undefined}
      className="group relative block rounded-3xl overflow-hidden border border-white/10 bg-zinc-900/50 hover:border-white/20 transition shadow-xl"
      style={{
        boxShadow: `0 18px 50px -22px ${set.primaryColor}99`,
      }}
    >
      <div
        className="absolute inset-0 opacity-50 group-hover:opacity-90 transition-opacity pointer-events-none"
        style={{
          background: `radial-gradient(120% 80% at 50% 0%, ${set.primaryColor}66 0%, transparent 65%)`,
        }}
      />
      {/* Holographic sweep overlay on hover */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-60 transition-opacity duration-500 pointer-events-none mix-blend-screen"
        style={{
          background:
            "linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.18) 45%, transparent 60%)",
        }}
      />

      <div className="relative w-full aspect-[3/2] p-4 md:p-6">
        <div className="relative w-full h-full animate-bob">
          <Image
            src={set.boxImage}
            alt={`${set.name} 박스`}
            fill
            sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 30vw"
            className="object-contain drop-shadow-2xl select-none pointer-events-none"
            priority={code === SET_ORDER[0]}
            draggable={false}
          />
        </div>
      </div>

      <div className="relative p-4 md:p-5 border-t border-white/5 bg-black/40">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base md:text-lg font-bold text-white truncate">
              {set.name}
            </h3>
            <p className="text-[11px] md:text-xs text-zinc-400 mt-0.5 truncate">
              {set.subtitle}
            </p>
          </div>
          <span
            className="shrink-0 text-[10px] px-2 py-1 rounded-full border whitespace-nowrap"
            style={{
              color: set.accentColor,
              borderColor: `${set.primaryColor}66`,
              background: `${set.primaryColor}22`,
            }}
          >
            {set.releaseDate.slice(0, 4)}
          </span>
        </div>

        <dl className="mt-3 grid grid-cols-3 gap-1.5 md:gap-2 text-center">
          <Stat label="팩당" value={`${set.cardsPerPack}장`} />
          <Stat label="박스당" value={`${set.packsPerBox}팩`} />
          <Stat label="총" value={`${set.totalCards}종`} />
        </dl>

        <div
          className="mt-3 inline-flex items-center justify-center w-full gap-1 px-3 py-2 rounded-full text-xs font-bold border transition group-hover:scale-[1.02]"
          style={{
            color: set.accentColor,
            borderColor: `${set.primaryColor}88`,
            background: `${set.primaryColor}26`,
          }}
        >
          팩 열기 →
        </div>
      </div>
    </Link>
  );
});

const Stat = memo(function Stat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md bg-white/5 py-1.5 px-1 border border-white/5">
      <dt className="text-[9px] uppercase tracking-wider text-zinc-500">
        {label}
      </dt>
      <dd className="mt-0.5 text-xs md:text-sm font-semibold text-white">
        {value}
      </dd>
    </div>
  );
});

/* ============================================================
 * Activity cards
 * ============================================================ */

function ActivityCard({
  href,
  title,
  emoji,
  body,
  cta,
  ctaHref,
  tone,
}: {
  href: string;
  title: string;
  emoji: string;
  body: React.ReactNode;
  cta: string;
  ctaHref: string;
  tone: "amber" | "rose" | "emerald";
}) {
  const ring =
    tone === "amber"
      ? "from-amber-400/20 to-amber-400/0"
      : tone === "rose"
      ? "from-rose-400/20 to-rose-400/0"
      : "from-emerald-400/20 to-emerald-400/0";
  return (
    <Link
      href={href}
      className="group relative block rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20 transition overflow-hidden"
    >
      <div
        className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${ring}`}
      />
      <div className="p-4 md:p-5">
        <div className="flex items-center gap-2">
          <span className="text-lg">{emoji}</span>
          <h3 className="text-sm font-bold text-white">{title}</h3>
        </div>
        <div className="mt-2 text-sm text-zinc-200 min-h-[1.5rem]">{body}</div>
        <div className="mt-3 flex items-center justify-between">
          <Link
            href={ctaHref}
            className="text-[11px] font-semibold text-amber-200 hover:underline"
          >
            {cta} →
          </Link>
        </div>
      </div>
    </Link>
  );
}

function SkeletonLine() {
  return (
    <span className="inline-block h-3 w-32 rounded bg-white/10 animate-pulse" />
  );
}

/* ============================================================
 * Section title
 * ============================================================ */

function SectionTitle({
  label,
  sub,
  reduce,
}: {
  label: string;
  sub?: string;
  reduce?: boolean;
}) {
  return (
    <motion.div
      className="mb-3 md:mb-5 flex items-end justify-between gap-3"
      initial={reduce ? false : { opacity: 0, x: -6 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.32, ease: "easeOut" }}
    >
      <h2 className="text-base md:text-xl font-bold text-white">{label}</h2>
      {sub && (
        <p className="text-[11px] md:text-xs text-zinc-500 truncate">{sub}</p>
      )}
    </motion.div>
  );
}

/* ============================================================
 * Quick-nav tiles
 * ============================================================ */

interface NavItem {
  href: string;
  label: string;
  Icon: NavIconType;
  /** Tailwind classes: stroke + glow color theme per destination. */
  tint: string;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/wallet",
    label: "지갑",
    Icon: WalletIcon,
    tint: "text-amber-300 bg-amber-400/10 border-amber-400/30 hover:bg-amber-400/15 hover:border-amber-400/50 hover:shadow-[0_8px_22px_-12px_rgba(251,191,36,0.65)]",
  },
  {
    href: "/center",
    label: "센터",
    Icon: MuseumIcon,
    tint: "text-fuchsia-300 bg-fuchsia-400/10 border-fuchsia-400/30 hover:bg-fuchsia-400/15 hover:border-fuchsia-400/50 hover:shadow-[0_8px_22px_-12px_rgba(217,70,239,0.65)]",
  },
  {
    href: "/grading",
    label: "감별",
    Icon: MagnifyIcon,
    tint: "text-violet-300 bg-violet-400/10 border-violet-400/30 hover:bg-violet-400/15 hover:border-violet-400/50 hover:shadow-[0_8px_22px_-12px_rgba(168,85,247,0.65)]",
  },
  {
    href: "/wild",
    label: "야생",
    Icon: LeafIcon,
    tint: "text-emerald-300 bg-emerald-400/10 border-emerald-400/30 hover:bg-emerald-400/15 hover:border-emerald-400/50 hover:shadow-[0_8px_22px_-12px_rgba(52,211,153,0.65)]",
  },
  {
    href: "/pokedex",
    label: "도감",
    Icon: BookIcon,
    tint: "text-cyan-300 bg-cyan-400/10 border-cyan-400/30 hover:bg-cyan-400/15 hover:border-cyan-400/50 hover:shadow-[0_8px_22px_-12px_rgba(34,211,238,0.65)]",
  },
  {
    href: "/users",
    label: "랭킹",
    Icon: TrophyIcon,
    tint: "text-yellow-300 bg-yellow-400/10 border-yellow-400/30 hover:bg-yellow-400/15 hover:border-yellow-400/50 hover:shadow-[0_8px_22px_-12px_rgba(250,204,21,0.65)]",
  },
  {
    href: "/profile",
    label: "프로필",
    Icon: UserIcon,
    tint: "text-sky-300 bg-sky-400/10 border-sky-400/30 hover:bg-sky-400/15 hover:border-sky-400/50 hover:shadow-[0_8px_22px_-12px_rgba(56,189,248,0.65)]",
  },
  {
    href: "/admin",
    label: "관리자",
    Icon: HomeIcon,
    tint: "text-rose-300 bg-rose-400/10 border-rose-400/30 hover:bg-rose-400/15 hover:border-rose-400/50 hover:shadow-[0_8px_22px_-12px_rgba(244,63,94,0.65)]",
    adminOnly: true,
  },
];

const NavTile = memo(function NavTile({ href, label, Icon, tint }: NavItem) {
  return (
    <Link
      href={href}
      className={`group flex flex-col items-center justify-center gap-1.5 rounded-2xl border transition aspect-square px-2 py-3 active:scale-[0.97] ${tint}`}
    >
      <Icon className="w-7 h-7 md:w-8 md:h-8 group-hover:scale-110 transition-transform" />
      <span className="text-[11px] md:text-xs font-semibold text-zinc-100 group-hover:text-white">
        {label}
      </span>
    </Link>
  );
});

/* ============================================================
 * Background ambience
 * ============================================================ */

function BackgroundFx({ reduce }: { reduce: boolean }) {
  // Generate stars once. Fixed seed via deterministic spacing so SSR/CSR
  // markup matches and React doesn't complain about hydration drift.
  const stars = useMemo(() => {
    const out: { x: number; y: number; r: number; d: number; o: number }[] =
      [];
    for (let i = 0; i < 28; i++) {
      out.push({
        x: ((i * 137) % 100) + ((i * 31) % 7) / 7,
        y: ((i * 61) % 100) + ((i * 17) % 5) / 5,
        r: 0.6 + ((i * 13) % 5) * 0.18,
        d: 2 + ((i * 7) % 5) * 0.6,
        o: 0.25 + ((i * 11) % 6) * 0.08,
      });
    }
    return out;
  }, []);

  // Suppress SSR-only render of motion stars to avoid hydration mismatch on
  // delay/random values; render them after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Aurora blobs */}
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[820px] h-[820px] rounded-full bg-fuchsia-500/10 blur-3xl" />
      <div className="absolute top-40 -left-20 w-[420px] h-[420px] rounded-full bg-amber-400/8 blur-3xl" />
      <div className="absolute top-20 -right-20 w-[420px] h-[420px] rounded-full bg-cyan-400/8 blur-3xl" />

      {/* Pokeball pattern (subtle) */}
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "radial-gradient(circle at center, rgba(255,255,255,0.6) 0 2px, transparent 2px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Star field */}
      <AnimatePresence>
        {mounted && !reduce && (
          <motion.svg
            key="stars"
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
          >
            {stars.map((s, i) => (
              <motion.circle
                key={i}
                cx={s.x}
                cy={s.y}
                r={s.r * 0.18}
                fill="white"
                initial={{ opacity: 0 }}
                animate={{ opacity: [s.o * 0.3, s.o, s.o * 0.3] }}
                transition={{
                  duration: s.d,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: (i % 7) * 0.3,
                }}
              />
            ))}
          </motion.svg>
        )}
      </AnimatePresence>
    </div>
  );
}
