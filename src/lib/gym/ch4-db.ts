"use client";

import { createClient } from "@/utils/supabase/client";
import { wildSpriteUrl } from "@/lib/wild/pool";

const supabase = createClient();

// ════════════════════════════════════════════
// ░░ 타입 ░░
// ════════════════════════════════════════════

export type Ch4Role = "tank" | "dealer" | "supporter";
export type Ch4Status = "waiting" | "resolving" | "resolved" | "cancelled";
export type Ch4Result = "win" | "loss";

export interface Ch4UserStats {
  ok: boolean;
  eligible: boolean;
  medal_count: number;
  medal_required: number;
  has_starter: boolean;
  starter: {
    species: string;
    nickname: string;
    level: number;
    evolution_stage: number;
  } | null;
  center_power: number;
  hp_scale: number;
  atk_scale: number;
  skill_mul: number;
}

export interface Ch4Boss {
  id: string;
  stage_order: number;
  name: string;
  description: string | null;
  sprite_key: string;
  types: string[];
  weak_to: string[];
  base_hp: number;
  base_atk: number;
  base_def: number;
  phase_switch_hp_ratio: number | null;
  unlock_requires_clear: string | null;
}

export interface Ch4Skill {
  id: string;
  scope: "role" | "species";
  role: Ch4Role | null;
  species: string | null;
  name: string;
  kind: "attack" | "heal" | "buff" | "debuff" | "taunt" | "counter";
  target: string;
  power: number;
  cooldown_turns: number;
  ai_priority: number;
  duration_turns: number;
  fx_template: string;
  fx_color: string | null;
  fx_color_secondary: string | null;
  fx_intensity: number;
  fx_duration_ms: number;
  fx_shake: string;
  fx_zoom: number;
  fx_text_style: string;
}

export interface Ch4Participant {
  slot: number;
  user_id: string;
  user_name: string;
  display_name: string;
  is_bot: boolean;
  role: Ch4Role;
  skill_loadout: string[];
  starter: {
    species: string;
    nickname: string;
    level: number;
    evolution_stage: number;
  };
  center_power: number;
  hp_scale: number;
  atk_scale: number;
  skill_mul: number;
  joined_at: string;
}

export interface Ch4RaidState {
  id: string;
  boss_id: string;
  host_user_id: string;
  room_code: string;
  status: Ch4Status;
  result: Ch4Result | null;
  total_turns: number | null;
  created_at: string;
  resolved_at: string | null;
  replay_data: Ch4Frame[] | null;
}

export interface Ch4FullRaid {
  raid: Ch4RaidState;
  boss: Ch4Boss;
  participants: Ch4Participant[];
}

// ── replay_data 프레임 (resolve_ch4_battle 가 생성) ──
export interface Ch4FxMeta {
  template: string;
  color: string | null;
  color_2: string | null;
  intensity: number;
  duration_ms: number;
  shake: string;
  zoom?: number;
  vignette?: string | null;
  text_style: string;
}

export type Ch4Frame =
  | { t: number; type: "battle_start"; boss: unknown; participants: unknown[] }
  | { t: number; type: "turn_start"; round: number; phase: number }
  | { t: number; type: "turn_end"; round: number; boss_hp: number; participants_hp: number[] }
  | {
      t: number;
      type: "skill";
      actor: "boss" | "slot1" | "slot2" | "slot3";
      target: string;
      skill_id: string;
      skill_name: string;
      kind: string;
      damage?: number;
      heal?: number;
      crit?: boolean;
      weakness?: boolean;
      resist?: boolean;
      effect?: Record<string, unknown>;
      fx?: Ch4FxMeta;
      boss_hp?: number;
      target_hp?: number;
    }
  | {
      t: number;
      type: "boss_skill" | "boss_skill_aoe_warn";
      actor: "boss";
      target?: string;
      skill_id: string;
      skill_name: string;
      kind: string;
      damage?: number;
      heal?: number;
      weakness?: boolean;
      resist?: boolean;
      effect?: Record<string, unknown>;
      fx?: Ch4FxMeta;
      boss_hp?: number;
      target_hp?: number;
    }
  | {
      t: number;
      type: "counter_reflect";
      actor: string;
      target: "boss";
      damage: number;
      boss_hp: number;
    }
  | {
      t: number;
      type: "phase_transition";
      round: number;
      phase: number;
      boss_hp: number;
    }
  | {
      t: number;
      type: "skip";
      actor: string;
      round: number;
    }
  | {
      t: number;
      type: "battle_end";
      result: Ch4Result;
      final_round: number;
      boss_hp: number;
      participants_hp: number[];
    };

