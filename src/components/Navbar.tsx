"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { useState } from "react";
import { useAuth } from "@/lib/auth";

const AUTH_NAV = [
  { href: "/", label: "홈" },
  { href: "/wallet", label: "내 카드지갑" },
  { href: "/users", label: "사용자 랭킹" },
  { href: "/gifts", label: "선물함" },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const items = user ? AUTH_NAV : [];

  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-black/40 border-b border-white/10">
      <div className="max-w-6xl mx-auto px-3 md:px-6 h-14 flex items-center justify-between gap-2">
        <Link href={user ? "/" : "/login"} className="flex items-center gap-2 shrink-0">
          <span className="relative inline-flex w-7 h-7 rounded-full bg-gradient-to-b from-red-500 to-red-700 shadow-lg shadow-red-500/30">
            <span className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 bg-black/80" />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white border-2 border-black/80" />
          </span>
          <span className="text-sm md:text-base font-bold tracking-tight text-white">
            <span className="hidden sm:inline">포켓몬 </span>카드깡 시뮬레이터
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "px-3 py-1.5 text-sm rounded-md transition-colors",
                pathname === item.href
                  ? "bg-white/10 text-white"
                  : "text-zinc-300 hover:bg-white/5 hover:text-white"
              )}
            >
              {item.label}
            </Link>
          ))}
          {user ? (
            <div className="ml-2 flex items-center gap-2">
              <span className="text-xs text-zinc-400">
                <span className="text-zinc-200 font-semibold">{user.user_id}</span>님
              </span>
              <button
                onClick={logout}
                className="text-xs text-zinc-400 hover:text-white px-2 py-1 rounded hover:bg-white/5"
              >
                로그아웃
              </button>
            </div>
          ) : (
            pathname !== "/login" &&
            pathname !== "/signup" && (
              <Link
                href="/login"
                className="ml-2 text-xs px-3 py-1.5 rounded-md bg-white/10 text-white hover:bg-white/15"
              >
                로그인
              </Link>
            )
          )}
        </nav>

        {/* Mobile menu button */}
        {user ? (
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="메뉴"
            className="md:hidden w-10 h-10 flex items-center justify-center rounded-md hover:bg-white/5"
          >
            <span className="sr-only">메뉴</span>
            <div className="relative w-5 h-3.5">
              <span
                className={clsx(
                  "absolute left-0 right-0 h-0.5 bg-white transition-all",
                  menuOpen ? "top-1.5 rotate-45" : "top-0"
                )}
              />
              <span
                className={clsx(
                  "absolute left-0 right-0 h-0.5 bg-white transition-all top-1.5",
                  menuOpen && "opacity-0"
                )}
              />
              <span
                className={clsx(
                  "absolute left-0 right-0 h-0.5 bg-white transition-all",
                  menuOpen ? "top-1.5 -rotate-45" : "top-3"
                )}
              />
            </div>
          </button>
        ) : (
          pathname !== "/login" &&
          pathname !== "/signup" && (
            <Link
              href="/login"
              className="md:hidden text-xs px-3 py-1.5 rounded-md bg-white/10 text-white"
            >
              로그인
            </Link>
          )
        )}
      </div>

      {/* Mobile menu drawer */}
      {user && menuOpen && (
        <div className="md:hidden border-t border-white/10 bg-black/70 backdrop-blur-md">
          <div className="max-w-6xl mx-auto px-3 py-2 flex flex-col">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className={clsx(
                  "px-3 py-3 text-sm rounded-md",
                  pathname === item.href
                    ? "bg-white/10 text-white"
                    : "text-zinc-300"
                )}
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-1 flex items-center justify-between px-3 py-3 border-t border-white/5">
              <span className="text-xs text-zinc-400">
                <span className="text-zinc-200 font-semibold">{user.user_id}</span>님
              </span>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                  router.push("/login");
                }}
                className="text-xs text-zinc-300 hover:text-white"
              >
                로그아웃
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
