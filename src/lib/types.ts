export type Rarity =
  | "C"
  | "U"
  | "R"
  | "RR"
  | "AR"
  | "SR"
  | "SAR"
  | "MA"
  | "MUR"
  | "UR";

export type SetCode =
  | "m2a"
  | "m2"
  | "sv8"
  | "sv2a"
  | "sv8a"
  | "sv5a"
  | "sv10"
  | "m1l"
  | "m1s"
  | "m3"
  | "m4";

export interface Card {
  id: string; // `${setCode}-${number}`
  setCode: SetCode;
  number: string;
  name: string;
  rarity: Rarity;
  imageUrl?: string;
}

export interface SlotConfig {
  label: string;
  weights: Partial<Record<Rarity, number>>;
}

export interface SetInfo {
  code: SetCode;
  name: string; // Korean set name
  subtitle: string;
  releaseDate: string;
  cardsPerPack: number;
  packsPerBox: number;
  totalCards: number;
  primaryColor: string;
  accentColor: string;
  boxImage: string;
  packImage: string;
  slots: SlotConfig[]; // length === cardsPerPack
  cards: Card[];
}

export type GiftStatus = "pending" | "accepted" | "expired" | "declined";

export interface GiftQuota {
  used: number;
  limit: number;
  remaining: number;
}

export interface PclGrading {
  id: string;
  user_id: string;
  card_id: string;
  grade: number;
  graded_at: string;
}
