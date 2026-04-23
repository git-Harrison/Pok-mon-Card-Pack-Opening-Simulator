"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useAuth } from "@/lib/auth";
import { fetchGifts, type GiftRow } from "@/lib/db";
import { getCard } from "@/lib/sets";
import { SETS } from "@/lib/sets";
import RarityBadge from "./RarityBadge";

type Tab = "received" | "sent";

export default function GiftsView() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("received");
  const [gifts, setGifts] = useState<{ received: GiftRow[]; sent: GiftRow[] }>(
    { received: [], sent: [] }
  );
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetchGifts(user.id);
      setGifts(res);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const list = useMemo(
    () => (tab === "received" ? gifts.received : gifts.sent),
    [tab, gifts]
  );

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-10 fade-in">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-4xl font-black text-white tracking-tight">
            선물함
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            친구에게 받은 카드 / 친구에게 보낸 카드 내역입니다.
          </p>
        </div>
      </div>

      <div className="mt-6 flex gap-2">
        <TabPill active={tab === "received"} onClick={() => setTab("received")}>
          받은 선물
          <span className="ml-1.5 text-[10px] opacity-70">
            {gifts.received.length}
          </span>
        </TabPill>
        <TabPill active={tab === "sent"} onClick={() => setTab("sent")}>
          보낸 선물
          <span className="ml-1.5 text-[10px] opacity-70">
            {gifts.sent.length}
          </span>
        </TabPill>
      </div>

      {loading ? (
        <div className="mt-16 flex justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
        </div>
      ) : list.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-white/10 bg-white/5 py-10 flex flex-col items-center gap-2 text-center px-4">
          <span className="text-4xl">📭</span>
          <p className="text-sm text-zinc-400">
            {tab === "received"
              ? "아직 받은 선물이 없습니다."
              : "아직 보낸 선물이 없습니다."}
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {list.map((g) => {
            const card = getCard(g.card_id);
            if (!card) return null;
            const counterparty =
              tab === "received" ? g.from_login : g.to_login;
            return (
              <li
                key={g.id}
                className="flex items-center gap-3 md:gap-4 p-3 rounded-xl bg-white/5 border border-white/10"
              >
                <div className="shrink-0 w-12 h-16 md:w-14 md:h-20 rounded overflow-hidden bg-zinc-900 ring-1 ring-white/10">
                  {card.imageUrl ? (
                    <img
                      src={card.imageUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <RarityBadge rarity={card.rarity} size="xs" />
                    <p className="text-sm text-white font-semibold truncate">
                      {card.name}
                    </p>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {SETS[card.setCode].name} · #{card.number}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-zinc-500 uppercase">
                    {tab === "received" ? "보낸 사람" : "받는 사람"}
                  </p>
                  <p className="text-sm text-white font-semibold">
                    {counterparty ?? "-"}
                  </p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">
                    {new Date(g.created_at).toLocaleString("ko-KR")}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TabPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold border transition",
        active
          ? "bg-white text-zinc-900 border-white"
          : "bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10 hover:text-white"
      )}
    >
      {children}
    </button>
  );
}
