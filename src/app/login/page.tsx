"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const { user, isLoading, login } = useAuth();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && user) router.replace("/");
  }, [isLoading, user, router]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!loginId || !password || submitting) return;
    setSubmitting(true);
    setError(null);
    const res = await login(loginId, password);
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error ?? "로그인 실패");
      return;
    }
    router.replace("/");
  };

  return (
    <div className="min-h-[calc(100dvh-3.5rem)] flex items-center justify-center px-4 py-10 fade-in">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-black text-white tracking-tight text-center">
          로그인
        </h1>
        <p className="mt-2 text-sm text-zinc-400 text-center">
          아이디와 비밀번호를 입력해 주세요.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <label className="block">
            <span className="text-xs font-semibold text-zinc-300">아이디</span>
            <input
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              autoComplete="username"
              inputMode="text"
              className="mt-1 w-full h-12 px-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-400/70"
              placeholder="예: hun"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-zinc-300">비밀번호</span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              className="mt-1 w-full h-12 px-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-400/70"
              placeholder="비밀번호"
            />
          </label>

          {error && (
            <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-12 rounded-xl bg-gradient-to-r from-amber-400 to-rose-500 text-zinc-950 font-bold text-sm hover:scale-[1.02] active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? "로그인 중..." : "로그인"}
          </button>
        </form>

        <div className="mt-4 flex items-center justify-between text-xs">
          <span className="text-zinc-500">계정이 없나요?</span>
          <Link
            href="/signup"
            className="text-amber-400 font-semibold hover:underline"
          >
            회원가입 →
          </Link>
        </div>
      </div>
    </div>
  );
}