// ════════════════════════════════════════════
// ░░ RPC ░░
// ════════════════════════════════════════════

export async function ch4UserStats(userId: string): Promise<Ch4UserStats | null> {
  const { data, error } = await supabase.rpc("ch4_user_stats", {
    p_user_id: userId,
  });
  if (error) return null;
  return data as Ch4UserStats;
}

export async function listCh4Bosses(): Promise<Ch4Boss[]> {
  const { data, error } = await supabase
    .from("ch4_bosses")
    .select("*")
    .order("stage_order");
  if (error) return [];
  return (data ?? []) as Ch4Boss[];
}

export async function listMyCh4Clears(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("user_ch4_clears")
    .select("boss_id")
    .eq("user_id", userId);
  if (error) return [];
  return ((data ?? []) as { boss_id: string }[]).map((r) => r.boss_id);
}

export async function listCh4Skills(): Promise<Ch4Skill[]> {
  const { data, error } = await supabase.from("ch4_skills").select("*");
  if (error) return [];
  return (data ?? []) as Ch4Skill[];
}

export async function createCh4Raid(userId: string, bossId: string) {
  const { data, error } = await supabase.rpc("create_ch4_raid", {
    p_user_id: userId,
    p_boss_id: bossId,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as {
    ok: boolean;
    error?: string;
    raid_id?: string;
    room_code?: string;
    role?: Ch4Role;
  };
}

export async function joinCh4Raid(userId: string, raidId: string) {
  const { data, error } = await supabase.rpc("join_ch4_raid", {
    p_user_id: userId,
    p_raid_id: raidId,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as {
    ok: boolean;
    error?: string;
    raid_id?: string;
    slot?: number;
    role?: Ch4Role;
    already?: boolean;
  };
}

export interface Ch4WaitingRaid {
  raid_id: string;
  room_code: string;
  boss_id: string;
  boss_stage: number;
  boss_name: string;
  boss_sprite_key: string;
  boss_types: string[];
  host_user_id: string;
  host_user_name: string;
  host_display_name: string;
  created_at: string;
  slot_count: number;
}

export async function listCh4WaitingRaids(): Promise<Ch4WaitingRaid[]> {
  const { data, error } = await supabase.rpc("list_ch4_waiting_raids");
  if (error) return [];
  return (data ?? []) as Ch4WaitingRaid[];
}

export async function leaveCh4Raid(userId: string, raidId: string) {
  const { data, error } = await supabase.rpc("leave_ch4_raid", {
    p_user_id: userId,
    p_raid_id: raidId,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as { ok: boolean; error?: string; cancelled?: boolean };
}

export async function getCh4Raid(raidId: string): Promise<Ch4FullRaid | null> {
  const { data, error } = await supabase.rpc("get_ch4_raid", {
    p_raid_id: raidId,
  });
  if (error) return null;
  const obj = data as {
    ok: boolean;
    raid: Ch4RaidState;
    boss: Ch4Boss;
    participants: Ch4Participant[];
  };
  if (!obj.ok) return null;
  return { raid: obj.raid, boss: obj.boss, participants: obj.participants };
}

export async function lookupCh4RaidByCode(code: string) {
  const { data, error } = await supabase.rpc("lookup_ch4_raid_by_code", {
    p_room_code: code,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as { ok: boolean; error?: string; raid_id?: string; status?: Ch4Status; boss_id?: string };
}

export async function getMyCh4WaitingRaid(userId: string) {
  const { data, error } = await supabase.rpc("get_my_ch4_waiting_raid", {
    p_user_id: userId,
  });
  if (error) return null;
  return data as {
    ok: boolean;
    has_raid: boolean;
    raid_id?: string;
    room_code?: string;
    is_host?: boolean;
  };
}

export async function addBotToCh4Raid(hostUserId: string, raidId: string) {
  const { data, error } = await supabase.rpc("add_bot_to_ch4_raid", {
    p_host_user_id: hostUserId,
    p_raid_id: raidId,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as {
    ok: boolean;
    error?: string;
    slot?: number;
    role?: Ch4Role;
    bot_user_id?: string;
    bot_name?: string;
  };
}

export async function startCh4Raid(userId: string, raidId: string) {
  const { data, error } = await supabase.rpc("start_ch4_raid", {
    p_user_id: userId,
    p_raid_id: raidId,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as {
    ok: boolean;
    error?: string;
    result?: Ch4Result;
    total_turns?: number;
    frame_count?: number;
  };
}

// ── 종 → 한국어 이름 (UI 표시용) ──
export const SPECIES_NAME_KO: Record<string, string> = {
  pikachu: "피카츄",
  charmander: "파이리",
  squirtle: "꼬부기",
  bulbasaur: "이상해씨",
  gastly: "고오스",
  dratini: "미뇽",
  pidgey: "구구",
  piplup: "팽도리",
  mew: "뮤",
  mewtwo: "뮤츠",
};

// ── 진화 stage 별 dex 매핑 (PokeAPI gen5 sprite) ──
//    SPECIES_EVOLUTION_DEX[species][stage] = dex 번호.
//    src/lib/wild/dexsprite 와 동일 URL 패턴.
export const SPECIES_EVOLUTION_DEX: Record<string, number[]> = {
  pikachu:    [25, 26, 26],          // 피카츄 → 라이츄 (Lv 1차에서 끝)
  charmander: [4,  5,  6],            // 파이리 → 리자드 → 리자몽
  squirtle:   [7,  8,  9],            // 꼬부기 → 어니부기 → 거북왕
  bulbasaur:  [1,  2,  3],            // 이상해씨 → 이상해풀 → 이상해꽃
  gastly:     [92, 93, 94],           // 고오스 → 고우스트 → 팬텀
  dratini:    [147, 148, 149],        // 미뇽 → 신뇽 → 망나뇽
  pidgey:     [16, 17, 18],           // 구구 → 피죤 → 피죤투
  piplup:     [393, 394, 395],        // 팽도리 → 팽태자 → 엠페르트
  mew:        [151, 151, 151],
  mewtwo:     [150, 150, 150],
};

export function speciesSpriteUrl(species: string, stage: number): string {
  const dexList = SPECIES_EVOLUTION_DEX[species] ?? [1];
  const dex = dexList[Math.min(stage, dexList.length - 1)];
  return wildSpriteUrl(dex, true);
}

/** 보스 sprite_key → dex → PokeAPI gen5 BW 애니 sprite URL.
 *  현재 4 보스는 모두 프로젝트 미사용 실존 전설 포켓몬:
 *    Stage 1 마기라스 (Tyranitar 248)
 *    Stage 2 칠색조   (Ho-Oh 250)
 *    Stage 3 레쿠쟈   (Rayquaza 384)
 *    Stage 4 기라티나 (Giratina 487) — Origin Forme 없이 Altered Forme 사용 */
export function bossSpriteUrl(spriteKey: string): string {
  const dex = (
    {
      tyranitar: 248,
      "ho-oh":   250,
      rayquaza:  384,
      giratina:  487,
      // legacy placeholder keys (20260747 시드) — DB 갱신 전 fallback
      "shadow-trainer":     248,
      "forgotten-champion": 250,
      "unknown-one":        384,
      "shadow-mewtwo":      487,
    } as Record<string, number>
  )[spriteKey] ?? 487;
  return wildSpriteUrl(dex, true);
}

export function roleLabel(role: Ch4Role): string {
  return role === "tank" ? "탱커" : role === "dealer" ? "딜러" : "서포터";
}

export function roleColor(role: Ch4Role): string {
  return role === "tank" ? "text-blue-400" : role === "dealer" ? "text-rose-400" : "text-emerald-400";
}
