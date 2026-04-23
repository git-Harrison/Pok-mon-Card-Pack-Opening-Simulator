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

export type SetCode = "m2a" | "m2" | "sv8";

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

export interface MerchantState {
  card_id: string | null;
  price: number;
  refreshes_remaining: number;
  next_refresh_at: string;
}

export type GiftStatus = "pending" | "accepted" | "expired" | "declined";

export interface PsaGrading {
  id: string;
  user_id: string;
  card_id: string;
  grade: number;
  graded_at: string;
}
