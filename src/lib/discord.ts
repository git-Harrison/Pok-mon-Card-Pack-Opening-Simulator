"use client";

import type { Card } from "./types";

/** Rarities that trigger auto-notifications on pack pulls. */
const NOTIFY_RARITIES = new Set<Card["rarity"]>(["SAR", "MUR", "UR"]);

async function post(body: Record<string, unknown>): Promise<void> {
  try {
    await fetch("/api/discord/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // Fire-and-forget — don't block the user's flow on a failed webhook
  }
}

/**
 * Auto-notify every SAR / MUR / UR card pulled in a pack (or set of packs).
 * Sends one Discord embed per hit card, in parallel. Silent on failure.
 */
export function notifyPackHits(
  username: string,
  cards: Card[],
  setCode: string
): void {
  const hits = cards.filter((c) => NOTIFY_RARITIES.has(c.rarity));
  if (hits.length === 0) return;
  // Fire in parallel; Discord rate-limit of 30 req/min is way more than
  // any realistic single-box bulk open can trigger.
  for (const card of hits) {
    post({
      kind: "card-hit",
      username,
      cardId: card.id,
      setCode,
    });
  }
}

/** Auto-notify on PSA grade 9 or 10 only (below that isn't brag-worthy). */
export function notifyPsaGrade(
  username: string,
  cardId: string,
  grade: number
): void {
  if (grade < 9) return;
  post({
    kind: "psa-success",
    username,
    cardId,
    grade,
  });
}

/** Auto-notify when PSA grading fails (card destroyed). */
export function notifyPsaFail(username: string, cardId: string): void {
  post({
    kind: "psa-fail",
    username,
    cardId,
  });
}
