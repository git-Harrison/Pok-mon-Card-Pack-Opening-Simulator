"use client";

import { createClient } from "@/utils/supabase/client";

const supabase = createClient();

export type CharacterKey =
  | "ash"
  | "misty"
  | "brock"
  | "oak"
  | "leaf"
  | "lance";

export type CharacterMotion = "apng" | "css-bob";

export interface CharacterDef {
  key: CharacterKey;
  name: string;
  romaji: string;
  region: string;
  gender: "남" | "여";
  emoji: string;
  gradient: string;
  ring: string;
  spriteUrl: string;
  motion: CharacterMotion;
}

export const CHARACTERS: readonly CharacterDef[] = [
  {
    key: "ash",
    name: "지우",
    romaji: "Ash",
    region: "관동",
    gender: "남",
    emoji: "🧢",
    gradient: "from-rose-500 via-red-500 to-amber-400",
    ring: "ring-rose-300/60",
    spriteUrl:
      "https://archives.bulbagarden.net/media/upload/e/e8/Spr_HGSS_Red.png",
    motion: "apng",
  },
  {
    key: "misty",
    name: "이슬",
    romaji: "Misty",
    region: "관동",
    gender: "여",
    emoji: "💧",
    gradient: "from-sky-400 via-cyan-400 to-blue-500",
    ring: "ring-cyan-300/60",
    spriteUrl:
      "https://archives.bulbagarden.net/media/upload/d/d1/Spr_HGSS_Misty.png",
    motion: "apng",
  },
  {
    key: "brock",
    name: "웅",
    romaji: "Brock",
    region: "관동",
    gender: "남",
    emoji: "🪨",
    gradient: "from-amber-700 via-orange-600 to-yellow-500",
    ring: "ring-amber-400/60",
    spriteUrl:
      "https://archives.bulbagarden.net/media/upload/3/30/Spr_HGSS_Brock.png",
    motion: "apng",
  },
  {
    key: "oak",
    name: "오박사",
    romaji: "Oak",
    region: "관동",
    gender: "남",
    emoji: "🥼",
    gradient: "from-zinc-300 via-slate-200 to-zinc-400",
    ring: "ring-zinc-200/60",
    spriteUrl: "https://play.pokemonshowdown.com/sprites/trainers/oak-gen3.png",
    motion: "css-bob",
  },
  {
    key: "leaf",
    name: "그린",
    romaji: "Leaf",
    region: "관동",
    gender: "여",
    emoji: "🍃",
    gradient: "from-emerald-500 via-teal-500 to-sky-500",
    ring: "ring-emerald-300/60",
    spriteUrl:
      "https://play.pokemonshowdown.com/sprites/trainers/leaf-gen3.png",
    motion: "apng",
  },
  {
    key: "lance",
    name: "목호",
    romaji: "Lance",
    region: "관동",
    gender: "남",
    emoji: "🐉",
    gradient: "from-rose-600 via-red-700 to-orange-600",
    ring: "ring-rose-400/60",
    spriteUrl:
      "https://archives.bulbagarden.net/media/upload/1/1f/Spr_HGSS_Lance.png",
    motion: "apng",
  },
] as const;

export const CHARACTER_BY_KEY: Record<CharacterKey, CharacterDef> =
  Object.fromEntries(CHARACTERS.map((c) => [c.key, c])) as Record<
    CharacterKey,
    CharacterDef
  >;

export function getCharacter(key: string | null | undefined): CharacterDef | null {
  if (!key) return null;
  return CHARACTER_BY_KEY[key as CharacterKey] ?? null;
}

export interface ProfileMainCard {
  id: string;
  card_id: string;
  grade: number;
  rarity: string;
  graded_at: string;
}

/** 속성별 펫 슬롯 (spec 2-1) — { "type": [{id, card_id, rarity, grade}, ...] }.
 *  type 당 최대 3개. 빈 type 키는 객체에 없거나 빈 배열. */
export type MainCardsByType = Record<string, ProfileMainCard[]>;

export interface ProfileSnapshot {
  ok: boolean;
  error?: string;
  character: CharacterKey | null;
  character_locked: boolean;
  /** @deprecated 전환기 호환용. 신구조는 main_cards_by_type. */
  main_card_ids: string[];
  pet_score: number;
  /** @deprecated 전환기 호환용. */
  main_cards: ProfileMainCard[];
  /** spec 2-1: 속성별 등록 펫. 비어 있으면 사용자가 아직 신구조로 등록 안 함. */
  main_cards_by_type: MainCardsByType;
  center_power: number;
  pokedex_count: number;
  pokedex_bonus: number;
}

/** @deprecated 전환기 호환용. spec 2-1: 속성별 3 슬롯. */
export const MAX_MAIN_CARDS = 10;
/** spec 2-1: 한 type 당 슬롯 cap. */
export const PETS_PER_TYPE = 3;
/** Σ rarity_power × 10 across MAX_MAIN_CARDS MUR (10) slabs. */
export const MAX_PET_SCORE = 1000;

export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 20;

export async function fetchProfile(userId: string): Promise<ProfileSnapshot> {
  const { data, error } = await supabase.rpc("get_profile", {
    p_user_id: userId,
  });
  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "프로필을 불러오지 못했어요.",
      character: null,
      character_locked: false,
      main_card_ids: [],
      pet_score: 0,
      main_cards: [],
      main_cards_by_type: {},
      center_power: 0,
      pokedex_count: 0,
      pokedex_bonus: 0,
    };
  }
  const d = data as {
    ok: boolean;
    error?: string;
    character?: string | null;
    character_locked?: boolean;
    main_card_ids?: string[] | null;
    pet_score?: number | null;
    main_cards?: ProfileMainCard[] | null;
    main_cards_by_type?: MainCardsByType | null;
    center_power?: number | null;
    pokedex_count?: number | null;
    pokedex_bonus?: number | null;
  };
  return {
    ok: d.ok,
    error: d.error,
    character: (d.character as CharacterKey | null) ?? null,
    character_locked: d.character_locked ?? d.character != null,
    main_card_ids: d.main_card_ids ?? [],
    pet_score: d.pet_score ?? 0,
    main_cards: d.main_cards ?? [],
    main_cards_by_type: d.main_cards_by_type ?? {},
    center_power: d.center_power ?? 0,
    pokedex_count: d.pokedex_count ?? 0,
    pokedex_bonus: d.pokedex_bonus ?? 0,
  };
}

/** 한 type 의 슬롯 3 통째 갱신 (spec 2-1). 길이 0~3. */
export async function setPetForType(
  userId: string,
  type: string,
  gradingIds: string[]
) {
  const { data, error } = await supabase.rpc("set_pet_for_type", {
    p_user_id: userId,
    p_type: type,
    p_grading_ids: gradingIds,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as {
    ok: boolean;
    error?: string;
    pet_score?: number;
    main_cards_by_type?: Record<string, string[]>;
  };
}

export async function setCharacter(userId: string, key: CharacterKey) {
  const { data, error } = await supabase.rpc("set_character", {
    p_user_id: userId,
    p_character: key,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as { ok: boolean; error?: string; character?: string };
}

// setMainCards (legacy flat 펫 등록) 폐기됨 — spec 2-1 의 setPetForType
// 으로 대체. 호출자 0 개 확인 후 wrapper 제거.

export async function updateDisplayName(userId: string, newName: string) {
  const { data, error } = await supabase.rpc("update_display_name", {
    p_user_id: userId,
    p_name: newName,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as {
    ok: boolean;
    error?: string;
    display_name?: string;
  };
}
