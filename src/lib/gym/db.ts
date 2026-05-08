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
  /** 서버 card_types.wild_type — 펫/체육관 검증의 진실의 소스. 클라
   *  name-to-type 룩업이 누락된 카드도 여기서 채워줌. null 가능
   *  (트레이너/에너지/굿즈). */
  wild_type: string | null;
  /** 서버 card_types.wild_type_2 — MUR/UR dual-type. SAR 이하 null. */
  wild_type_2: string | null;
}

/** 체육관 풀용 — 정책 (20260740):
 *   본인 소유 PCL10 + 속성 일치 슬랩 모두 가능 (rarity / 등록 무관).
 *   서버 (resolve_gym_battle / set_gym_defense_deck) 도 동일 검증.
 *   속성 필터는 UI 가 wild_type / wild_type_2 (서버 card_types) 로 함.
 *
 *  쿼리는 rarity 별로 분리해 PostgREST 기본 max_rows (1000) cap 회피.
 *  모든 PCL10 슬랩을 한 번에 가져오던 옛 구현이, PCL10 1000장 넘는
 *  계정에서 응답 cut-off 로 일부 슬랩이 사라지던 사고가 있었음.
 *  희귀도별로 쿼리하면 결과셋이 충분히 작음. */
export async function fetchMyPets(userId: string): Promise<RawPetGrading[]> {
  type Row = { id: string; card_id: string; rarity: string; grade: number };
  // 희귀도 그룹별 쿼리 — MUR/UR 은 묶음, 그 외는 SAR/SR/MA/AR/RR/R/U/C
  // 묶음 (각 그룹이 ~수백 슬랩 수준이라 안전).
  const [highRes, lowRes] = await Promise.all([
    supabase
      .from("psa_gradings")
      .select("id, card_id, rarity, grade")
      .eq("user_id", userId)
      .eq("grade", 10)
      .in("rarity", ["MUR", "UR"]),
    supabase
      .from("psa_gradings")
      .select("id, card_id, rarity, grade")
      .eq("user_id", userId)
      .eq("grade", 10)
      .in("rarity", ["SAR", "SR", "MA", "AR", "RR", "R", "U", "C"]),
  ]);

  const merged = new Map<string, Row>();
  for (const r of (highRes.data ?? []) as Row[]) merged.set(r.id, r);
  for (const r of (lowRes.data ?? []) as Row[]) merged.set(r.id, r);

  // 서버 card_types 에서 (wild_type, wild_type_2) 일괄 fetch — 풀 필터/
  // 표시 모두 서버 진실 기준으로 동작시키기 위함.
  const cardIds = Array.from(
    new Set(Array.from(merged.values()).map((r) => r.card_id))
  );
  const typeMap = new Map<
    string,
    { wild_type: string | null; wild_type_2: string | null }
  >();
  if (cardIds.length > 0) {
    const typeRes = await supabase
      .from("card_types")
      .select("card_id, wild_type, wild_type_2")
      .in("card_id", cardIds);
    for (const row of (typeRes.data ?? []) as Array<{
      card_id: string;
      wild_type: string | null;
      wild_type_2: string | null;
    }>) {
      typeMap.set(row.card_id, {
        wild_type: row.wild_type,
        wild_type_2: row.wild_type_2,
      });
    }
  }

  return Array.from(merged.values()).map((g) => {
    const t = typeMap.get(g.card_id);
    return {
      grading_id: g.id,
      card_id: g.card_id,
      rarity: g.rarity,
      grade: g.grade,
      wild_type: t?.wild_type ?? null,
      wild_type_2: t?.wild_type_2 ?? null,
    };
  });
}
