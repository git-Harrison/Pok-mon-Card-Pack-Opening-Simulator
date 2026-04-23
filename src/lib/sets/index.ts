import type { Card, SetCode, SetInfo } from "../types";
import { m2a } from "./m2a";
import { m2 } from "./m2";
import { sv8 } from "./sv8";

export const SETS: Record<SetCode, SetInfo> = { m2a, m2, sv8 };

export const SET_ORDER: SetCode[] = ["m2a", "m2", "sv8"];

export function getSet(code: string): SetInfo | null {
  return (SETS as Record<string, SetInfo | undefined>)[code] ?? null;
}

export function getCard(id: string): Card | null {
  for (const code of SET_ORDER) {
    const found = SETS[code].cards.find((c) => c.id === id);
    if (found) return found;
  }
  return null;
}

export { m2a, m2, sv8 };
