"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BUILD_ID } from "@/lib/build-id";
import Portal from "./Portal";

const POLL_INTERVAL_MS = 60_000; // 1분

/**
 * 새 deploy 감지 모달.
 *
 * 클라 번들에 동결된 BUILD_ID 와 /api/build-id (deploy 시점에 다시
 * 채워짐) 응답을 1분 주기 + 탭 복귀 시 비교. 다르면 "업데이트가
 * 있어요" 모달 → "새로고침하기" 버튼이 location.reload(true) 호출.
 *
 * dev / 첫 deploy 에선 둘 다 "dev" 라 발화되지 않음.
 */
export default function UpdateAvailableModal() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch("/api/build-id", {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { buildId?: string };
        const latest = data.buildId;
        if (
          !cancelled &&
          typeof latest === "string" &&
          latest !== "dev" &&
          BUILD_ID !== "dev" &&
          latest !== BUILD_ID
        ) {
          setStale(true);
        }
      } catch {
        // 네트워크 일시 장애는 조용히 무시 — 다음 폴링에서 다시 시도.
      }
    }

    // 마운트 직후 한 번 체크 — 사용자가 새 deploy 후 처음 들어왔을 때
    // 기존 캐시된 번들을 들고 있을 수도 있으니 빨리 알림.
    void check();

    const id = window.setInterval(check, POLL_INTERVAL_MS);

    function onVisible() {
      if (document.visibilityState === "visible") void check();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  function reload() {
    // 캐시 우회를 위해 새 timestamp 쿼리도 함께. 일부 모바일 브라우저
    // 가 disk cache 에서 그대로 응답하는 경우가 있어서.
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("_v", Date.now().toString());
      window.location.replace(url.toString());
    } catch {
      window.location.reload();
    }
  }

  return (
    <Portal>
      <AnimatePresence>
        {stale && (
          <motion.div
            className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="update-modal-title"
          >
            <motion.div
              initial={{ y: 16, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 8, opacity: 0, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 240, damping: 22 }}
              className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-amber-400/40 shadow-[0_24px_60px_-12px_rgba(251,191,36,0.35)] p-5"
            >
              <div className="flex items-start gap-3">
                <div className="text-3xl">🔄</div>
                <div className="flex-1 min-w-0">
                  <h2
                    id="update-modal-title"
                    className="text-base font-black text-white"
                  >
                    업데이트된 버전이 있습니다
                  </h2>
                  <p className="mt-1 text-[12px] text-zinc-300 leading-relaxed">
                    새로고침해야 최신 기능을 사용할 수 있어요. 작성 중인
                    내용이 있다면 저장 후 눌러주세요.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStale(false)}
                  className="flex-1 h-10 rounded-xl bg-white/5 border border-white/10 text-zinc-200 text-xs font-bold hover:bg-white/10 transition"
                  style={{ touchAction: "manipulation" }}
                >
                  나중에
                </button>
                <button
                  type="button"
                  onClick={reload}
                  className="flex-[2] h-10 rounded-xl bg-gradient-to-r from-amber-400 to-rose-500 text-zinc-950 text-xs font-black hover:scale-[1.02] active:scale-[0.97] shadow-[0_8px_24px_-8px_rgba(251,113,133,0.6)] transition"
                  style={{ touchAction: "manipulation" }}
                >
                  새로고침하기
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
