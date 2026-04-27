"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { fetchUserGymMedals } from "@/lib/gym/db";
import type { UserGymMedal } from "@/lib/gym/types";
import { TYPE_STYLE } from "@/lib/wild/types";
import { DIFFICULTY_STYLE } from "@/lib/gym/types";

/** 프로필/랭킹/방문 프로필에서 공통 사용 — 유저가 획득한 체육관 메달
 *  목록. 비어 있으면 placeholder 노출. */
export default function GymMedalsList({
  userId,
  compact = false,
}: {
  userId: string | null | undefined;
  /** compact=true: 칩 형태 (랭킹 행). false: 그리드 카드 (프로필). */
  compact?: boolean;
}) {
  const [medals, setMedals] = useState<UserGymMedal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setMedals([]);
      setLoading(false);
      return;
    }
    let alive = true;
    fetchUserGymMedals(userId).then((m) => {
      if (alive) {
        setMedals(m);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  if (loading) return null;
  if (medals.length === 0) {
    if (compact) return null;
    return (
      <p className="text-[11px] text-zinc-500 text-center py-3">
        획득한 체육관 메달이 없어요.
      </p>
    );
  }

  if (compact) {
    return (
      <div className="inline-flex items-center gap-1 flex-wrap">
        {medals.map((m) => {
          const ts = TYPE_STYLE[m.gym_type];
          return (
            <span
              key={m.gym_id}
              title={`${m.gym_name} (${m.gym_type})`}
              className={clsx(
                "px-1 py-[1px] rounded text-[8px] md:text-[9px] font-black inline-flex items-center gap-0.5",
                ts.badge
              )}
            >
              🏅 {m.gym_type}
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {medals.map((m) => {
        const ts = TYPE_STYLE[m.gym_type];
        const ds = DIFFICULTY_STYLE[m.gym_difficulty];
        return (
          <li
            key={m.gym_id}
            className={clsx(
              "relative rounded-xl border p-2 bg-zinc-900/60",
              "border-amber-400/30"
            )}
          >
            <div className="flex items-center gap-1.5">
              <span aria-hidden className="text-xl">🏅</span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-black text-amber-100 truncate">
                  {m.medal_name}
                </p>
                <p className="text-[9px] text-zinc-400 truncate">
                  {m.gym_name}
                </p>
              </div>
            </div>
            <div className="mt-1.5 flex items-center gap-1 flex-wrap">
              <span className={clsx("px-1 py-[1px] rounded text-[8px] font-black", ts.badge)}>
                {m.gym_type}
              </span>
              <span className={clsx("px-1 py-[1px] rounded text-[8px] font-black", ds.badge)}>
                {ds.label}
              </span>
              {m.currently_owned && (
                <span className="px-1 py-[1px] rounded text-[8px] font-black bg-fuchsia-500 text-white">
                  점령 중
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
