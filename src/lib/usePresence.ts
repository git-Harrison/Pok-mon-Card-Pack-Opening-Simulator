"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

export function usePresence(userId: string | null | undefined): Set<string> {
  const [online, setOnline] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const ch = supabase.channel("presence:online", {
      config: { presence: { key: userId } },
    });

    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState();
      setOnline(new Set<string>(Object.keys(state)));
    });

    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await ch.track({ user_id: userId, at: Date.now() });
      }
    });

    const onUnload = () => {
      try {
        void ch.untrack();
      } catch {
        // ignore
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", onUnload);
      window.addEventListener("pagehide", onUnload);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("beforeunload", onUnload);
        window.removeEventListener("pagehide", onUnload);
      }
      try {
        void ch.untrack();
      } catch {
        // ignore
      }
      supabase.removeChannel(ch);
    };
  }, [userId]);

  return online;
}
