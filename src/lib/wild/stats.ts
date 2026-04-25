import type { Rarity } from "@/lib/types";

/**
 * Derive battle stats for a PCL-graded slab from (rarity, grade).
 * HP + ATK scale with both. Grade is the bigger lever.
 */
export interface BattleStats {
  hp: number;
  atk: number;
}

const BASE_BY_RARITY: Record<Rarity, BattleStats> = {
  C:   { hp: 30, atk:  8 },
  U:   { hp: 34, atk:  9 },
  R:   { hp: 38, atk: 10 },
  RR:  { hp: 42, atk: 12 },
  AR:  { hp: 48, atk: 13 },
  SR:  { hp: 55, atk: 15 },
  MA:  { hp: 60, atk: 16 },
  SAR: { hp: 70, atk: 18 },
  UR:  { hp: 80, atk: 20 },
  MUR: { hp: 95, atk: 24 },
};

const GRADE_MULT: Record<number, number> = {
  6: 1.0,
  7: 1.1,
  8: 1.3,
  9: 1.6,
  10: 2.0,
};

export function slabStats(rarity: Rarity, grade: number): BattleStats {
  const base = BASE_BY_RARITY[rarity] ?? BASE_BY_RARITY.C;
  const mult = GRADE_MULT[grade] ?? 1;
  return {
    hp: Math.round(base.hp * mult),
    atk: Math.round(base.atk * mult),
  };
}

/**
 * Compute damage dealt by attacker → defender.
 * damage = round(attacker.atk * effectiveness * jitter(0.9~1.1))
 */
export function computeDamage(
  atk: number,
  effectivenessMult: number
): number {
  if (effectivenessMult === 0) return 0;
  const jitter = 0.9 + Math.random() * 0.2;
  return Math.max(1, Math.round(atk * effectivenessMult * jitter));
}

/** Reward per win — flat 20,000p (server also grants +50 rank points). */
export function winReward(_wildHp: number): number {
  return 20_000;
}
