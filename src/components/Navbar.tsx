"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useAuth } from "@/lib/auth";
import { fetchUnseenGiftCount } from "@/lib/db";
import { resolvePageHelp } from "@/lib/page-help";
import { useRealtimeInbox } from "@/lib/useRealtimeInbox";
import HelpButton from "./HelpButton";
import WalletPill from "./WalletPill";
import {
  BookIcon,
  GiftIcon,
  GymIcon,
  HomeIcon,
  LeafIcon,
  MagnifyIcon,
  MuseumIcon,
  TrophyIcon,
  UserIcon,
  WalletIcon,
} from "./icons/NavIcons";

const NAV_ITEMS = [
  // ── Primary (모바일 하단 바, 좌→우 순서) ──
  { href: "/",        label: "홈",     Icon: HomeIcon },
  { href: "/grading", label: "등급",   Icon: MagnifyIcon },
  { href: "/pokedex", label: "도감",   Icon: BookIcon },
  { href: "/gym",     label: "체육관", Icon: GymIcon },
  { href: "/wild",    label: "야생",   Icon: LeafIcon },
  { href: "/profile", label: "프로필", Icon: UserIcon },
  // ── 더보기 시트 (위 6개 외) ──
  { href: "/users",   label: "랭킹",   Icon: TrophyIcon },
  { href: "/center",  label: "센터",   Icon: MuseumIcon },
  { href: "/wallet",  label: "지갑",   Icon: WalletIcon },
  { href: "/gifts",   label: "선물함", Icon: GiftIcon },
];

// 모바일 하단 바에 띄울 6개. 그 외는 더보기 시트로.
const MOBILE_PRIMARY = ["/", "/grading", "/pokedex", "/gym", "/wild", "/profile"];

// Header title shown next to the logo. Mobile only — saves vertical
// space by replacing the per-page <h1>. Long page names live in the
// page-specific override below; otherwise NAV_ITEMS' label is used.
const HEADER_TITLE_OVERRIDES: Record<string, string> = {
  "/": "포켓몬 카드깡",
  "/wallet": "내 카드지갑",
  "/center": "내 포켓몬센터",
  "/grading": "PCL 감정실",
  "/users": "사용자 랭킹",
  "/profile": "내 프로필",
  "/gifts": "선물함",
  "/wild": "야생 배틀",
  "/gym": "체육관 지도",
  "/pokedex": "도감",
  "/admin": "관리자",
  "/login": "로그인",
  "/signup": "회원가입",
};

function resolveHeaderTitle(pathname: string): string {
  if (HEADER_TITLE_OVERRIDES[pathname]) return HEADER_TITLE_OVERRIDES[pathname];
  if (pathname.startsWith("/center/")) return "방문 센터";
  if (pathname.startsWith("/card/")) return "카드 상세";
  if (pathname.startsWith("/set/")) return "박스 개봉";
  return "포켓몬 카드깡";
}

