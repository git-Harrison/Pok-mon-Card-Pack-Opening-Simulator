"use client";

import type { Card, Rarity } from "./types";

/** Rarities that trigger pack-pull auto-notifications. */
const NOTIFY_RARITIES = new Set<Rarity>(["SAR", "UR", "MUR"]);

async function post(body: Record<string, unknown>): Promise<void> {
  try {
    await fetch("/api/discord/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // Fire-and-forget — don't block the user's flow on webhook failure
  }
}

/**
 * Auto-notify every SAR / UR / MUR card pulled in a pack (or set of packs).
 * AR is intentionally EXCLUDED per spec. Sends one embed per hit card.
 */
export function notifyPackHits(username: string, cards: Card[]): void {
  const hits = cards.filter((c) => NOTIFY_RARITIES.has(c.rarity));
  if (hits.length === 0) return;
  for (const card of hits) {
    post({ kind: "card-hit", username, cardId: card.id });
  }
}

/** Auto-notify on PSA grade 9 or 10 only. */
export function notifyPsaGrade(
  username: string,
  cardId: string,
  grade: number
): void {
  if (grade < 9) return;
  post({ kind: "psa-success", username, cardId, grade });
}

/** Auto-notify when PSA grading fails (card destroyed). */
export function notifyPsaFail(username: string, cardId: string): void {
  post({ kind: "psa-fail", username, cardId });
}

/** Auto-notify on center sabotage attempts (success or fail). */
export function notifySabotage(
  attacker: string,
  victim: string,
  cardId: string,
  success: boolean
): void {
  post({ kind: "sabotage", username: attacker, victim, cardId, success });
}
