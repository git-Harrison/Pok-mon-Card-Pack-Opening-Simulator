"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";

export default function SignupPage() {
  const router = useRouter();
  const { user, isLoading, signup } = useAuth();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [age, setAge] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && user) router.replace("/");
  }, [isLoading, user, router]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const ageNum = Number(age);
    if (!loginId || !password || !nickname.trim() || !Number.isFinite(ageNum)) {
      setError("모든 항목을 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await signup(loginId, password, ageNum, nickname.trim());
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error ?? "회원가입 실패");
      return;
    }
    router.replace("/");
  };

  return (
    <div className="min-h-[calc(100dvh-3.5rem)] flex items-center justify-center px-4 py-10 fade-in">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-black text-white tracking-tight text-center">
          회원가입
        </h1>
        <p className="mt-2 text-sm text-zinc-400 text-center">
          간단하게 아이디와 비밀번호, 나이만 입력하면 됩니다.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <label className="block">
            <span className="text-xs font-semibold text-zinc-300">아이디</span>
            <input
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              autoComplete="username"
              className="mt-1 w-full h-12 px-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-400/70"
              placeholder="영문 소문자, 숫자, _ 2~24자"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-zinc-300">비밀번호</span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="new-password"
              className="mt-1 w-full h-12 px-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-400/70"
              placeholder="4자 이상"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-zinc-300">닉네임</span>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value.slice(0, 20))}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={20}
              style={{ fontSize: "16px" }}
              className="mt-1 w-full h-12 px-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-400/70"
              placeholder="랭킹·선물·디스코드에 표시"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-zinc-300">나이</span>
            <input
              value={age}
              onChange={(e) => setAge(e.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              className="mt-1 w-full h-12 px-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-400/70"
              placeholder="예: 28"
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
            {submitting ? "가입 중..." : "가입하고 시작하기"}
          </button>
        </form>

        <div className="mt-4 flex items-center justify-between text-xs">
          <span className="text-zinc-500">이미 계정이 있나요?</span>
          <Link
            href="/login"
            className="text-amber-400 font-semibold hover:underline"
          >
            로그인 →
          </Link>
        </div>
      </div>
    </div>
  );
}