export default function Navbar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const isPublic = pathname === "/login" || pathname === "/signup";
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  const pageHelp = useMemo(() => resolvePageHelp(pathname), [pathname]);

  // Gift badge: count of pending received gifts that haven't been
  // viewed yet. Refreshes on route change so visiting /gifts (which
  // marks them viewed) clears the dot on next nav transition.
  const [giftBadge, setGiftBadge] = useState(0);
  const userId = user?.id ?? null;
  const refreshGiftBadge = useCallback(() => {
    if (!userId) {
      setGiftBadge(0);
      return;
    }
    fetchUnseenGiftCount(userId).then((n) => setGiftBadge(n));
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setGiftBadge(0);
      return;
    }
    let canceled = false;
    fetchUnseenGiftCount(userId).then((n) => {
      if (!canceled) setGiftBadge(n);
    });
    return () => {
      canceled = true;
    };
  }, [userId, pathname]);

  useRealtimeInbox(userId, undefined, refreshGiftBadge);

  return (
    <>
      {/* ─── Top bar (always sticky) ─── */}
      <header className="sticky top-0 z-40 bg-black/85 md:bg-black/40 md:backdrop-blur-md border-b border-white/10">
        <div className="max-w-6xl mx-auto px-3 md:px-6 h-14 flex items-center justify-between gap-2">
          <Link
            href={user ? "/" : "/login"}
            className="flex items-center gap-2 shrink-0 min-w-0"
          >
            <span className="relative inline-flex w-7 h-7 rounded-full bg-gradient-to-b from-red-500 to-red-700 shadow-lg shadow-red-500/30 shrink-0">
              <span className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 bg-black/80" />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white border-2 border-black/80" />
            </span>
            <span className="text-sm md:text-base font-bold tracking-tight text-white truncate">
              {resolveHeaderTitle(pathname)}
            </span>
          </Link>

          {/* Desktop: inline nav */}
          {user && (
            <nav className="hidden md:flex items-center gap-1">
              {NAV_ITEMS.map(({ href, label }) => {
                const showBadge = href === "/gifts" && giftBadge > 0;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={clsx(
                      "relative px-3 py-1.5 text-sm rounded-md transition-colors",
                      pathname === href
                        ? "bg-white/10 text-white"
                        : "text-zinc-300 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    {label === "등급"
                      ? "등급 감별"
                      : label === "랭킹"
                      ? "사용자 랭킹"
                      : label === "야생"
                      ? "야생 배틀"
                      : label === "도감"
                      ? "PCL 도감"
                      : label === "프로필"
                      ? "내 프로필"
                      : label === "지갑"
                      ? "내 카드지갑"
                      : label === "센터"
                      ? "내 포켓몬센터"
                      : label}
                    {showBadge && (
                      <span className="absolute -top-0.5 -right-1 min-w-[18px] h-[18px] rounded-full bg-rose-500 text-white text-[10px] font-black px-1 inline-flex items-center justify-center ring-2 ring-black/40">
                        {giftBadge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          )}

          {/* Right side: points + user + help (always compact) */}
          {user ? (
            <div className="flex items-center gap-2">
              {user.user_id === "hun" && (
                <Link
                  href="/admin"
                  aria-label="관리자"
                  title="관리자"
                  className="inline-flex items-center h-8 px-2 rounded-md bg-amber-400/15 border border-amber-400/40 text-amber-200 text-[11px] font-bold hover:bg-amber-400/25"
                >
                  👑
                </Link>
              )}
              <WalletPill points={user.points} size="sm" />
              {pageHelp && (
                <HelpButton
                  iconOnly
                  size="sm"
                  title={pageHelp.title}
                  sections={pageHelp.sections}
                />
              )}
            </div>
          ) : (
            !isPublic && (
              <Link
                href="/login"
                className="text-xs px-3 py-1.5 rounded-md bg-white/10 text-white hover:bg-white/15"
              >
                로그인
              </Link>
            )
          )}
        </div>
      </header>

      {/* ─── Bottom tab bar (mobile only) ─── */}
      {user && (
        <>
          <nav
            className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-black/92 border-t border-white/10"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <ul className="flex items-stretch justify-around h-16">
              {NAV_ITEMS.filter((item) =>
                MOBILE_PRIMARY.includes(item.href)
              ).map(({ href, label, Icon }) => {
                const active =
                  pathname === href ||
                  (href !== "/" && pathname.startsWith(href));
                return (
                  <li key={href} className="flex-1 min-w-0">
                    <Link
                      href={href}
                      prefetch
                      style={{ touchAction: "manipulation" }}
                      className={clsx(
                        "relative h-full flex flex-col items-center justify-center gap-0.5 transition-colors",
                        active
                          ? "text-amber-300"
                          : "text-zinc-400 hover:text-white"
                      )}
                    >
                      <Icon className="w-6 h-6" />
                      <span className="text-[10px] font-medium">{label}</span>
                    </Link>
                  </li>
                );
              })}
              <li className="flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => setMoreOpen(true)}
                  aria-label="더보기"
                  style={{ touchAction: "manipulation" }}
                  className={clsx(
                    "relative h-full w-full flex flex-col items-center justify-center gap-0.5 transition",
                    moreOpen ||
                      NAV_ITEMS.some(
                        (i) =>
                          !MOBILE_PRIMARY.includes(i.href) &&
                          (pathname === i.href ||
                            (i.href !== "/" && pathname.startsWith(i.href)))
                      )
                      ? "text-amber-300"
                      : "text-zinc-400 hover:text-white"
                  )}
                >
                  <span className="w-6 h-6 inline-flex items-center justify-center text-2xl leading-none">
                    ⋯
                  </span>
                  <span className="text-[10px] font-medium">더보기</span>
                  {giftBadge > 0 && (
                    <span className="absolute top-1.5 right-1/4 min-w-[18px] h-[18px] rounded-full bg-rose-500 text-white text-[10px] font-black px-1 inline-flex items-center justify-center ring-2 ring-black/60 translate-x-1/2">
                      {giftBadge}
                    </span>
                  )}
                </button>
              </li>
            </ul>
          </nav>

          {moreOpen && (
            <div
              className="md:hidden fixed inset-0 z-[60] bg-black/85 flex items-end"
              onClick={() => setMoreOpen(false)}
            >
              <div
                className="w-full bg-zinc-950 border-t border-white/10 rounded-t-2xl"
                style={{
                  paddingBottom:
                    "calc(env(safe-area-inset-bottom) + 1rem)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between h-12 px-4 border-b border-white/10">
                  <span className="text-sm font-bold text-white">더보기</span>
                  <button
                    type="button"
                    onClick={() => setMoreOpen(false)}
                    aria-label="닫기"
                    className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white inline-flex items-center justify-center"
                  >
                    ✕
                  </button>
                </div>
                <ul className="grid grid-cols-2 gap-2 p-3">
                  {NAV_ITEMS.filter(
                    (item) => !MOBILE_PRIMARY.includes(item.href)
                  ).map(({ href, label, Icon }) => {
                    const active =
                      pathname === href ||
                      (href !== "/" && pathname.startsWith(href));
                    const showBadge = href === "/gifts" && giftBadge > 0;
                    return (
                      <li key={href}>
                        <Link
                          href={href}
                          prefetch
                          onClick={() => setMoreOpen(false)}
                          style={{ touchAction: "manipulation" }}
                          className={clsx(
                            "relative h-14 px-3 rounded-xl flex items-center gap-2 border transition-colors",
                            active
                              ? "bg-amber-400/15 border-amber-400/40 text-amber-200"
                              : "bg-white/5 border-white/10 text-zinc-200 hover:bg-white/10"
                          )}
                        >
                          <Icon className="w-5 h-5 shrink-0" />
                          <span className="text-sm font-bold truncate">
                            {label}
                          </span>
                          {showBadge && (
                            <span className="ml-auto min-w-[20px] h-5 rounded-full bg-rose-500 text-white text-[10px] font-black px-1.5 inline-flex items-center justify-center">
                              {giftBadge}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
