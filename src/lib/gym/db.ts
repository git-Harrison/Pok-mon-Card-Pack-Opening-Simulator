"use client";

import { createClient } from "@/utils/supabase/client";
import type { Gym, GymBattleResult, UserGymMedal } from "./types";

const supabase = createClient();

export async function fetchGymsState(userId: string | null): Promise<Gym[]> {
  const { data, error } = await supabase.rpc("get_gyms_state", {
    p_user_id: userId,
  });
  if (error) {
    console.warn("get_gyms_state error", error.message);
    return [];
  }
  return (data ?? []) as Gym[];
}

/** 사용자가 점령 중인 체육관들의 방어덱 grading_id 모음.
 *  카드 지갑 PclMode 가 "체육관 방어덱 사용중" 뱃지를 띄우고 해당
 *  슬랩의 클릭을 차단하려면 이 데이터가 필요. 서버는 단일 진입점
 *  get_my_defense_pet_ids 로 통일 (20260658). */
export async function fetchMyDefensePetIds(
  userId: string
): Promise<Set<string>> {
  const { data, error } = await supabase.rpc("get_my_defense_pet_ids", {
    p_user_id: userId,
  });
  if (error) return new Set();
  return new Set((data ?? []) as string[]);
}

export async function startGymChallenge(userId: string, gymId: string) {
  const { data, error } = await supabase.rpc("start_gym_challenge", {
    p_user_id: userId,
    p_gym_id: gymId,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as {
    ok: boolean;
    error?: string;
    challenge_id?: string;
    gym_id?: string;
    existing_challenge_id?: string;
    existing_gym_id?: string;
    challenger_user_id?: string;
    protection_until?: string;
    cooldown_until?: string;
  };
}

export async function abandonGymChallenge(userId: string, challengeId: string) {
  const { data, error } = await supabase.rpc("abandon_gym_challenge", {
    p_user_id: userId,
    p_challenge_id: challengeId,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as {
    ok: boolean;
    error?: string;
    challenge_id?: string;
  };
}

export async function resolveGymBattle(
  userId: string,
  gymId: string,
  challengeId: string,
  petGradingIds: string[],
  petTypes: string[]
) {
  const { data, error } = await supabase.rpc("resolve_gym_battle", {
    p_user_id: userId,
    p_gym_id: gymId,
    p_challenge_id: challengeId,
    p_pet_grading_ids: petGradingIds,
    p_pet_types: petTypes,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as GymBattleResult;
}

export async function extendGymProtection(userId: string, gymId: string) {
  const { data, error } = await supabase.rpc("extend_gym_protection", {
    p_user_id: userId,
    p_gym_id: gymId,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as {
    ok: boolean;
    error?: string;
    protection_until?: string;
    points?: number;
    cost?: number;
  };
}

export async function claimGymDaily(userId: string, gymId: string) {
  const { data, error } = await supabase.rpc("claim_gym_daily", {
    p_user_id: userId,
    p_gym_id: gymId,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as {
    ok: boolean;
    error?: string;
    gym_id?: string;
    money?: number;
    rank_points?: number;
    points?: number;
  };
}

export async function setGymDefenseDeck(
  userId: string,
  gymId: string,
  petGradingIds: string[],
  petTypes: string[]
) {
  const { data, error } = await supabase.rpc("set_gym_defense_deck", {
    p_user_id: userId,
    p_gym_id: gymId,
    p_pet_grading_ids: petGradingIds,
    p_pet_types: petTypes,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as {
    ok: boolean;
    error?: string;
    gym_id?: string;
  };
}

export async function fetchUserGymMedals(userId: string): Promise<UserGymMedal[]> {
  const { data, error } = await supabase.rpc("get_user_gym_medals", {
    p_user_id: userId,
  });
  if (error) {
    console.warn("get_user_gym_medals error", error.message);
    return [];
  }
  return (data ?? []) as UserGymMedal[];
}

export async function computeUserCenterPower(userId: string): Promise<number> {
  const { data, error } = await supabase.rpc("gym_compute_user_center_power", {
    p_user_id: userId,
  });
  if (error) return 0;
  return (data as number) ?? 0;
}

/** 체육관 전투 기록 — 단일 gym 의 최근 결과 (도전자 won/lost).
 *  서버: 20260683_get_gym_battle_history.sql.
 *  defender_display_name null = 기본 NPC 방어. */
export interface GymBattleLogEntry {
  id: string;
  result: "won" | "lost";
  challenger_user_id: string;
  challenger_display_name: string | null;
  defender_user_id: string | null;
  defender_display_name: string | null;
  ended_at: string;
}

export async function fetchGymBattleHistory(
  gymId: string,
  limit = 20
): Promise<GymBattleLogEntry[]> {
  const { data, error } = await supabase.rpc("get_gym_battle_history", {
    p_gym_id: gymId,
    p_limit: limit,
  });
  if (error) {
    console.warn("get_gym_battle_history error", error.message);
    return [];
  }
  return (data ?? []) as GymBattleLogEntry[];
}

export interface RawPetGrading {
  grading_id: string;
  card_id: string;
  rarity: string;
  grade: number;
}

/** 체육관 풀용 — 사용자가 보유한 모든 PCL10 슬랩 raw 데이터.
 *  과거에는 main_card_ids ∪ main_cards_by_type 로 펫 등록된 슬랩만
 *  반환했지만, 정책 변경 (20260731): 등록 여부와 무관하게 보유 PCL10
 *  슬랩 전부를 도전/방어덱 풀에 노출. 카드 이름/타입은 클라가 카탈로그
 *  (getCard, resolveCardType) 로 머지. */
export async function fetchMyPets(userId: string): Promise<RawPetGrading[]> {
  const { data: gradings, error } = await supabase
    .from("psa_gradings")
    .select("id, card_id, rarity, grade")
    .eq("user_id", userId)
    .eq("grade", 10);
  if (error || !gradings) return [];
  return (gradings as Array<{ id: string; card_id: string; rarity: string; grade: number }>).map(
    (g) => ({
      grading_id: g.id,
      card_id: g.card_id,
      rarity: g.rarity,
      grade: g.grade,
    })
  );
}
