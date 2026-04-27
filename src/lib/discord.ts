"use client";

/**
 * Discord webhook notifications. Only these events fire — everything else
 * is intentionally silent:
 *
 *   1. Center sabotage success (attacker side)
 *   2. Taunt sent
 *   3. Gift sent
 *   4. Ranking position change (rank / power / pet tabs)
 */

async function post(body: Record<string, unknown>): Promise<void> {
  try {
    await fetch("/api/discord/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // Fire-and-forget — don't block user flow on webhook failure
  }
}

/** 센터 부수기 → 성공일 때만 알림. */
export function notifySabotage(
  attacker: string,
  victim: string,
  cardId: string,
  success: boolean
): void {
  if (!success) return;
  post({ kind: "sabotage", username: attacker, victim, cardId, success });
}

/** 조롱 전송 알림 (메시지는 200자로 잘려서 들어감). */
export function notifyTaunt(
  from: string,
  to: string,
  message: string
): void {
  post({ kind: "taunt", username: from, victim: to, message });
}

/** 선물(슬랩) 전송 알림. */
export function notifyGift(
  from: string,
  to: string,
  cardId: string,
  grade: number,
  price: number
): void {
  post({ kind: "gift", username: from, victim: to, cardId, grade, price });
}

export type RankMetric = "rank" | "power" | "pet";

/** 랭킹 순위 변동 알림 (prev → next 가 다를 때만). */
export function notifyRankChange(
  username: string,
  metric: RankMetric,
  prev: number,
  next: number
): void {
  if (prev === next) return;
  post({ kind: "rank-change", username, metric, prev, next });
}
