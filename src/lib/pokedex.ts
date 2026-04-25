"use client";

import { createClient } from "@/utils/supabase/client";
import { SETS, SET_ORDER } from "@/lib/sets";
import { RARITY_STYLE } from "@/lib/rarity";
import type { Card, Rarity } from "@/lib/types";

const supabase = createClient();

export const RARITY_TOTALS: Record<Rarity, number> = {
  MUR: 2,
  UR: 14,
  SAR: 70,
  MA: 5,
  SR: 85,
  AR: 74,
  RR: 95,
  R: 98,
  U: 199,
  C: 405,
};

export const RARITY_COMPLETION_BONUS: Record<Rarity, number> = {
  MUR: 10000,
  UR: 6000,
  SAR: 5000,
  MA: 5000,
  SR: 5000,
  AR: 4000,
  RR: 3000,
  R: 2000,
  U: 1500,
  C: 1500,
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
