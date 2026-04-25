"use client";

import { useEffect } from "react";
import { createClient } from "@/utils/supabase/client";

type Listener = () => void;

interface InboxBus {
  taunt: Set<Listener>;
  gift: Set<Listener>;
}

const buses = new Map<string, InboxBus>();
const channels = new Map<string, ReturnType<ReturnType<typeof createClient>["channel"]>>();
const refCounts = new Map<string, number>();

function ensureChannel(userId: string): InboxBus {
  let bus = buses.get(userId);
  if (bus) return bus;
  bus = { taunt: new Set(), gift: new Set() };
  buses.set(userId, bus);

  const supabase = createClient();
  const channel = supabase
    .channel(`inbox:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "taunts",
        filter: `to_user_id=eq.${userId}`,
      },
      () => {
        const b = buses.get(userId);
        b?.taunt.forEach((cb) => {
          try {
            cb();
          } catch {
            // ignore
          }
        });
      }
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "gifts",
        filter: `to_user_id=eq.${userId}`,
      },
      () => {
        const b = buses.get(userId);
        b?.gift.forEach((cb) => {
          try {
            cb();
          } catch {
            // ignore
          }
        });
      }
    )
    .subscribe();
  channels.set(userId, channel);
  return bus;
}

function releaseChannel(userId: string) {
  const next = (refCounts.get(userId) ?? 0) - 1;
  if (next > 0) {
    refCounts.set(userId, next);
    return;
  }
  refCounts.delete(userId);
  const ch = channels.get(userId);
  if (ch) {
    try {
      const supabase = createClient();
      supabase.removeChannel(ch);
    } catch {
      // ignore
    }
    channels.delete(userId);
  }
  buses.delete(userId);
}

export function useRealtimeInbox(
  userId: string | null | undefined,
  onTaunt?: Listener,
  onGift?: Listener
) {
  useEffect(() => {
    if (!userId) return;
    const bus = ensureChannel(userId);
    refCounts.set(userId, (refCounts.get(userId) ?? 0) + 1);
    if (onTaunt) bus.taunt.add(onTaunt);
    if (onGift) bus.gift.add(onGift);
    return () => {
      const b = buses.get(userId);
      if (b) {
        if (onTaunt) b.taunt.delete(onTaunt);
        if (onGift) b.gift.delete(onGift);
      }
      releaseChannel(userId);
    };
  }, [userId, onTaunt, onGift]);
}
