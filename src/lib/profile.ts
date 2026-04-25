"use client";

import { createClient } from "@/utils/supabase/client";

const supabase = createClient();

export type CharacterKey =
  | "red"
  | "leaf"
  | "ethan"
  | "lyra"
  | "hilbert"
  | "hilda";

export interface CharacterDef {
  key: CharacterKey;
  name: string;
  region: string;
  gender: "남" | "여";
  emoji: string;
  gradient: string;
  ring: string;
  spriteUrl: string;
}

export const CHARACTERS: readonly CharacterDef[] = [
  {
    key: "red",
    name: "레드",
    region: "관동",
    gender: "남",
    emoji: "🧢",
    gradient: "from-rose-500 via-red-500 to-amber-400",
    ring: "ring-rose-300/60",
    spriteUrl:
      "https://archives.bulbagarden.net/media/upload/4/4f/Spr_FRLG_Red.png",
  },
  {
    key: "leaf",
    name: "리프",
    region: "관동",
    gender: "여",
    emoji: "🎀",
    gradient: "from-pink-400 via-fuchsia-400 to-rose-300",
    ring: "ring-fuchsia-300/60",
    spriteUrl:
      "https://archives.bulbagarden.net/media/upload/0/05/Spr_FRLG_Leaf.png",
  },
  {
    key: "ethan",
    name: "골드",
    region: "성도",
    gender: "남",
    emoji: "🧗",
    gradient: "from-amber-400 via-yellow-400 to-orange-500",
    ring: "ring-amber-300/60",
    spriteUrl:
      "https://archives.bulbagarden.net/media/upload/d/d9/Spr_HGSS_Ethan.png",
  },
  {
    key: "lyra",
    name: "코토네",
    region: "성도",
    gender: "여",
    emoji: "🧣",
    gradient: "from-rose-400 via-amber-300 to-yellow-300",
    ring: "ring-rose-200/60",
    spriteUrl:
      "https://archives.bulbagarden.net/media/upload/6/68/Spr_HGSS_Lyra.png",
  },
  {
    key: "hilbert",
    name: "쿠로",
    region: "하나",
    gender: "남",
    emoji: "🧥",
    gradient: "from-sky-500 via-indigo-500 to-blue-600",
    ring: "ring-sky-300/60",
    spriteUrl:
      "https://archives.bulbagarden.net/media/upload/8/8e/Spr_BW_Hilbert.png",
  },
  {
    key: "hilda",
    name: "토우코",
    region: "하나",
    gender: "여",
    emoji: "👜",
    gradient: "from-fuchsia-500 via-violet-500 to-indigo-500",
    ring: "ring-fuchsia-300/60",
    spriteUrl:
      "https://archives.bulbagarden.net/media/upload/4/4d/Spr_BW_Hilda.png",
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

export interface ProfileSnapshot {
  ok: boolean;
  error?: string;
  character: CharacterKey | null;
  main_card_ids: string[];
  pet_score: number;
  main_cards: ProfileMainCard[];
}

export const MAX_MAIN_CARDS = 5;
export const MAX_PET_SCORE = 500;

export async function fetchProfile(userId: string): Promise<ProfileSnapshot> {
  const { data, error } = await supabase.rpc("get_profile", {
    p_user_id: userId,
  });
  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "프로필을 불러오지 못했어요.",
      character: null,
      main_card_ids: [],
      pet_score: 0,
      main_cards: [],
    };
  }
  const d = data as {
    ok: boolean;
    error?: string;
    character?: string | null;
    main_card_ids?: string[] | null;
    pet_score?: number | null;
    main_cards?: ProfileMainCard[] | null;
  };
  return {
    ok: d.ok,
    error: d.error,
    character: (d.character as CharacterKey | null) ?? null,
    main_card_ids: d.main_card_ids ?? [],
    pet_score: d.pet_score ?? 0,
    main_cards: d.main_cards ?? [],
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

export async function setMainCards(userId: string, gradingIds: string[]) {
  const { data, error } = await supabase.rpc("set_main_cards", {
    p_user_id: userId,
    p_grading_ids: gradingIds,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as {
    ok: boolean;
    error?: string;
    pet_score?: number;
    count?: number;
  };
}
