"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/lib/auth";
import { getCard, SETS } from "@/lib/sets";
import { RARITY_LABEL, RARITY_ORDER, RARITY_STYLE } from "@/lib/rarity";
import type { Card, Rarity } from "@/lib/types";
import RarityBadge from "./RarityBadge";

interface DbUserRow {
  id: string;
  user_id: string;
  age: number;
}

interface OwnershipRow {
  user_id: string;
  card_id: string;
  count: number;
}

interface UserEntry {
  id: string;
  user_id: string;
  age: number;
  totalCards: number;
  totalUnique: number;
  rarityCounts: Map<Rarity, number>;
  rarityCards: Map<Rarity, { card: Card; count: number }[]>;
  topRarity: Rarity | null;
}

const supabase = createClient();

export default function UsersView() {
  const { user: currentUser } = useAuth();
  const [entries, setEntries] = useState<UserEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, Rarity | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [usersRes, ownRes] = await Promise.all([
      supabase.from("users").select("id, user_id, age"),
      supabase.from("card_ownership").select("user_id, card_id, count"),
    ]);
    if (usersRes.error || ownRes.error) {
      setLoading(false);
      return;
    }
    const users = (usersRes.data ?? []) as DbUserRow[];
    const ownership = (ownRes.data ?? []) as OwnershipRow[];

    const byUser = new Map<string, OwnershipRow[]>();
    for (const row of ownership) {
      if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
      byUser.get(row.user_id)!.push(row);
    }

    const built: UserEntry[] = users.map((u) => {
      const owned = byUser.get(u.id) ?? [];
      const rarityCounts = new Map<Rarity, number>();
      const rarityCards = new Map<Rarity, { card: Card; count: number }[]>();
      let totalCards = 0;
      let totalUnique = 0;
      for (const row of owned) {
        const card = getCard(row.card_id);
        if (!card) continue;
        totalCards += row.count;
        totalUnique += 1;
        rarityCounts.set(
          card.rarity,
          (rarityCounts.get(card.rarity) ?? 0) + row.count
        );
        if (!rarityCards.has(card.rarity)) rarityCards.set(card.rarity, []);
        rarityCards.get(card.rarity)!.push({ card, count: row.count });
      }
      // sort each rarity group: by card number ascending
      for (const arr of rarityCards.values()) {
        arr.sort((a, b) => a.card.number.localeCompare(b.card.number));
      }
      // top rarity = highest tier actually owned
      const top =
        [...rarityCounts.keys()].sort(
          (a, b) => RARITY_STYLE[b].tier - RARITY_STYLE[a].tier
        )[0] ?? null;
      return {
        id: u.id,
        user_id: u.user_id,
        age: u.age,
        totalCards,
        totalUnique,
        rarityCounts,
        rarityCards,
        topRarity: top,
      };
    });
    // sort: by highest-tier top rarity, then by total cards desc
    built.sort((a, b) => {
      const at = a.topRarity ? RARITY_STYLE[a.topRarity].tier : -1;
      const bt = b.topRarity ? RARITY_STYLE[b.topRarity].tier : -1;
      if (at !== bt) return bt - at;
      return b.totalCards - a.totalCards;
    });
    setEntries(built);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (userId: string, rarity: Rarity) =>
    setExpanded((prev) => ({
      ...prev,
      [userId]: prev[userId] === rarity ? null : rarity,
    }));

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-10 fade-in">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-4xl font-black text-white tracking-tight">
            사용자 랭킹
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            모든 사용자의 보유 등급을 한눈에. 등급 칩을 누르면 해당 카드 이름이
            펼쳐집니다.
          </p>
        </div>
        <button
          onClick={load}
          className="h-10 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-zinc-200 border border-white/10"
        >
          새로고침
        </button>
      </div>

      {loading ? (
        <div className="mt-16 flex justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <p className="mt-16 text-center text-zinc-400 text-sm">
          아직 사용자가 없습니다.
        </p>
      ) : (
        <div className="mt-6 space-y-3 md:space-y-4">
          {entries.map((entry, rank) => {
            const expandedRarity = expanded[entry.id] ?? null;
            const isMe = currentUser?.id === entry.id;
            const visibleRarities = RARITY_ORDER.filter(
              (r) => (entry.rarityCounts.get(r) ?? 0) > 0
            );
            return (
              <motion.article
                key={entry.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: rank * 0.03 }}
                className={clsx(
                  "rounded-2xl border bg-white/5 overflow-hidden",
                  isMe
                    ? "border-amber-400/50 shadow-[0_0_24px_-6px_rgba(251,191,36,0.4)]"
                    : "border-white/10"
                )}
              >
                <div className="p-4 md:p-5 flex items-center gap-3 md:gap-4">
                  <div
                    className={clsx(
                      "shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center font-black text-sm md:text-base border",
                      rank === 0
                        ? "bg-amber-400/20 text-amber-200 border-amber-400/60"
                        : rank === 1
                        ? "bg-zinc-300/10 text-zinc-200 border-zinc-300/40"
                        : rank === 2
                        ? "bg-orange-500/10 text-orange-200 border-orange-500/40"
                        : "bg-white/5 text-zinc-400 border-white/10"
                    )}
                  >
                    {rank + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base md:text-lg font-bold text-white">
                        {entry.user_id}
                      </h2>
                      {isMe && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-400 text-zinc-900">
                          나
                        </span>
                      )}
                      {entry.topRarity && (
                        <RarityBadge rarity={entry.topRarity} size="xs" />
                      )}
                    </div>
                    <p className="text-[11px] md:text-xs text-zinc-400 mt-0.5">
                      {entry.age}세 · 총 {entry.totalCards}장 · {entry.totalUnique}
                      종 보유
                    </p>
                  </div>
                </div>

                {visibleRarities.length === 0 ? (
                  <div className="px-4 md:px-5 pb-4 text-xs text-zinc-500">
                    아직 뽑은 카드가 없습니다.
                  </div>
                ) : (
                  <>
                    <div className="px-4 md:px-5 pb-4 flex flex-wrap gap-2">
                      {visibleRarities.map((r) => {
                        const active = expandedRarity === r;
                        const count = entry.rarityCounts.get(r) ?? 0;
                        return (
                          <button
                            key={r}
                            onClick={() => toggle(entry.id, r)}
                            className={clsx(
                              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border transition",
                              active
                                ? "border-white bg-white text-zinc-900"
                                : "border-white/10 bg-white/5 text-white hover:bg-white/10"
                            )}
                            aria-expanded={active}
                          >
                            <span
                              className={clsx(
                                "inline-block w-2 h-2 rounded-full",
                                RARITY_STYLE[r].badge
                              )}
                            />
                            <span>{r}</span>
                            <span className="opacity-70">×{count}</span>
                          </button>
                        );
                      })}
                    </div>

                    <AnimatePresence initial={false}>
                      {expandedRarity && (
                        <motion.div
                          key={expandedRarity}
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 md:px-5 pb-4 md:pb-5 pt-0 border-t border-white/5 bg-black/20">
                            <div className="pt-3 flex items-center gap-2">
                              <RarityBadge rarity={expandedRarity} size="sm" />
                              <span className="text-xs text-zinc-400">
                                {RARITY_LABEL[expandedRarity]} 카드 목록
                              </span>
                            </div>
                            <ul className="mt-3 space-y-1.5">
                              {(entry.rarityCards.get(expandedRarity) ?? []).map(
                                ({ card, count }) => (
                                  <li
                                    key={card.id}
                                    className="flex items-center gap-3 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition"
                                  >
                                    <span className="shrink-0 text-[10px] font-mono text-zinc-500">
                                      #{card.number}
                                    </span>
                                    <span className="flex-1 text-sm text-white truncate">
                                      {card.name}
                                    </span>
                                    <span className="text-[11px] text-zinc-400">
                                      {SETS[card.setCode].name}
                                    </span>
                                    {count > 1 && (
                                      <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/10 text-white">
                                        ×{count}
                                      </span>
                                    )}
                                  </li>
                                )
                              )}
                            </ul>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
                )}
              </motion.article>
            );
          })}
        </div>
      )}
    </div>
  );
}

