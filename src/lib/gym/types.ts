import type { WildType } from "@/lib/wild/types";

export type GymDifficulty = "EASY" | "NORMAL" | "HARD" | "BOSS";

export interface GymPokemon {
  id: string;
  slot: number;
  name: string;
  type: WildType;
  dex: number;
  hp: number;
  atk: number;
  def: number;
  spd: number;
}

export interface GymMedal {
  id: string;
  name: string;
  type: WildType;
  description: string;
}

export interface GymOwnership {
  user_id: string;
  display_name: string;
  captured_at: string;
  protection_until: string;
}

export interface GymActiveChallenge {
  id: string;
  user_id: string;
  display_name: string;
  started_at: string;
}

export interface Gym {
  id: string;
  name: string;
  type: WildType;
  difficulty: GymDifficulty;
  leader_name: string;
  leader_sprite: string | null;
  location_x: number;
  location_y: number;
  min_power: number;
  display_order: number;
  pokemon: GymPokemon[];
  medal: GymMedal | null;
  /** null 이면 비점령 (NPC 관장). */
  ownership: GymOwnership | null;
  /** null 이면 도전 중인 유저 없음. */
  active_challenge: GymActiveChallenge | null;
  /** 본인의 재도전 쿨타임 — null 이면 쿨타임 없음. */
  user_cooldown_until: string | null;
}

/** 클라이언트에서 즉시 분기 가능한 상태 라벨. */
export type GymStatus =
  | "open"               // 비점령 + 도전 가능
  | "owned_open"         // 점령됐지만 보호 끝남 → 다른 유저 도전 가능
  | "protected"          // 보호 쿨타임 중
  | "challenge_active"   // 다른 유저 도전 중
  | "user_cooldown"      // 본인 재도전 쿨타임 중
  | "owned_by_me";       // 내가 소유 중

/** 서버 응답 (JSON 문자열 timestamp) 을 파싱해 클라이언트 분기에 쓰는
 *  현재 상태를 산출. 보호/쿨타임은 now 기준. */
export function deriveGymStatus(
  gym: Gym,
  myUserId: string | null,
  now: number = Date.now()
): GymStatus {
  if (gym.active_challenge) return "challenge_active";
  if (gym.user_cooldown_until) {
    const left = new Date(gym.user_cooldown_until).getTime() - now;
    if (left > 0) return "user_cooldown";
  }
  if (gym.ownership) {
    if (gym.ownership.user_id === myUserId) return "owned_by_me";
    const protectedLeft =
      new Date(gym.ownership.protection_until).getTime() - now;
    if (protectedLeft > 0) return "protected";
    return "owned_open";
  }
  return "open";
}

export const DIFFICULTY_STYLE: Record<
  GymDifficulty,
  { badge: string; label: string; tone: string }
> = {
  EASY:   { badge: "bg-emerald-500 text-white",   label: "쉬움",   tone: "text-emerald-200" },
  NORMAL: { badge: "bg-sky-500 text-white",       label: "보통",   tone: "text-sky-200" },
  HARD:   { badge: "bg-orange-500 text-white",    label: "어려움", tone: "text-orange-200" },
  BOSS:   { badge: "bg-fuchsia-600 text-white",   label: "보스",   tone: "text-fuchsia-200" },
};
