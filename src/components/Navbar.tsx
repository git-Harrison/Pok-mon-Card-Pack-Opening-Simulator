"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useAuth } from "@/lib/auth";
import PointsChip from "./PointsChip";
import {
  GiftIcon,
  HomeIcon,
  LogoutIcon,
  MagnifyIcon,
  ShopIcon,
  TrophyIcon,
  WalletIcon,
} from "./icons/NavIcons";

const NAV_ITEMS = [
  { href: "/", label: "홈", Icon: HomeIcon },
  { href: "/wallet", label: "지갑", Icon: WalletIcon },
  { href: "/merchant", label: "상인", Icon: ShopIcon },
  { href: "/grading", label: "등급", Icon: MagnifyIcon },
  { href: "/users", label: "랭킹", Icon: TrophyIcon },
  { href: "/gifts", label: "선물함", Icon: GiftIcon },
];

export default function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const isPublic = pathname === "/login" || pathname === "/signup";

  return (
    <>
      {/* ─── Top bar (always sticky) ─── */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-black/40 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-3 md:px-6 h-14 flex items-center justify-between gap-2">
          <Link
            href={user ? "/" : "/login"}
            className="flex items-center gap-2 shrink-0"
          >
            <span className="relative inline-flex w-7 h-7 rounded-full bg-gradient-to-b from-red-500 to-red-700 shadow-lg shadow-red-500/30">
              <span className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 bg-black/80" />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white border-2 border-black/80" />
            </span>
            <span className="text-sm md:text-base font-bold tracking-tight text-white">
              <span className="hidden sm:inline">포켓몬 </span>카드깡
            </span>
          </Link>

          {/* Desktop: inline nav */}
          {user && (
            <nav className="hidden md:flex items-center gap-1">
              {NAV_ITEMS.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className={clsx(
                    "px-3 py-1.5 text-sm rounded-md transition-colors",
                    pathname === href
                      ? "bg-white/10 text-white"
                      : "text-zinc-300 hover:bg-white/5 hover:text-white"
                  )}
                >
                  {label === "지갑"
                    ? "내 카드지갑"
                    : label === "상인"
                    ? "카드 상인"
                    : label === "등급"
                    ? "등급 감별"
                    : label === "랭킹"
                    ? "사용자 랭킹"
                    : label}
                </Link>
              ))}
            </nav>
          )}

          {/* Right side: points + user + logout (always compact) */}
          {user ? (
            <div className="flex items-center gap-2">
              <PointsChip points={user.points} size="sm" />
              <span className="hidden sm:inline text-xs text-zinc-400">
                <span className="text-zinc-200 font-semibold">{user.display_name}</span>
              </span>
              <button
                onClick={logout}
                aria-label="로그아웃"
                className="w-9 h-9 flex items-center justify-center rounded-md text-zinc-400 hover:text-white hover:bg-white/5 transition"
              >
                <LogoutIcon />
              </button>
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
        <nav
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 backdrop-blur-md bg-black/70 border-t border-white/10"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <ul className="flex items-stretch justify-around h-16">
            {NAV_ITEMS.map(({ href, label, Icon }) => {
              const active =
                pathname === href || (href !== "/" && pathname.startsWith(href));
              return (
                <li key={href} className="flex-1">
                  <Link
                    href={href}
                    className={clsx(
                      "h-full flex flex-col items-center justify-center gap-0.5 transition",
                      active ? "text-amber-300" : "text-zinc-400 hover:text-white"
                    )}
                  >
                    <Icon
                      className={clsx(
                        "transition-transform",
                        active ? "w-6 h-6 scale-110" : "w-6 h-6"
                      )}
                    />
                    <span className="text-[10px] font-medium">{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </>
  );
}
