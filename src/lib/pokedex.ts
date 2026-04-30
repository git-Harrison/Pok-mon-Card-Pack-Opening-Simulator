"use client";

import { createClient } from "@/utils/supabase/client";
import { SETS, SET_ORDER } from "@/lib/sets";
import { RARITY_STYLE } from "@/lib/rarity";
import type { Card, Rarity } from "@/lib/types";

const supabase = createClient();

// 19 세트 카탈로그 실측 카운트 — 기존 13 (m*/sv*) + 신규 6 (S 시리즈
// s4a/s6a/s7r/s8ap/s8b/s9a, 957장 추가). 신규 세트 추가 시 src/lib/sets/*
// 와 함께 갱신. 서버 pokedex_completion_bonus(SQL) 의 임계값과 반드시 동기화.
// (마지막 갱신: 20260680_pokedex_completion_bonus_v4_swsh.sql)
export const RARITY_TOTALS: Record<Rarity, number> = {
  MUR: 8,    // 직전과 동일 (M 시대 한정 등급)
  UR: 61,    // 17 → 61 (S 시대 HR/Gold 다수, 가장 큰 분모 증가)
  SAR: 184,  // 115 → 184
  MA: 5,     // 직전과 동일 (특수 등급, 분포 거의 없음)
  SR: 243,   // 169 → 243
  AR: 414,   // 278 → 414
  RR: 253,   // 141 → 253 (S 시대 V/VMAX/VSTAR 매핑)
  R: 288,    // 154 → 288
  U: 604,    // 397 → 604
  C: 845,    // 664 → 845
};

// 카드 희귀도별 완전 컬렉션 보너스 — 어렵게 모이는 희귀도일수록 더
// 큰 보상. 서버 pokedex_completion_bonus(uuid) 의 풀세트 값과 sync 필수.
// 라운드 5 (20260681_pokedex_completion_bonus_v5_dialup.sql) — 라운드 4 가
// 체감 부족하다는 피드백에 맞춰 전반 추가 상향. 저등급(C~SR)은 약 2x,
// 고등급(SAR/UR/MUR)도 +73~92%. 풀세트 최대 268,000 → 485,000 (+81%).
// 희귀도 순서 strict 단조 유지 (MUR > UR > SAR > SR > AR > MA > RR > R > U > C).
export const RARITY_COMPLETION_BONUS: Record<Rarity, number> = {
  MUR: 150000,
  UR:   90000,
  SAR:  65000,
  SR:   50000,
  AR:   40000,
  MA:   30000,
  RR:   24000,
  R:    18000,
  U:    10000,
  C:     8000,
};

export interface PokedexEntry {
  id: string;
  card_id: string;
  rarity: string | null;
  registered_at: string;
}

/** 서버 pokedex_rarity_score(text) 와 정확히 동일한 매핑.
 *  20260663_pokedex_rarity_score_rebalance.sql 와 sync 필수.
 *  카드 희귀도 strict 단조 (MUR > UR > SAR > SR > AR > MA > RR > R > U > C). */
export const POKEDEX_RARITY_SCORE: Record<Rarity, number> = {
  MUR: 1000,
  UR:  400,
  SAR: 250,
  SR:  180,
  AR:  120,
  MA:   80,
  RR:   50,
  R:    30,
  U:    15,
  C:     8,
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

/** 등록된 도감 항목들의 세트효과(완전 컬렉션) 부분 진행도 합산.
 *  서버 pokedex_completion_bonus(uuid) RPC 와 동일 공식 — 희귀도별
 *  floor(full_bonus × min(1, count/total)). 클라가 도감 페이지에서
 *  서버 호출 없이 자기 누적값을 바로 표시할 때 사용. */
export function pokedexCompletionBonus(entries: PokedexEntry[]): number {
  const counts: Partial<Record<Rarity, number>> = {};
  for (const e of entries) {
    const r = e.rarity as Rarity | null;
    if (!r) continue;
    counts[r] = (counts[r] ?? 0) + 1;
  }
  let sum = 0;
  for (const r of Object.keys(RARITY_COMPLETION_BONUS) as Rarity[]) {
    const count = counts[r] ?? 0;
    const total = RARITY_TOTALS[r];
    if (total <= 0) continue;
    const ratio = Math.min(1, count / total);
    sum += Math.floor(RARITY_COMPLETION_BONUS[r] * ratio);
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
