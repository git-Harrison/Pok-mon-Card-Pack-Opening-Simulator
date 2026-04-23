"use client";

import { createClient } from "@/utils/supabase/client";
import type { Card, SetCode } from "./types";
import { getCard } from "./sets";

const supabase = createClient();

export interface DbUser {
  id: string;
  user_id: string;
  age: number;
}

export interface WalletItem {
  card: Card;
  count: number;
  lastPulledAt: string;
}

export interface WalletSnapshot {
  items: WalletItem[];
  packsOpenedBySet: Record<SetCode, number>;
  totalCards: number;
}

export interface GiftRow {
  id: string;
  from_user_id: string;
  to_user_id: string;
  card_id: string;
  created_at: string;
  from_login?: string;
  to_login?: string;
}

// ---------- Auth ----------

export async function rpcLogin(loginId: string, password: string) {
  const { data, error } = await supabase.rpc("auth_login", {
    p_user_id: loginId,
    p_password: password,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as { ok: boolean; error?: string; user?: DbUser };
}

export async function rpcSignup(
  loginId: string,
  password: string,
  age: number
) {
  const { data, error } = await supabase.rpc("auth_signup", {
    p_user_id: loginId,
    p_password: password,
    p_age: age,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as { ok: boolean; error?: string; user?: DbUser };
}

// ---------- Wallet ----------

export async function fetchWallet(userId: string): Promise<WalletSnapshot> {
  const [ownershipRes, packsRes] = await Promise.all([
    supabase
      .from("card_ownership")
      .select("card_id, count, last_pulled_at")
      .eq("user_id", userId),
    supabase
      .from("pack_opens")
      .select("set_code")
      .eq("user_id", userId),
  ]);

  if (ownershipRes.error) throw ownershipRes.error;
  if (packsRes.error) throw packsRes.error;

  const items: WalletItem[] = [];
  for (const row of ownershipRes.data ?? []) {
    const card = getCard(row.card_id);
    if (!card) continue;
    items.push({
      card,
      count: row.count,
      lastPulledAt: row.last_pulled_at,
    });
  }

  const packsOpenedBySet: Record<SetCode, number> = { m2a: 0, m2: 0, sv8: 0 };
  let totalCards = 0;
  for (const row of packsRes.data ?? []) {
    const code = row.set_code as SetCode;
    if (code in packsOpenedBySet) packsOpenedBySet[code] += 1;
  }
  for (const it of items) totalCards += it.count;

  return { items, packsOpenedBySet, totalCards };
}

export async function recordPackPull(
  userId: string,
  setCode: SetCode,
  cardIds: string[]
) {
  const { data, error } = await supabase.rpc("record_pack_pull", {
    p_user_id: userId,
    p_set_code: setCode,
    p_card_ids: cardIds,
  });
  if (error) throw error;
  return data as { ok: boolean; pack_open_id: string };
}

// ---------- Gift ----------

export async function giftCard(
  fromUserId: string,
  toLoginId: string,
  cardId: string
) {
  const { data, error } = await supabase.rpc("gift_card", {
    p_from_id: fromUserId,
    p_to_user_id: toLoginId,
    p_card_id: cardId,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as { ok: boolean; error?: string };
}

export async function fetchGifts(userId: string): Promise<{
  received: GiftRow[];
  sent: GiftRow[];
}> {
  const [recv, sent] = await Promise.all([
    supabase
      .from("gifts")
      .select(
        "id, from_user_id, to_user_id, card_id, created_at, from:users!from_user_id(user_id), to:users!to_user_id(user_id)"
      )
      .eq("to_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("gifts")
      .select(
        "id, from_user_id, to_user_id, card_id, created_at, from:users!from_user_id(user_id), to:users!to_user_id(user_id)"
      )
      .eq("from_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (recv.error) throw recv.error;
  if (sent.error) throw sent.error;
  const shape = (rows: unknown[]): GiftRow[] =>
    (rows as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      from_user_id: r.from_user_id as string,
      to_user_id: r.to_user_id as string,
      card_id: r.card_id as string,
      created_at: r.created_at as string,
      from_login: (r.from as { user_id?: string } | null)?.user_id,
      to_login: (r.to as { user_id?: string } | null)?.user_id,
    }));
  return { received: shape(recv.data ?? []), sent: shape(sent.data ?? []) };
}
