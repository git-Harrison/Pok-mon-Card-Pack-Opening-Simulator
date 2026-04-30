"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * /grading 세그먼트 에러 바운더리.
 *
 * 감별 페이지 렌더 단계 throw 를 잡아 in-page 복구 UI 로 표시 — Next.js
 * 기본 풀스크린 폴백("Something went wrong") 으로 빠지지 않게.
 *
 * "다시 시도" 동작: window.location.reload() (cache-bust 쿼리 포함). 이전엔
 * Next.js 의 `reset()` 콜백을 호출했지만 모듈/컨텍스트 상태가 살아남아
 * 같은 에러 즉시 재발 → 사용자가 직접 브라우저 새로고침해야 했음. 이제
 * 버튼 한 번 = 진짜 페이지 리로드. `reset` prop 은 시그니처상 받되 내부
 * 호출은 reload 우선.
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

  function reload() {
    // cache-bust 쿼리 + replace — UpdateAvailableModal 패턴과 동일.
    // 일부 모바일 브라우저가 disk cache 에서 그대로 응답하는 경우 대비.
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("_v", Date.now().toString());
      window.location.replace(url.toString());
    } catch {
      try {
        window.location.reload();
      } catch {
        // 최후 fallback — Next.js reset (이전 동작).
        reset();
      }
    }
  }

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
            onClick={reload}
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
