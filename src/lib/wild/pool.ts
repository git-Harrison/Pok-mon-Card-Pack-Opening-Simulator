import type { WildType } from "./types";

/**
 * Wild Pokemon pool — Gen-1 iconic mons across varied types. Sprites are
 * served directly from PokeAPI's GitHub (animated Gen-5 BW for motion,
 * static PNG fallback).
 */
export interface WildMon {
  /** Nat'l Pokedex number — used to key sprite URLs. */
  dex: number;
  /** Korean species name (used in dialogue). */
  name: string;
  /** Primary type. */
  type: WildType;
  /** Base HP at level 50-ish. */
  hp: number;
  /** Base attack power per hit (pre-effectiveness). */
  atk: number;
  /** Short flavor line said on encounter. */
  cry: string;
}

const spriteAnim = (dex: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/${dex}.gif`;

const spriteStatic = (dex: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${dex}.png`;

export function wildSpriteUrl(dex: number, animated = true): string {
  return animated ? spriteAnim(dex) : spriteStatic(dex);
}

export const WILD_POOL: WildMon[] = [
  { dex: 1,   name: "이상해씨",  type: "풀",     hp: 55,  atk: 14, cry: "이상해씨가 잎을 흔들며 경계한다!" },
  { dex: 4,   name: "파이리",    type: "불꽃",   hp: 50,  atk: 16, cry: "파이리가 꼬리에 불을 일렁인다!" },
  { dex: 7,   name: "꼬부기",    type: "물",     hp: 58,  atk: 14, cry: "꼬부기가 등껍질을 내민다!" },
  { dex: 25,  name: "피카츄",    type: "전기",   hp: 45,  atk: 17, cry: "피카츄가 볼에 번개를 모은다!" },
  { dex: 35,  name: "삐삐",      type: "페어리", hp: 60,  atk: 12, cry: "삐삐가 반짝이며 손짓한다…" },
  { dex: 50,  name: "디그다",    type: "땅",     hp: 40,  atk: 15, cry: "디그다가 땅속에서 고개를 내민다!" },
  { dex: 66,  name: "알통몬",    type: "격투",   hp: 65,  atk: 18, cry: "알통몬이 펀치 자세를 취했다!" },
  { dex: 74,  name: "꼬마돌",    type: "바위",   hp: 70,  atk: 14, cry: "꼬마돌이 돌덩이처럼 굳었다!" },
  { dex: 81,  name: "코일",      type: "강철",   hp: 55,  atk: 16, cry: "코일이 자기장을 방출한다…" },
  { dex: 92,  name: "고오스",    type: "고스트", hp: 50,  atk: 17, cry: "고오스가 스르륵 다가온다…" },
  { dex: 131, name: "라프라스",  type: "얼음",   hp: 80,  atk: 15, cry: "라프라스가 조용히 울었다." },
  { dex: 143, name: "잠만보",    type: "노말",   hp: 95,  atk: 16, cry: "잠만보가 어슬렁 몸을 굴렸다!" },
  { dex: 147, name: "미뇽",      type: "드래곤", hp: 55,  atk: 18, cry: "미뇽이 긴 몸을 휘감았다!" },
  { dex: 150, name: "뮤츠",      type: "에스퍼", hp: 85,  atk: 22, cry: "뮤츠의 시선이 정신을 뒤흔든다!" },
  { dex: 261, name: "포챠나",    type: "악",     hp: 50,  atk: 16, cry: "포챠나가 이빨을 드러냈다!" },
  { dex: 16,  name: "구구",      type: "비행",   hp: 45,  atk: 13, cry: "구구가 날개를 퍼덕인다!" },
  { dex: 19,  name: "꼬렛",      type: "노말",   hp: 42,  atk: 14, cry: "꼬렛이 이빨을 드러냈다!" },
  { dex: 23,  name: "아보",      type: "독",     hp: 48,  atk: 15, cry: "아보가 스르륵 혀를 날름거린다…" },
  { dex: 27,  name: "모래두지",  type: "땅",     hp: 55,  atk: 15, cry: "모래두지가 몸을 둥글게 말았다!" },
  { dex: 37,  name: "식스테일",  type: "불꽃",   hp: 48,  atk: 15, cry: "식스테일의 꼬리가 일렁인다!" },
  { dex: 52,  name: "나옹",      type: "노말",   hp: 50,  atk: 15, cry: "나옹이 발톱을 세웠다!" },
  { dex: 54,  name: "고라파덕",  type: "물",     hp: 55,  atk: 14, cry: "고라파덕이 머리를 감싸쥐었다…" },
  { dex: 63,  name: "캐이시",    type: "에스퍼", hp: 42,  atk: 17, cry: "캐이시가 텔레포트를 시도한다…" },
  { dex: 77,  name: "포니타",    type: "불꽃",   hp: 55,  atk: 16, cry: "포니타가 갈기에 불을 붙였다!" },
  { dex: 83,  name: "파오리",    type: "비행",   hp: 50,  atk: 15, cry: "파오리가 파를 내밀었다!" },
  { dex: 95,  name: "롱스톤",    type: "바위",   hp: 75,  atk: 14, cry: "롱스톤이 굉음을 내며 솟아올랐다!" },
  { dex: 109, name: "또가스",    type: "독",     hp: 55,  atk: 15, cry: "또가스가 매캐한 가스를 뿜었다…" },
  { dex: 122, name: "마임맨",    type: "에스퍼", hp: 55,  atk: 16, cry: "마임맨이 보이지 않는 벽을 세웠다!" },
  { dex: 123, name: "스라크",    type: "벌레",   hp: 60,  atk: 18, cry: "스라크가 낫을 휘둘렀다!" },
  { dex: 130, name: "갸라도스",  type: "물",     hp: 88,  atk: 20, cry: "갸라도스가 격렬하게 포효한다!" },
  { dex: 133, name: "이브이",    type: "노말",   hp: 50,  atk: 14, cry: "이브이가 귀를 쫑긋 세웠다!" },
  { dex: 132, name: "메타몽",    type: "노말",   hp: 48,  atk: 13, cry: "메타몽이 형태를 바꾸려 한다…" },
  { dex: 144, name: "프리져",    type: "얼음",   hp: 82,  atk: 19, cry: "프리져가 차가운 바람을 일으킨다!" },
  { dex: 145, name: "썬더",      type: "전기",   hp: 80,  atk: 20, cry: "썬더의 깃털에 번개가 일렁인다!" },
  { dex: 146, name: "파이어",    type: "불꽃",   hp: 80,  atk: 21, cry: "파이어가 화염을 휘날린다!" },
  { dex: 149, name: "망나뇽",    type: "드래곤", hp: 90,  atk: 21, cry: "망나뇽이 하늘에서 내려왔다!" },
];
