"use client";

import { createClient } from "@/utils/supabase/client";
import type { Gym } from "./types";

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
