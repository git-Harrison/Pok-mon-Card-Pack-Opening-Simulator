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

export interface DefenderPokemonInfo {
  slot: number;
  /** PCL 슬랩 uuid — 본인 소유자가 방어덱 편집 시 풀에 머지하기 위해.
   *  stale 슬롯도 보존되어 클라가 graceful 표시 가능. */
  grading_id?: string;
  /** stale 슬롯 (psa_gradings row 가 사라진 경우) 은 null. 클라는
   *  "데이터 손상" placeholder 로 표시하고, server resolve_gym_battle
   *  은 명시적 에러로 도전 차단 (점령 + 방어덱 셋업이라는 사실 자체는
   *  유지하되 default NPC 로 떨어지지 않게). */
  card_id: string | null;
  type: WildType;
  /** MUR 보조 속성 (없으면 null). UI 두 배지 렌더링용 (20260703). */
  wild_type_2: WildType | null;
  rarity: string | null;
  grade: number | null;
  /** 표시용 HP/ATK — 서버 gym_defender_display_stats() 가 계산. 방어자
   *  멀티플라이어 + MUR 보너스 + 속성 일치까지 모두 반영된 실제 전투
   *  stat 과 동일. stale 슬롯 (g2 미존재) 은 null. 클라가 직접 산식을
   *  복제하지 않도록 서버 단일 소스로 통일 (20260700). */
  display_hp: number | null;
  display_atk: number | null;
}

export interface GymOwnership {
  user_id: string;
  display_name: string;
  /** 점령자 캐릭터 키 (red/leaf/ethan/lyra/hilbert/hilda 또는 null). */
  character: string | null;
  captured_at: string;
  protection_until: string;
  /** 점령자가 자기 펫 3마리로 방어 덱을 셋업했는지. */
  has_defense_deck: boolean;
  /** 방어 덱 셋업되어 있을 때 사용자 펫 3마리 정보. NPC 모드면 null. */
  defender_pokemon: DefenderPokemonInfo[] | null;
  /** 본인 소유 체육관일 때 — 24h 안에 (누군가) 일일 보상 받았는지.
   *  null = 본인 소유 아님. 점령자 변경되어도 cooldown 유지. */
  daily_claimed_today: boolean | null;
  /** 다음 일일 보상 청구 가능 시점 (ISO timestamp). null = 즉시 가능
   *  또는 본인 소유 아님. */
  daily_next_claim_at: string | null;
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
  /** 챕터 — 1 (기존 8 type) / 2 (신규 10 type) / 3 (예정). */
  chapter: number;
  /** 난이도별 일일 보상 (서버 산정). 표시용 미리보기. */
  daily_money?: number;
  daily_rank_pts?: number;
  pokemon: GymPokemon[];
  medal: GymMedal | null;
  /** null 이면 비점령 (NPC 관장). */
  ownership: GymOwnership | null;
  /** null 이면 도전 중인 유저 없음. */
  active_challenge: GymActiveChallenge | null;
  /** 본인의 재도전 쿨타임 — null 이면 쿨타임 없음. */
  user_cooldown_until: string | null;
  /** 본인이 이미 이 체육관 메달 보유 중인지 (Phase 3 +). */
  has_my_medal?: boolean;
}

/** 클라이언트에서 즉시 분기 가능한 상태 라벨. */
export type GymStatus =
  | "open"               // 비점령 + 도전 가능
  | "owned_open"         // 점령됐지만 보호 끝남 → 다른 유저 도전 가능
  | "protected"          // 보호 쿨타임 중
  | "challenge_active"   // 다른 유저 도전 중
  | "user_cooldown"      // 본인 재도전 쿨타임 중
  | "owned_by_me"        // 내가 소유 중
  | "underpowered";      // 도전 가능하지만 내 전투력 < 최소 전투력

/** 서버 응답 (JSON 문자열 timestamp) 을 파싱해 클라이언트 분기에 쓰는
 *  현재 상태를 산출. 보호/쿨타임은 now 기준. centerPower 가 주어지면
 *  open/owned_open 인 체육관에 대해 underpowered 판정.
 *
 *  점령 판정 규칙: ownership.has_defense_deck === true 일 때만 점령 효력.
 *  방어 덱이 셋업되지 않은 ownership 은 비점령 (open) 으로 간주 →
 *  타 유저는 NPC 와 정상 도전 가능 (사용자 정책).
 *  단 본인은 항상 owned_by_me (자신의 체육관 인지). */
export function deriveGymStatus(
  gym: Gym,
  myUserId: string | null,
  now: number = Date.now(),
  centerPower: number | null = null
): GymStatus {
  if (gym.active_challenge) return "challenge_active";
  if (gym.user_cooldown_until) {
    const left = new Date(gym.user_cooldown_until).getTime() - now;
    if (left > 0) return "user_cooldown";
  }
  if (gym.ownership) {
    // 본인 소유 — 방어덱 셋업 여부 무관 항상 owned_by_me.
    if (gym.ownership.user_id === myUserId) return "owned_by_me";
    // 타인이 점령했지만 방어 덱 미설정 → "점령 안 된 것으로" 처리.
    // open 으로 fall-through 후 underpowered 검사.
    if (gym.ownership.has_defense_deck) {
      const protectedLeft =
        new Date(gym.ownership.protection_until).getTime() - now;
      if (protectedLeft > 0) return "protected";
      // open 상태로 간주하되, 색깔 라벨은 owned_open 유지.
      if (centerPower !== null && centerPower < gym.min_power) {
        return "underpowered";
      }
      return "owned_open";
    }
    // 방어덱 미설정 — open 처리, underpowered 검사 진행.
  }
  if (centerPower !== null && centerPower < gym.min_power) {
    return "underpowered";
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

/* ── Phase 2-4 — battle / medal types ── */

export interface BattleUnit {
  slot: number;
  name: string;
  type: WildType;
  rarity?: string;
  grade?: number;
  card_id?: string;
  grading_id?: string;
  /** NPC 적 모드 — PokeAPI sprite. */
  dex?: number;
  /** 방어 덱 모드인 경우 true (적도 카드 이미지 사용). */
  is_defender?: boolean;
  hp_max: number;
  hp: number;
  atk: number;
}

export interface BattleTurn {
  turn: number;
  side: "pet" | "enemy";
  attacker_slot: number;
  defender_slot: number;
  damage: number;
  eff: number;
  crit: boolean;
  enemy_hp_left: number;
  pet_hp_left: number;
}

export interface GymBattleResult {
  ok: boolean;
  error?: string;
  result?: "won" | "lost";
  pets?: BattleUnit[];
  enemies?: BattleUnit[];
  turn_log?: BattleTurn[];
  capture_reward?: number;
  medal_id?: string | null;
  protection_until?: string | null;
  cooldown_until?: string | null;
  points?: number;
  center_power?: number;
  /** Some error responses (under-power, etc) include extras. */
  min_power?: number;
}

export interface UserGymMedal {
  gym_id: string;
  gym_name: string;
  gym_type: WildType;
  gym_difficulty: GymDifficulty;
  medal_id: string;
  medal_name: string;
  medal_description: string;
  earned_at: string;
  used_pets: { pets: BattleUnit[] } | null;
  currently_owned: boolean;
}
