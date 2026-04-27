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

// 등급별 완전 컬렉션 보너스 — 어렵게 모이는 등급일수록 더 큰 보상.
// 카드 수 늘어난 만큼 보너스도 비례 상향.
export const RARITY_COMPLETION_BONUS: Record<Rarity, number> = {
  MUR: 15000,
  UR:   9000,
  SAR:  8000,
  MA:   5000,
  SR:   7500,
  AR:   6500,
  RR:   5500,
  R:    4500,
  U:    3500,
  C:    3000,
};

export interface PokedexEntry {
  id: string;
  card_id: string;
  rarity: string | null;
  registered_at: string;
}

export interface PokedexBreakpoint {
  count: number;
  bonus: number;
  label: string;
}

export const POKEDEX_BREAKPOINTS: PokedexBreakpoint[] = [
  { count: 5,  bonus: 500,   label: "+500" },
  { count: 10, bonus: 1200,  label: "+1,200" },
  { count: 15, bonus: 2000,  label: "+2,000" },
  { count: 20, bonus: 3000,  label: "+3,000" },
  { count: 30, bonus: 5000,  label: "+5,000" },
];

export function pokedexPowerBonus(count: number): number {
  const n = Math.max(0, count | 0);
  if (n >= 30) return 5000 + (n - 30) * 100;
  if (n >= 20) return 3000 + (n - 20) * 200;
  if (n >= 15) return 2000 + (n - 15) * 200;
  if (n >= 10) return 1200 + (n - 10) * 160;
  if (n >= 5)  return 500  + (n - 5)  * 140;
  if (n >= 1)  return n * 100;
  return 0;
}

export function nextBreakpoint(count: number): {
  remaining: number;
  bonusAtNext: number;
  delta: number;
} | null {
  for (const b of POKEDEX_BREAKPOINTS) {
    if (count < b.count) {
      return {
        remaining: b.count - count,
        bonusAtNext: b.bonus,
        delta: b.bonus - pokedexPowerBonus(count),
      };
    }
  }
  return null;
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
