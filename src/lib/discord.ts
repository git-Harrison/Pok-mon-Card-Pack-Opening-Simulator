"use client";

export type ShareKind = "pack-open" | "psa-success" | "psa-fail";

export interface ShareBody {
  kind: ShareKind;
  username: string;
  setCode?: string;
  cardIds?: string[];
  cardId?: string;
  grade?: number;
}

export async function shareToDiscord(
  body: ShareBody
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/discord/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: data?.error ?? `공유 실패 (${res.status})`,
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "공유 실패",
    };
  }
}
