"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * /grading 세그먼트 에러 바운더리.
 *
 * 감별 페이지 내부의 어떤 React 렌더 에러도 여기서 잡아 in-page 복구 UI 로
 * 표시 — Next.js 기본 풀스크린 에러 폴백("Something went wrong") 으로
 * 빠지지 않게. reset() 호출 시 동일 라우트 다시 마운트 (페이지 전체
 * navigation 없이 해당 세그먼트만 재시도). 사용자가 새로고침할 필요 없음.
 *
 * 비고: async / promise rejection 은 React 에러 바운더리로 안 잡힘. 그쪽은
 *       GradingView 내부의 try/catch 가 처리. 이 파일은 렌더 단계 throw
 *       (예: undefined.toLocaleString) 를 잡는 역할.
 */
export default function GradingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 콘솔 + 향후 telemetry 훅 자리.
    console.error("[grading] route-level error:", error);
  }, [error]);

  return (
    <div className="relative min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-zinc-900/60 p-6 text-center">
        <div className="text-4xl mb-2" aria-hidden>
          🧪
        </div>
        <h1 className="text-base md:text-lg font-black text-white">
          감별실 일시 오류
        </h1>
        <p className="mt-2 text-[12px] md:text-sm text-zinc-300 leading-relaxed">
          오박사 기계가 잠시 멈췄어요. 진행 중이던 감별은 백그라운드에서
          그대로 처리되니 안심하세요.
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
            className="w-full h-11 rounded-xl bg-gradient-to-r from-fuchsia-500 to-indigo-500 text-white text-sm font-black hover:scale-[1.01] active:scale-[0.98] transition"
            style={{ touchAction: "manipulation" }}
          >
            다시 시도
          </button>
          <Link
            href="/wallet?tab=pcl"
            className="w-full h-10 rounded-xl bg-white/5 border border-white/10 text-zinc-200 text-xs font-bold flex items-center justify-center hover:bg-white/10 transition"
          >
            지갑 PCL 탭으로 이동
          </Link>
          <Link
            href="/"
            className="text-[11px] text-zinc-500 hover:text-zinc-300 mt-1"
          >
            홈으로 돌아가기 →
          </Link>
        </div>
      </div>
    </div>
  );
}
