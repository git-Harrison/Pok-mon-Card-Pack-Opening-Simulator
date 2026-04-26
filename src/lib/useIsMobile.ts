"use client";

import { useEffect, useState } from "react";

/**
 * 모바일 뷰포트 여부. SSR/첫 렌더에서는 항상 false 를 반환해서
 * 하이드레이션 미스매치를 피하고, 마운트 후에는 `(max-width: 767px)`
 * 미디어 쿼리 결과를 따른다. 모바일에서 무거운 framer-motion
 * 인피니트 루프, backdrop-blur, 파티클 등을 끄기 위한 게이트로 사용.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return isMobile;
}
