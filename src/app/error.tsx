"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * 루트 에러 바운더리 — App Router 의 모든 page 단에서 잡히지 않은
 * 렌더 에러를 여기서 처리. 세그먼트별 error.tsx (예: /grading/error.tsx)
 * 가 우선이고, 그 외 라우트에서 발생한 에러는 이 파일이 폴백.
 *
 * Next.js 기본 풀스크린 "Application error" 화면 대신 동일 도메인 안에서
 * 복구 가능한 UI 만 렌더 — 새로고침 유도 X, 다시 시도 + 홈 이동만.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[root] error:", error);
  }, [error]);

  return (
    <div className="relative min-h-[100dvh] flex items-center justify-center px-4 py-10 bg-zinc-950">
      <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-zinc-900/60 p-6 text-center">
        <div className="text-4xl mb-2" aria-hidden>
          ⚠️
        </div>
        <h1 className="text-base md:text-lg font-black text-white">
          잠시 문제가 있었어요
        </h1>
        <p className="mt-2 text-[12px] md:text-sm text-zinc-300 leading-relaxed">
          페이지를 그리는 중에 오류가 발생했어요. 다시 시도하면 대부분
          자동으로 회복돼요.
        </p>
        {error?.digest && (
          <p className="mt-2 text-[10px] text-zinc-500 font-mono">
            ref: {error.digest}
          </p>
        )}
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={reset}
            className="w-full h-11 rounded-xl bg-gradient-to-r from-amber-400 to-rose-500 text-zinc-950 text-sm font-black hover:scale-[1.01] active:scale-[0.98] transition"
            style={{ touchAction: "manipulation" }}
          >
            다시 시도
          </button>
          <Link
            href="/"
            className="w-full h-10 rounded-xl bg-white/5 border border-white/10 text-zinc-200 text-xs font-bold flex items-center justify-center hover:bg-white/10 transition"
          >
            홈으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}
