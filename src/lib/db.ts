"use client";

import { createClient } from "@/utils/supabase/client";
import type {
  Card,
  GiftQuota,
  GiftStatus,
  MerchantState,
  PsaGrading,
  SetCode,
} from "./types";
import { getCard } from "./sets";

const supabase = createClient();

export interface DbUser {
  id: string;
  user_id: string;
  display_name: string;
  age: number;
  points: number;
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
  status: GiftStatus;
  price_points: number;
  expires_at: string;
  accepted_at: string | null;
  settled_at: string | null;
  created_at: string;
  message: string | null;
  from_login?: string;
  to_login?: string;
  from_nickname?: string;
  to_nickname?: string;
}

// ---------- Auth ----------

export async function rpcLogin(loginId: string, password: string) {
  const { data, error } = await supabase.rpc("auth_login", {
    p_user_id: loginId,
    p_password: password,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as {
    ok: boolean;
    error?: string;
    user?: {
      id: string;
      user_id: string;
      age: number;
      display_name: string;
    };
  };
}

export async function rpcSignup(
  loginId: string,
  password: string,
  age: number,
  displayName: string
) {
  const { data, error } = await supabase.rpc("auth_signup", {
    p_user_id: loginId,
    p_password: password,
    p_age: age,
    p_display_name: displayName,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as {
    ok: boolean;
    error?: string;
    user?: {
      id: string;
      user_id: string;
      age: number;
      display_name: string;
    };
  };
}

export async function fetchMe(userId: string): Promise<DbUser | null> {
  const { data, error } = await supabase
    .from("users")
    .select("id, user_id, display_name, age, points")
    .eq("id", userId)
    .single();
  if (error || !data) return null;
  return data as DbUser;
}

// ---------- Wallet ----------

export async function fetchWallet(userId: string): Promise<WalletSnapshot> {
  const [ownershipRes, packsRes] = await Promise.all([
    supabase
      .from("card_ownership")
      .select("card_id, count, last_pulled_at")
      .eq("user_id", userId),
    supabase.from("pack_opens").select("set_code").eq("user_id", userId),
  ]);

  if (ownershipRes.error) throw ownershipRes.error;
  if (packsRes.error) throw packsRes.error;

  const items: WalletItem[] = [];
  for (const row of ownershipRes.data ?? []) {
    const card = getCard(row.card_id);
    if (!card) continue;
    items.push({ card, count: row.count, lastPulledAt: row.last_pulled_at });
  }

  const packsOpenedBySet: Record<SetCode, number> = {
    m2a: 0,
    m2: 0,
    sv8: 0,
    sv2a: 0,
    sv8a: 0,
    sv5a: 0,
  };
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

// ---------- Box purchase ----------

export async function buyBox(userId: string, setCode: SetCode) {
  const { data, error } = await supabase.rpc("buy_box", {
    p_user_id: userId,
    p_set_code: setCode,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as {
    ok: boolean;
    error?: string;
    price?: number;
    points?: number;
  };
}

// ---------- Merchant ----------

export async function getMerchantState(userId: string): Promise<MerchantState> {
  const { data, error } = await supabase.rpc("get_merchant_state", {
    p_user_id: userId,
  });
  if (error) throw error;
  return data as MerchantState;
}

export async function refreshMerchantRPC(
  userId: string,
  newCardId: string,
  price: number
) {
  const { data, error } = await supabase.rpc("refresh_merchant", {
    p_user_id: userId,
    p_new_card_id: newCardId,
    p_price: price,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as {
    ok: boolean;
    error?: string;
    card_id?: string;
    price?: number;
    refreshes_remaining?: number;
    next_refresh_at?: string;
  };
}

export async function sellToMerchant(userId: string, cardId: string) {
  const { data, error } = await supabase.rpc("sell_to_merchant", {
    p_user_id: userId,
    p_card_id: cardId,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as { ok: boolean; error?: string; earned?: number; points?: number };
}

// ---------- Gifts ----------

export async function createGift(
  fromUserId: string,
  toNickname: string,
  cardId: string,
  pricePoints: number,
  message?: string
) {
  const { data, error } = await supabase.rpc("create_gift", {
    p_from_id: fromUserId,
    p_to_user_id: toNickname,
    p_card_id: cardId,
    p_price_points: pricePoints,
    p_message: message ?? null,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as {
    ok: boolean;
    error?: string;
    gift_id?: string;
    daily_used?: number;
    daily_limit?: number;
  };
}

export async function fetchGiftQuota(userId: string): Promise<GiftQuota> {
  const { data, error } = await supabase.rpc("gift_quota", {
    p_user_id: userId,
  });
  if (error) return { used: 0, limit: 5, remaining: 5 };
  return data as GiftQuota;
}

export async function acceptGift(giftId: string, userId: string) {
  const { data, error } = await supabase.rpc("accept_gift", {
    p_gift_id: giftId,
    p_user_id: userId,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as { ok: boolean; error?: string };
}

export async function declineGift(giftId: string, userId: string) {
  const { data, error } = await supabase.rpc("decline_gift", {
    p_gift_id: giftId,
    p_user_id: userId,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as { ok: boolean; error?: string };
}

export async function expirePendingGifts() {
  await supabase.rpc("expire_pending_gifts");
}

// ---------- PSA grading ----------

export async function submitPsaGrading(userId: string, cardId: string) {
  const { data, error } = await supabase.rpc("submit_psa_grading", {
    p_user_id: userId,
    p_card_id: cardId,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as {
    ok: boolean;
    error?: string;
    grade?: number;
    failed?: boolean;
    bonus?: number;
    points?: number;
  };
}

export interface RankingPsaGrading {
  id: string;
  card_id: string;
  grade: number;
  graded_at: string;
}

export interface RankingRow {
  id: string;
  user_id: string;
  display_name: string;
  age: number;
  points: number;
  rank_score: number;
  psa_count: number;
  psa_10: number;
  psa_9: number;
  psa_8: number;
  psa_7: number;
  psa_6: number;
  showcase_count: number;
  gradings: RankingPsaGrading[];
}

export async function fetchUserRankings(): Promise<RankingRow[]> {
  const { data, error } = await supabase.rpc("get_user_rankings");
  if (error) return [];
  return (data ?? []) as RankingRow[];
}

export interface BulkSellItem {
  card_id: string;
  count: number;
  price: number;
}

export async function bulkSellCards(userId: string, items: BulkSellItem[]) {
  const { data, error } = await supabase.rpc("bulk_sell_cards", {
    p_user_id: userId,
    p_items: items,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as {
    ok: boolean;
    error?: string;
    sold?: number;
    earned?: number;
    points?: number;
  };
}

export async function fetchPsaGradings(
  userId: string
): Promise<PsaGrading[]> {
  // Uses the v4 helper that excludes slabs currently on display in
  // the user's museum — those are considered 전시 중이라 지갑에서 제외.
  return fetchUndisplayedGradings(userId);
}

// ---------- Admin ----------

export interface AdminUserRow {
  id: string;
  user_id: string;
  display_name: string;
  age: number;
  points: number;
}

export async function adminListUsers(adminId: string) {
  const { data, error } = await supabase.rpc("admin_list_users", {
    p_admin_id: adminId,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as {
    ok: boolean;
    error?: string;
    users?: AdminUserRow[];
  };
}

export async function adminGrantPoints(
  adminId: string,
  target: string,
  amount: number
) {
  const { data, error } = await supabase.rpc("admin_grant_points", {
    p_admin_id: adminId,
    p_target: target,
    p_amount: amount,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as {
    ok: boolean;
    error?: string;
    target_name?: string;
    amount?: number;
    points?: number;
  };
}

// ---------- Center (museum) ----------

import type { ShowcaseType } from "./center";

export interface CenterShowcaseCard {
  slot_index: number;
  grading_id: string;
  card_id: string;
  grade: number;
}

export interface CenterShowcase {
  id: string;
  showcase_type: ShowcaseType;
  slot_x: number;
  slot_y: number;
  cards: CenterShowcaseCard[];
}

export async function fetchUserCenter(
  userId: string
): Promise<CenterShowcase[]> {
  const { data, error } = await supabase.rpc("get_user_center", {
    p_user_id: userId,
  });
  if (error) return [];
  return (data ?? []) as CenterShowcase[];
}

export async function buyShowcase(
  userId: string,
  type: ShowcaseType,
  slotX: number,
  slotY: number
) {
  const { data, error } = await supabase.rpc("buy_showcase", {
    p_user_id: userId,
    p_type: type,
    p_slot_x: slotX,
    p_slot_y: slotY,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as {
    ok: boolean;
    error?: string;
    showcase_id?: string;
    price?: number;
    points?: number;
  };
}

export async function displayGrading(
  userId: string,
  showcaseId: string,
  slotIndex: number,
  gradingId: string
) {
  const { data, error } = await supabase.rpc("display_grading", {
    p_user_id: userId,
    p_showcase_id: showcaseId,
    p_slot_index: slotIndex,
    p_grading_id: gradingId,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as { ok: boolean; error?: string };
}

export async function undisplayGrading(
  userId: string,
  showcaseId: string,
  slotIndex: number
) {
  const { data, error } = await supabase.rpc("undisplay_grading", {
    p_user_id: userId,
    p_showcase_id: showcaseId,
    p_slot_index: slotIndex,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as { ok: boolean; error?: string };
}

export async function fetchUndisplayedGradings(
  userId: string
): Promise<PsaGrading[]> {
  const { data, error } = await supabase.rpc("get_undisplayed_gradings", {
    p_user_id: userId,
  });
  if (error) return [];
  return (data ?? []) as PsaGrading[];
}

export async function removeShowcase(userId: string, showcaseId: string) {
  const { data, error } = await supabase.rpc("remove_showcase", {
    p_user_id: userId,
    p_showcase_id: showcaseId,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as { ok: boolean; error?: string };
}

export interface VisitCenter {
  ok: boolean;
  error?: string;
  owner_id?: string;
  login_id?: string;
  display_name?: string;
  showcases?: CenterShowcase[];
}

export async function claimShowcaseIncome(userId: string) {
  const { data, error } = await supabase.rpc("claim_showcase_income", {
    p_user_id: userId,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as {
    ok: boolean;
    error?: string;
    earned?: number;
    card_count?: number;
    points?: number;
  };
}

export async function fetchCenterByLogin(loginId: string): Promise<VisitCenter> {
  const { data, error } = await supabase.rpc("get_user_center_by_login", {
    p_login: loginId,
  });
  if (error) return { ok: false, error: error.message };
  return data as VisitCenter;
}

export interface SabotageLog {
  id: string;
  attacker_name: string;
  card_id: string | null;
  grade: number | null;
  showcase_type: string | null;
  success: boolean;
  created_at: string;
}

export async function fetchSabotageLogs(
  userId: string
): Promise<SabotageLog[]> {
  const { data, error } = await supabase.rpc("get_sabotage_logs", {
    p_user_id: userId,
  });
  if (error) return [];
  return (data ?? []) as SabotageLog[];
}

export async function sabotageCard(
  attackerId: string,
  showcaseId: string,
  slotIndex: number
) {
  const { data, error } = await supabase.rpc("sabotage_card", {
    p_attacker_id: attackerId,
    p_showcase_id: showcaseId,
    p_slot_index: slotIndex,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as {
    ok: boolean;
    error?: string;
    success?: boolean;
    cost?: number;
    loot?: number;
    points?: number;
    attacker_name?: string;
    victim_id?: string;
    victim_name?: string;
    victim_login?: string;
    card_id?: string;
    grade?: number;
    cards_destroyed?: number;
  };
}

export async function fetchGifts(userId: string): Promise<{
  received: GiftRow[];
  sent: GiftRow[];
}> {
  // Sweep expired gifts first so stale ones surface with correct status.
  await expirePendingGifts();

  const select =
    "id, from_user_id, to_user_id, card_id, status, price_points, expires_at, accepted_at, settled_at, created_at, message, from:users!from_user_id(user_id, display_name), to:users!to_user_id(user_id, display_name)";

  const [recv, sent] = await Promise.all([
    supabase
      .from("gifts")
      .select(select)
      .eq("to_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("gifts")
      .select(select)
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
      status: r.status as GiftStatus,
      price_points: (r.price_points as number) ?? 0,
      expires_at: r.expires_at as string,
      accepted_at: (r.accepted_at as string | null) ?? null,
      settled_at: (r.settled_at as string | null) ?? null,
      created_at: r.created_at as string,
      message: (r.message as string | null) ?? null,
      from_login: (r.from as { user_id?: string } | null)?.user_id,
      to_login: (r.to as { user_id?: string } | null)?.user_id,
      from_nickname: (r.from as { display_name?: string } | null)?.display_name,
      to_nickname: (r.to as { display_name?: string } | null)?.display_name,
    }));
  return { received: shape(recv.data ?? []), sent: shape(sent.data ?? []) };
}
