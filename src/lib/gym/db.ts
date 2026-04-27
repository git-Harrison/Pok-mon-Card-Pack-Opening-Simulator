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

export interface RawPetGrading {
  grading_id: string;
  card_id: string;
  rarity: string;
  grade: number;
}

/** users.main_card_ids 의 PCL10 슬랩 raw 데이터. 카드 이름 / 타입은
 *  클라가 카탈로그(getCard, CARD_NAME_TO_TYPE) 로 머지. */
export async function fetchMyPets(userId: string): Promise<RawPetGrading[]> {
  const { data: u } = await supabase
    .from("users")
    .select("main_card_ids")
    .eq("id", userId)
    .single();
  const ids = ((u as { main_card_ids?: string[] } | null)?.main_card_ids) ?? [];
  if (!ids.length) return [];
  const { data: gradings, error } = await supabase
    .from("psa_gradings")
    .select("id, card_id, rarity, grade")
    .in("id", ids);
  if (error || !gradings) return [];
  return (gradings as Array<{ id: string; card_id: string; rarity: string; grade: number }>)
    .filter((g) => g.grade === 10)
    .map((g) => ({
      grading_id: g.id,
      card_id: g.card_id,
      rarity: g.rarity,
      grade: g.grade,
    }));
}
