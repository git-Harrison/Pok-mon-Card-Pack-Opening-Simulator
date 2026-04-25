import type { Card, Rarity, SetInfo, SlotConfig } from "./types";
import { RARITY_STYLE } from "./rarity";

function pickRarity(slot: SlotConfig): Rarity {
  const entries = Object.entries(slot.weights) as [Rarity, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = Math.random() * total;
  for (const [rarity, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return rarity;
  }
  return entries[entries.length - 1][0];
}

function pickCardOfRarity(set: SetInfo, rarity: Rarity): Card | null {
  const pool = set.cards.filter((c) => c.rarity === rarity);
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

// Walk rarity tiers downward from the drawn rarity until we find a card in the pool.
// Makes the sim robust when a curated data file is missing cards of a specific rarity.
function fallbackDown(set: SetInfo, target: Rarity): Card {
  const tiers = Object.entries(RARITY_STYLE)
    .map(([r, v]) => ({ rarity: r as Rarity, tier: v.tier }))
    .sort((a, b) => b.tier - a.tier);
  const startTier = RARITY_STYLE[target].tier;
  for (const t of tiers) {
    if (t.tier > startTier) continue;
    const found = pickCardOfRarity(set, t.rarity);
    if (found) return found;
  }
  // Absolute fallback
  return set.cards[Math.floor(Math.random() * set.cards.length)];
}

function drawPack(set: SetInfo): Card[] {
  const result: Card[] = [];
  for (const slot of set.slots) {
    const rarity = pickRarity(slot);
    const card = pickCardOfRarity(set, rarity) ?? fallbackDown(set, rarity);
    result.push(card);
  }
  // Sort so the biggest pull is revealed last (reference-sim UX)
  return result.sort(
    (a, b) => RARITY_STYLE[a.rarity].tier - RARITY_STYLE[b.rarity].tier
  );
}

export function drawBox(set: SetInfo): Card[][] {
  return Array.from({ length: set.packsPerBox }, () => drawPack(set));
}
