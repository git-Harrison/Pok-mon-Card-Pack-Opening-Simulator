"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/lib/auth";
import {
  fetchUnseenTaunts,
  markTauntSeen,
  type TauntRow,
} from "@/lib/db";
import Portal from "./Portal";

/**
 * Global overlay. Polls for unseen taunts whenever the user changes or
 * the route changes — so a taunt sent right after the recipient logs
 * in will appear on their next page render. Dismissing / confirming
 * flips `seen=true` server-side so it never reappears.
 */
export default function NotificationsOverlay() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [queue, setQueue] = useState<TauntRow[]>([]);

  const refresh = useCallback(async () => {
    if (!user) {
      setQueue([]);
      return;
    }
    const rows = await fetchUnseenTaunts(user.id);
    setQueue(rows);
  }, [user]);

  // Fetch on auth change + every route transition.
  useEffect(() => {
    refresh();
  }, [refresh, pathname]);

  const current = queue[0] ?? null;

  const dismiss = useCallback(async () => {
    if (!user || !current) return;
    await markTauntSeen(current.id, user.id);
    setQueue((q) => q.slice(1));
  }, [user, current]);

  if (!current) return null;

  return (
    <Portal>
      <motion.div
        key={current.id}
        className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-md flex items-center justify-center overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          paddingTop: "max(env(safe-area-inset-top, 0px), 16px)",
          paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)",
          paddingLeft: "12px",
          paddingRight: "12px",
        }}
        onClick={dismiss}
      >
        <motion.div
          className="relative w-full max-w-md bg-gradient-to-br from-rose-950 via-zinc-900 to-zinc-950 border-2 border-rose-500/50 rounded-2xl overflow-hidden"
          initial={{ scale: 0.7, rotate: -8, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          exit={{ scale: 0.7, rotate: 8, opacity: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 18 }}
          onClick={(e) => e.stopPropagation()}
          style={{
            boxShadow: "0 0 48px rgba(244,63,94,0.35)",
          }}
        >
          {/* Banner */}
          <div className="px-4 py-2.5 bg-rose-500/20 border-b border-rose-400/30 flex items-center gap-2">
            <span className="text-xl animate-pulse">😤</span>
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-rose-200">
                조롱 메시지
              </p>
              <p className="text-sm font-black text-white">
                {current.from_name} 님이 당신을 조롱합니다
              </p>
            </div>
          </div>

          {/* Body */}
          <div className="px-5 py-6 text-center">
            <motion.p
              className="text-base md:text-lg font-bold text-white leading-relaxed break-keep"
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15 }}
              style={{ whiteSpace: "pre-wrap" }}
            >
              &ldquo;{current.message}&rdquo;
            </motion.p>
            <p className="mt-3 text-[10px] text-zinc-400">
              {new Date(current.created_at).toLocaleString("ko-KR")}
            </p>
          </div>

          {/* Actions */}
          <div className="px-4 pb-4 grid grid-cols-1 gap-2">
            <button
              onClick={dismiss}
              className="h-11 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 text-zinc-950 font-black text-sm active:scale-[0.98]"
            >
              🔥 확인 (다시 보지 않음)
            </button>
            {queue.length > 1 && (
              <p className="text-center text-[10px] text-zinc-500">
                안 읽은 메시지 {queue.length - 1}건 남음
              </p>
            )}
          </div>
        </motion.div>
      </motion.div>
    </Portal>
  );
}
