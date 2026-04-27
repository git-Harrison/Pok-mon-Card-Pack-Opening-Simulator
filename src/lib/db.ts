"use client";

import { createClient } from "@/utils/supabase/client";
import type {
  Card,
  GiftQuota,
  GiftStatus,
  PclGrading,
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
  character?: string | null;
  pet_score?: number;
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
  grading_id: string | null;
  card_id: string | null;
  grade: number | null;
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
    .select("id, user_id, display_name, age, points, character, pet_score")
    .eq("id", userId)
    .single();
  if (error || !data) return null;
  return data as DbUser;
}

// ---------- Users directory ----------

export interface UserListEntry {
  id: string;
  user_id: string;
  display_name: string;
  character: string | null;
}

export async function fetchAllUsers(): Promise<UserListEntry[]> {
  const { data, error } = await supabase.rpc("list_users");
  if (error) return [];
  return (data ?? []) as UserListEntry[];
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
    sv10: 0,
    m1l: 0,
    m1s: 0,
    m3: 0,
  };
  let totalCards = 0;
  for (const row of packsRes.data ?? []) {
    const code = row.set_code as SetCode;
    if (code in packsOpenedBySet) packsOpenedBySet[code] += 1;
  }
  for (const it of items) totalCards += it.count;
  return { items, packsOpenedBySet, totalCards };
}

export interface BatchPullPack {
  card_ids: string[];
  rarities: string[];
}

export async function recordPackPullsBatch(
  userId: string,
  setCode: SetCode,
  pulls: BatchPullPack[],
  autoSellRarities: string[] | null
) {
  const { data, error } = await supabase.rpc("record_pack_pulls_batch", {
    p_user_id: userId,
    p_set_code: setCode,
    p_pulls: pulls,
    p_auto_sell_rarities: autoSellRarities,
  });
  if (error) throw error;
  return data as {
    ok: boolean;
    error?: string;
    pack_count: number;
    total_kept: number;
    total_sold_count: number;
    total_sold_earned: number;
    points: number;
  };
}

// ---------- Box purchase ----------

