"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { useAuth } from "@/lib/auth";
import {
  adminGrantPoints,
  adminListUsers,
  type AdminUserRow,
} from "@/lib/db";
import CoinIcon from "./CoinIcon";
import UserSelect from "./UserSelect";

const ADMIN_LOGIN = "hun";

export default function AdminView() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState("");
  const [amountRaw, setAmountRaw] = useState("100000");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    const res = await adminListUsers(user.id);
    if (res.ok && res.users) setUsers(res.users);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Not-the-admin gate. We still render from the client since the
  // server RPC is the real authority, but a friendly empty state is
  // nicer than a 500 from a failed RPC call.
  if (user && user.user_id !== ADMIN_LOGIN) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <p className="text-5xl">🔒</p>
        <p className="mt-4 text-lg font-bold text-white">관리자 전용 페이지</p>
        <p className="mt-1 text-sm text-zinc-400">
          이 페이지는 운영자 계정에서만 접근할 수 있어요.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-11 px-5 rounded-xl bg-white/10 text-white font-semibold text-sm hover:bg-white/15"
        >
          홈으로
        </Link>
      </div>
    );
  }

  const submit = useCallback(async () => {
    if (!user) return;
    const amount = parseInt(amountRaw, 10);
    if (!target.trim()) {
      setError("대상 사용자를 선택하세요.");
      return;
    }
    if (Number.isNaN(amount) || amount === 0) {
      setError("지급할 포인트를 입력하세요. (음수도 가능)");
      return;
    }
    setSubmitting(true);
    setError(null);
    setNotice(null);
    const res = await adminGrantPoints(user.id, target.trim(), amount);
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error ?? "지급 실패");
      return;
    }
    setNotice(
      `${res.target_name}님에게 ${(res.amount ?? 0) >= 0 ? "+" : ""}${(res.amount ?? 0).toLocaleString("ko-KR")}p 지급 → 현재 잔액 ${(res.points ?? 0).toLocaleString("ko-KR")}p`
    );
    setTarget("");
    await refresh();
  }, [user, target, amountRaw, refresh]);

  const grantAll = useCallback(
    async (amount: number) => {
      if (!user) return;
      if (!window.confirm(`전체 유저에게 ${amount.toLocaleString("ko-KR")}p를 지급할까요?`)) return;
      setSubmitting(true);
      setError(null);
      setNotice(null);
      for (const u of users) {
        await adminGrantPoints(user.id, u.user_id, amount);
      }
      setSubmitting(false);
      setNotice(
        `전체 ${users.length}명에게 +${amount.toLocaleString("ko-KR")}p 지급 완료`
      );
      await refresh();
    },
    [user, users, refresh]
  );

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 md:py-10 fade-in">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
          👑 관리자
        </h1>
        <Link
          href="/"
          className="text-xs text-zinc-400 hover:text-white"
        >
          홈으로
        </Link>
      </div>
      <p className="mt-1 text-sm text-zinc-400">
        유저에게 포인트를 지급하거나 차감합니다. 음수를 입력하면 차감돼요.
      </p>

      {/* Grant form */}
      <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
        <label className="block">
          <span className="text-xs text-zinc-300 mb-1.5 block">
            대상 사용자
          </span>
          <UserSelect
            value={target || null}
            placeholder="대상 사용자 고르기"
            onChange={(u) => setTarget(u.user_id)}
          />
        </label>
        <label className="block mt-3">
          <span className="text-xs text-zinc-300 mb-1.5 block">
            지급할 포인트 (음수 = 차감)
          </span>
          <div className="flex items-stretch gap-1.5">
            <input
              value={amountRaw}
              onChange={(e) =>
                setAmountRaw(e.target.value.replace(/[^0-9\-]/g, ""))
              }
              inputMode="numeric"
              style={{ fontSize: "16px" }}
              className="flex-1 h-11 px-3 rounded-lg bg-black/40 border border-white/10 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
              placeholder="0"
            />
            <span className="inline-flex items-center gap-1.5 px-3 rounded-lg bg-white/5 border border-white/10 text-xs text-zinc-300">
              <CoinIcon size="xs" /> p
            </span>
          </div>
        </label>
        {error && (
          <p className="mt-3 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
        {notice && (
          <p className="mt-3 text-xs text-emerald-200 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
            {notice}
          </p>
        )}
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={submit}
            disabled={submitting || !target.trim()}
            className={clsx(
              "flex-1 h-11 rounded-lg font-bold text-sm",
              submitting || !target.trim()
                ? "bg-white/5 text-zinc-500"
                : "bg-gradient-to-r from-amber-400 to-rose-500 text-zinc-950 hover:scale-[1.01] active:scale-[0.98] transition"
            )}
          >
            {submitting ? "처리 중..." : "포인트 지급"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => grantAll(100_000)}
            disabled={submitting}
            className="h-9 px-3 rounded-full text-[11px] font-semibold border border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10 disabled:opacity-50"
          >
            전체 +10만p
          </button>
          <button
            type="button"
            onClick={() => grantAll(1_000_000)}
            disabled={submitting}
            className="h-9 px-3 rounded-full text-[11px] font-semibold border border-amber-400/40 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20 disabled:opacity-50"
          >
            전체 +100만p
          </button>
        </div>
      </div>

      {/* Users list */}
      <h2 className="mt-8 text-sm font-bold text-white uppercase tracking-wider">
        전체 유저 {users.length}명
      </h2>
      {loading ? (
        <div className="mt-4 py-8 flex justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white animate-spin" />
        </div>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {users.map((u) => (
            <li
              key={u.id}
              className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">
                  {u.display_name}
                  <span className="ml-1.5 text-[10px] text-zinc-500 font-normal">
                    @{u.user_id}
                  </span>
                </p>
                <p className="text-[10px] text-zinc-400">나이 {u.age}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-black text-amber-300 tabular-nums inline-flex items-center gap-1">
                  <CoinIcon size="xs" />
                  {u.points.toLocaleString("ko-KR")}
                </p>
                <button
                  onClick={() => {
                    setTarget(u.user_id);
                  }}
                  className="mt-0.5 text-[10px] text-zinc-400 hover:text-white underline underline-offset-2"
                >
                  선택
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
