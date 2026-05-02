"use client";

import { useEffect } from "react";

/* ─────────────────────────────────────────────────────────────
 * 전역 ref-count body scroll lock.
 *
 * 기존 패턴:
 *   const prev = document.body.style.overflow;
 *   document.body.style.overflow = "hidden";
 *   return () => { document.body.style.overflow = prev; };
 *
 * 위 패턴은 두 컴포넌트(A, B)가 겹치는 순간 깨진다:
 *   1) A 마운트 → prev = ""  → body = hidden
 *   2) B 마운트 → prev = "hidden"  → body = hidden
 *   3) A 언마운트 → body = "" (A 의 prev)  ← B 가 살아있는데 스크롤 풀림
 *   4) B 언마운트 → body = "hidden" (B 의 prev)  ← 영구 잠김!
 *
 * 갤럭시/안드로이드에서 "모든 페이지가 스크롤 안 됨" 으로 흔히 보고되는 증상의
 * 직접 원인. ref count 로 lockCount > 0 일 때만 hidden 을 적용하고 0 이 되면
 * 원래 값(빈 문자열)으로 깔끔히 복원한다.
 *
 * 추가로 안드로이드 Chrome / Samsung Internet 에서 터치 스크롤이 안정적으로
 * 동작하도록 lock 해제 시 touchAction 을 명시적으로 비워준다. (일부 사례에서
 * 라우트 전환 후 inline style 이 남아 스크롤이 잠긴 채 유지되는 케이스 차단.)
 * ───────────────────────────────────────────────────────────── */

let lockCount = 0;

function applyLock() {
  document.body.style.overflow = "hidden";
  // 모달/풀스크린 시퀀스 동안에도 터치 입력 자체는 살려둠 (스와이프 차단 방지).
  document.body.style.touchAction = "none";
}

function releaseLock() {
  document.body.style.overflow = "";
  document.body.style.touchAction = "";
}

/** 락 카운터 1 증가. unlock() 콜백을 반드시 호출해 카운터를 1 감소시켜야 한다. */
export function lockBodyScroll(): () => void {
  if (typeof document === "undefined") return () => {};
  lockCount += 1;
  if (lockCount === 1) applyLock();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) releaseLock();
  };
}

/** React 훅 — 컴포넌트가 마운트되어 있는 동안 body scroll 잠금. */
export function useBodyScrollLock(active: boolean = true) {
  useEffect(() => {
    if (!active) return;
    const release = lockBodyScroll();
    return release;
  }, [active]);
}
