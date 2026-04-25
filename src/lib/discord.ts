"use client";

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

/** Auto-notify on PSA grade 9 or 10 only. */
export function notifyPsaGrade(
  username: string,
  cardId: string,
  grade: number
): void {
  if (grade < 9) return;
  post({ kind: "psa-success", username, cardId, grade });
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
