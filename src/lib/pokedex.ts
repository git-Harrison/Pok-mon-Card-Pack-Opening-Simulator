"use client";

import { createClient } from "@/utils/supabase/client";
import { SETS, SET_ORDER } from "@/lib/sets";
import { RARITY_STYLE } from "@/lib/rarity";
import type { Card, Rarity } from "@/lib/types";

const supabase = createClient();

// 11 세트(m1l/m1s/m2/m2a/m3/m4/sv2a/sv5a/sv8/sv8a/sv10) 카탈로그
// 실측 카운트. 신규 세트가 들어올 때마다 src/lib/sets/* 와 함께 갱신.
// 서버 pokedex_completion_bonus(SQL) 의 임계값과 반드시 동기화.
export const RARITY_TOTALS: Record<Rarity, number> = {
  MUR: 6,
  UR: 17,
  SAR: 101,
  MA: 5,
  SR: 153,
  AR: 134,
  RR: 129,
  R: 134,
  U: 334,
  C: 587,
};

// 카드 희귀도별 완전 컬렉션 보너스 — 어렵게 모이는 희귀도일수록 더
// 큰 보상. 서버 pokedex_completion_bonus(uuid) 의 풀세트 값과 sync 필수
// (마지막 갱신: 20260662_pokedex_completion_bonus_round2.sql, 라운드 2).
export const RARITY_COMPLETION_BONUS: Record<Rarity, number> = {
  MUR: 60000,
  UR:  28000,
  SAR: 20000,
  SR:  15000,
  AR:  12000,
  MA:   9000,
  RR:   7000,
  R:    5000,
  U:    3000,
  C:    2000,
};

export interface PokedexEntry {
  id: string;
  card_id: string;
  rarity: string | null;
  registered_at: string;
}

/** 서버 pokedex_rarity_score(text) 와 정확히 동일한 매핑.
 *  20260563_pokedex_per_rarity_power.sql 와 sync 필수. */
export const POKEDEX_RARITY_SCORE: Record<Rarity, number> = {
  MUR: 1000,
  UR:  400,
  SAR: 250,
  AR:  180,
  SR:  130,
  MA:  100,
  RR:  50,
  R:   30,
  U:   15,
  C:   8,
};

/** 등록된 도감 항목들의 rarity 별 정액 합계.
 *  서버 pokedex_power_bonus(uuid) RPC 와 동일 공식 — 랭킹/프로필
 *  center_power 의 도감 보너스 부분과 정합. (이전엔 클라가 count 기반
 *  옛 공식을 사용해 /pokedex 페이지 표기와 랭킹 표기가 따로 놀았음.) */
export function pokedexPowerBonus(entries: PokedexEntry[]): number {
  let sum = 0;
  for (const e of entries) {
    const r = e.rarity as Rarity | null;
    if (!r) continue;
    sum += POKEDEX_RARITY_SCORE[r] ?? 0;
  }
  return sum;
}

/** 다음 추가 등록으로 얻을 수 있는 희귀도별 잠재 보너스 (희귀도별 미보유
 *  슬랩 1장 추가 시 환산값). UI 의 "어떤 희귀도를 더 모으면 +N" 안내용. */
export function pokedexNextDelta(): {
  rarity: Rarity;
  bonus: number;
}[] {
  return (Object.keys(POKEDEX_RARITY_SCORE) as Rarity[]).map((r) => ({
    rarity: r,
    bonus: POKEDEX_RARITY_SCORE[r],
  }));
}

export async function fetchPokedex(userId: string): Promise<PokedexEntry[]> {
  const { data, error } = await supabase.rpc("fetch_pokedex", {
    p_user_id: userId,
  });
  if (error) return [];
  return (data ?? []) as PokedexEntry[];
}

export async function bulkRegisterPokedex(userId: string) {
  const { data, error } = await supabase.rpc("bulk_register_pokedex_entries", {
    p_user_id: userId,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as {
    ok: boolean;
    error?: string;
    registered_count?: number;
    power_bonus?: number;
    new_pokedex_count?: number;
  };
}

let catalogCache: Card[] | null = null;

export function getAllCatalogCards(): Card[] {
  if (catalogCache) return catalogCache;
  const all: Card[] = [];
  for (const code of SET_ORDER) {
    const set = SETS[code];
    if (!set) continue;
    for (const c of set.cards) all.push(c);
  }
  all.sort((a, b) => {
    const ta = RARITY_STYLE[a.rarity]?.tier ?? -1;
    const tb = RARITY_STYLE[b.rarity]?.tier ?? -1;
    if (ta !== tb) return tb - ta;
    return a.id.localeCompare(b.id);
  });
  catalogCache = all;
  return all;
}