export async function refundBoxPurchase(userId: string, setCode: SetCode) {
  const { data, error } = await supabase.rpc("refund_box_purchase", {
    p_user_id: userId,
    p_set_code: setCode,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as {
    ok: boolean;
    refunded?: number;
    points?: number;
  };
}

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

// ---------- Gifts ----------

export async function createGift(
  fromUserId: string,
  toNickname: string,
  gradingId: string,
  pricePoints: number,
  message?: string
) {
  const { data, error } = await supabase.rpc("create_gift", {
    p_from_id: fromUserId,
    p_to_user_id: toNickname,
    p_grading_id: gradingId,
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

export async function cancelGift(giftId: string, userId: string) {
  const { data, error } = await supabase.rpc("cancel_gift", {
    p_gift_id: giftId,
    p_user_id: userId,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as { ok: boolean; error?: string };
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

async function expirePendingGifts() {
  await supabase.rpc("expire_pending_gifts");
}

// ---------- PCL grading ----------

export interface BulkGradingResultItem {
  card_id: string;
  ok: boolean;
  failed?: boolean;
  grade?: number;
  bonus?: number;
  auto_sold?: boolean;
  sell_payout?: number;
  error?: string;
}

export interface BulkGradingResult {
  ok: boolean;
  error?: string;
  results?: BulkGradingResultItem[];
  success_count?: number;
  fail_count?: number;
  skipped_count?: number;
  cap_skipped_count?: number;
  auto_sold_count?: number;
  auto_sold_earned?: number;
  bonus?: number;
  points?: number;
}

export async function bulkSubmitPclGrading(
  userId: string,
  cardIds: string[],
  rarities: string[],
  autoSellBelowGrade: number | null = null
): Promise<BulkGradingResult> {
  const { data, error } = await supabase.rpc("bulk_submit_pcl_grading", {
    p_user_id: userId,
    p_card_ids: cardIds,
    p_rarities: rarities,
    p_auto_sell_below_grade: autoSellBelowGrade,
  });
  if (error) return { ok: false, error: error.message };
  return data as BulkGradingResult;
}

export interface RankingPclGrading {
  id: string;
  card_id: string;
  grade: number;
  graded_at: string;
}

export interface RankingMainCard {
  id: string;
  card_id: string;
  grade: number;
  rarity: string;
}

export interface RankingRow {
  id: string;
  user_id: string;
  display_name: string;
  age: number;
  points: number;
  rank_score: number;
  showcase_count: number;
  /** Successful sabotage attempts by this user (each worth +100 rank). */
  sabotage_wins: number;
  /** Σ rarity_power × pcl_power across currently-displayed slabs. */
  center_power: number;
  /** Selected trainer character key, or null if unset. */
  character: string | null;
  /** Σ rarity_score × 10 across registered pet slabs. Max 500. */
  pet_score: number;
  /** Pet slot order — uuid[] of grading rows. */
  main_card_ids?: string[];
  /** Pet slabs (PCL10) in slot order, with rarity for thumbnails. */
  main_cards?: RankingMainCard[];
  /** Pokedex registered count (for /users dropdown). */
  pokedex_count?: number;
  /** Seconds since last_seen_at — used to render the online dot. */
  seconds_since_seen?: number;
  gradings: RankingPclGrading[];
}

export async function fetchUserRankings(): Promise<RankingRow[]> {
  const { data, error } = await supabase.rpc("get_user_rankings");
  if (error) return [];
  return (data ?? []) as RankingRow[];
}

export type UserActivityTab = "rank" | "power" | "pet";

export interface UserActivityEvent {
  label: string;
  /** 카드 코드 (예: "m2-086"). 클라이언트에서 포켓몬 한글 이름으로 치환. */
  card_id?: string | null;
  /** 양수 = 점수 획득, 음수 = 점수 손실 (사보타지 피해 등). */
  points: number;
  source: string;
  occurred_at: string;
}

export async function fetchUserActivity(
  userId: string,
  tab: UserActivityTab
): Promise<UserActivityEvent[]> {
  try {
    const { data, error } = await supabase.rpc("get_user_activity", {
      p_user_id: userId,
      p_tab: tab,
    });
    if (error) {
      console.warn("get_user_activity error", error.message);
      return [];
    }
    return (data ?? []) as UserActivityEvent[];
  } catch (err) {
    console.warn("get_user_activity threw", err);
    return [];
  }
}

export interface BulkSellItem {
  card_id: string;
  count: number;
  rarity: string;
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

export async function fetchPclGradings(
  userId: string
): Promise<PclGrading[]> {
  // Uses the v4 helper that excludes slabs currently on display in
  // the user's museum — those are considered 전시 중이라 지갑에서 제외.
  return fetchUndisplayedGradings(userId);
}

// ---------- Taunts ----------

export interface TauntRow {
  id: string;
  from_user_id: string | null;
  from_name: string;
  to_user_id: string;
  message: string;
  seen: boolean;
  created_at: string;
}

export async function sendTaunt(
  fromUserId: string,
  toLogin: string,
  message: string
) {
  const { data, error } = await supabase.rpc("send_taunt", {
    p_from_id: fromUserId,
    p_to_login: toLogin,
    p_message: message,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as { ok: boolean; error?: string };
}

export async function fetchUnseenTaunts(userId: string): Promise<TauntRow[]> {
  const { data, error } = await supabase.rpc("fetch_unseen_taunts", {
    p_user_id: userId,
  });
  if (error) return [];
  return (data ?? []) as TauntRow[];
}

export async function markTauntSeen(tauntId: string, userId: string) {
  const { error } = await supabase.rpc("mark_taunt_seen", {
    p_taunt_id: tauntId,
    p_user_id: userId,
  });
  return { ok: !error };
}

export interface TauntEntry {
  id: string;
  from_user_id: string;
  from_name: string;
  to_user_id: string;
  to_name: string;
  message: string;
  created_at: string;
}

export async function fetchTauntHistory(
  userId: string
): Promise<{
  ok: boolean;
  sent: TauntEntry[];
  received: TauntEntry[];
  error?: string;
}> {
  const { data, error } = await supabase.rpc("get_taunt_history", {
    p_user_id: userId,
    p_limit: 50,
  });
  if (error) return { ok: false, sent: [], received: [], error: error.message };
  const out = (data ?? {}) as {
    ok?: boolean;
    sent?: TauntEntry[];
    received?: TauntEntry[];
    error?: string;
  };
  return {
    ok: out.ok ?? false,
    sent: out.sent ?? [],
    received: out.received ?? [],
    error: out.error,
  };
}

// ---------- Gift badge ----------

export async function fetchUnseenGiftCount(userId: string): Promise<number> {
  const { data, error } = await supabase.rpc("fetch_unseen_gift_count", {
    p_user_id: userId,
  });
  if (error) return 0;
  return (data as number) ?? 0;
}

export async function markGiftsViewed(userId: string) {
  const { error } = await supabase.rpc("mark_gifts_viewed", {
    p_user_id: userId,
  });
  return { ok: !error };
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

/**
 * 페이지 단계 일괄 전시 — 사용자가 고른 PCL 9·10 슬랩 N 장을 동일 종류
 * 보관함 N 개에 묶어 박제한다. 한 트랜잭션 안에서 빈 자리(left→right,
 * top→bottom)를 자동 할당하고 N × showcase_price 만큼 포인트를 차감한다.
 */
export async function bulkCreateShowcases(
  userId: string,
  showcaseType: ShowcaseType,
  gradingIds: string[]
) {
  const { data, error } = await supabase.rpc("bulk_create_showcases", {
    p_user_id: userId,
    p_showcase_type: showcaseType,
    p_grading_ids: gradingIds,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as {
    ok: boolean;
    error?: string;
    created_count?: number;
    total_cost?: number;
    points?: number;
  };
}

export async function fetchUndisplayedGradings(
  userId: string
): Promise<PclGrading[]> {
  const { data, error } = await supabase.rpc("get_undisplayed_gradings", {
    p_user_id: userId,
  });
  if (error) return [];
  return (data ?? []) as PclGrading[];
}

export interface PclGradingWithDisplay extends PclGrading {
  displayed: boolean;
}

export async function fetchAllGradingsWithDisplay(
  userId: string
): Promise<PclGradingWithDisplay[]> {
  const { data, error } = await supabase.rpc("get_all_gradings_with_display", {
    p_user_id: userId,
  });
  if (error) return [];
  return (data ?? []) as PclGradingWithDisplay[];
}

export async function wildBattleReward(userId: string, amount: number) {
  const { data, error } = await supabase.rpc("wild_battle_reward", {
    p_user_id: userId,
    p_amount: amount,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as { ok: boolean; awarded?: number; points?: number };
}

export async function wildBattleLoss(userId: string, gradingId: string) {
  const { data, error } = await supabase.rpc("wild_battle_loss", {
    p_user_id: userId,
    p_grading_id: gradingId,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as {
    ok: boolean;
    error?: string;
    card_id?: string;
    grade?: number;
    rarity?: string;
  };
}

export async function bulkSellGradings(userId: string, gradingIds: string[]) {
  const { data, error } = await supabase.rpc("bulk_sell_gradings", {
    p_user_id: userId,
    p_grading_ids: gradingIds,
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
    earned_rank?: number;
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

export interface CenterVisitStats {
  ok: boolean;
  error?: string;
  user_id?: string;
  login_id?: string;
  display_name?: string;
  character?: string | null;
  pet_score?: number;
  showcase_count?: number;
  income_per_hour_trade?: number;
  income_per_hour_rank?: number;
  showcase_rank_pts?: number;
  income_rank_position?: number;
  income_rank_total?: number;
}

export async function fetchCenterVisitStats(
  loginId: string
): Promise<CenterVisitStats> {
  const { data, error } = await supabase.rpc("get_center_visit_stats", {
    p_login_id: loginId,
  });
  if (error) return { ok: false, error: error.message };
  return (data ?? { ok: false }) as CenterVisitStats;
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
    "id, from_user_id, to_user_id, grading_id, card_id, status, price_points, expires_at, accepted_at, settled_at, created_at, message, grading:psa_gradings!grading_id(grade, card_id), from:users!from_user_id(user_id, display_name), to:users!to_user_id(user_id, display_name)";

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
    (rows as Record<string, unknown>[]).map((r) => {
      const grading = r.grading as
        | { grade?: number; card_id?: string }
        | null;
      return {
        id: r.id as string,
        from_user_id: r.from_user_id as string,
        to_user_id: r.to_user_id as string,
        grading_id: (r.grading_id as string | null) ?? null,
        card_id: (grading?.card_id ?? (r.card_id as string | null)) ?? null,
        grade: (grading?.grade as number | undefined) ?? null,
        status: r.status as GiftStatus,
        price_points: (r.price_points as number) ?? 0,
        expires_at: r.expires_at as string,
        accepted_at: (r.accepted_at as string | null) ?? null,
        settled_at: (r.settled_at as string | null) ?? null,
        created_at: r.created_at as string,
        message: (r.message as string | null) ?? null,
        from_login: (r.from as { user_id?: string } | null)?.user_id,
        to_login: (r.to as { user_id?: string } | null)?.user_id,
        from_nickname: (r.from as { display_name?: string } | null)
          ?.display_name,
        to_nickname: (r.to as { display_name?: string } | null)?.display_name,
      };
    });
  return { received: shape(recv.data ?? []), sent: shape(sent.data ?? []) };
}
