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
  | "sv11b"
  | "sv11w"
  | "m1l"
  | "m1s"
  | "m3"
  | "m4"
  // S 시리즈 (소드&실드 시대, 2020-2022 정발). s8ap = "s8a-P"
  // (25주년 기념 컬렉션 박스, hyphen 제거 형태). 나머지는 일본 공식 코드 그대로.
  | "s4a"   // 샤이니스타 V (2020)
  | "s6a"   // 이브이 히어로즈 (2021)
  | "s7r"   // 창공 스트림 (2021)
  | "s8ap"  // 25주년 기념 컬렉션 박스 (2022, s8a-P)
  | "s8b"   // VMAX 클라이맥스 (2022)
  | "s9a";  // 양천의 볼트 태클 (2022)

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
