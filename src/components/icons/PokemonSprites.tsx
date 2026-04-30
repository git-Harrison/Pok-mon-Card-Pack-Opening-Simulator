// 내 포켓몬 컨텐츠 전용 — 10종 픽셀 SVG 스프라이트.
// viewBox 32x32, shapeRendering crispEdges 로 NPC 와 유사한 청키 픽셀 톤.
// 모두 rect 기반이라 색이 Tailwind 와 무관하게 인라인으로 고정.

type SpriteProps = { size?: number; className?: string };

export type StarterSpecies =
  | "pikachu"
  | "charmander"
  | "squirtle"
  | "bulbasaur"
  | "gastly"
  | "dratini"
  | "pidgey"
  | "piplup"
  | "mew"
  | "mewtwo";

interface SpeciesMeta {
  species: StarterSpecies;
  name: string;
  rarity: "common" | "rare" | "super";
  /** 등장 직후 말풍선 톤. */
  greet: string;
  /** 기본 sprite 컬러 — 카드 배경 액센트 등에 사용. */
  accent: string;
}

export const STARTER_META: Record<StarterSpecies, SpeciesMeta> = {
  pikachu: {
    species: "pikachu",
    name: "피카츄",
    rarity: "common",
    greet: "피카!",
    accent: "#facc15",
  },
  charmander: {
    species: "charmander",
    name: "파이리",
    rarity: "common",
    greet: "파이리!",
    accent: "#fb923c",
  },
  squirtle: {
    species: "squirtle",
    name: "꼬북이",
    rarity: "common",
    greet: "꼬북꼬북",
    accent: "#38bdf8",
  },
  bulbasaur: {
    species: "bulbasaur",
    name: "이상해씨",
    rarity: "common",
    greet: "이상해씨~",
    accent: "#22c55e",
  },
  gastly: {
    species: "gastly",
    name: "고오스",
    rarity: "common",
    greet: "고오~~",
    accent: "#7c3aed",
  },
  dratini: {
    species: "dratini",
    name: "미뇽",
    rarity: "common",
    greet: "미뇽!",
    accent: "#60a5fa",
  },
  pidgey: {
    species: "pidgey",
    name: "구구",
    rarity: "common",
    greet: "구구구",
    accent: "#a16207",
  },
  piplup: {
    species: "piplup",
    name: "팽도리",
    rarity: "common",
    greet: "팽팽!",
    accent: "#0ea5e9",
  },
  mew: {
    species: "mew",
    name: "뮤",
    rarity: "rare",
    greet: "뮤……?",
    accent: "#f472b6",
  },
  mewtwo: {
    species: "mewtwo",
    name: "뮤츠",
    rarity: "super",
    greet: "……그래.",
    accent: "#a78bfa",
  },
};

export const STARTER_LIST: StarterSpecies[] = [
  "pikachu",
  "charmander",
  "squirtle",
  "bulbasaur",
  "gastly",
  "dratini",
  "pidgey",
  "piplup",
];

export function PokemonSprite({
  species,
  size = 96,
  className,
}: SpriteProps & { species: StarterSpecies }) {
  const Sprite = SPRITES[species];
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      aria-hidden
      className={className}
    >
      <Sprite />
    </svg>
  );
}

// ─────────────── individual sprites ───────────────

function Pikachu() {
  return (
    <>
      {/* 귀 (검은 끝) */}
      <rect x="9"  y="3" width="2" height="2" fill="#0f172a" />
      <rect x="21" y="3" width="2" height="2" fill="#0f172a" />
      <rect x="8"  y="5" width="3" height="3" fill="#facc15" />
      <rect x="21" y="5" width="3" height="3" fill="#facc15" />
      {/* 머리 */}
      <rect x="10" y="7"  width="12" height="7" fill="#facc15" />
      <rect x="9"  y="8"  width="1"  height="5" fill="#facc15" />
      <rect x="22" y="8"  width="1"  height="5" fill="#facc15" />
      {/* 볼 (빨간) */}
      <rect x="10" y="11" width="2" height="2" fill="#dc2626" />
      <rect x="20" y="11" width="2" height="2" fill="#dc2626" />
      {/* 눈 */}
      <rect x="13" y="9"  width="2" height="2" fill="#0f172a" />
      <rect x="17" y="9"  width="2" height="2" fill="#0f172a" />
      <rect x="14" y="9"  width="1" height="1" fill="#fff" />
      <rect x="18" y="9"  width="1" height="1" fill="#fff" />
      {/* 입 */}
      <rect x="15" y="12" width="2" height="1" fill="#0f172a" />
      {/* 몸 */}
      <rect x="11" y="14" width="10" height="9" fill="#facc15" />
      <rect x="12" y="23" width="3" height="2" fill="#facc15" />
      <rect x="17" y="23" width="3" height="2" fill="#facc15" />
      {/* 꼬리 (지그재그) */}
      <rect x="22" y="15" width="3" height="2" fill="#a16207" />
      <rect x="25" y="13" width="2" height="3" fill="#facc15" />
      <rect x="27" y="11" width="2" height="3" fill="#facc15" />
      <rect x="25" y="9"  width="3" height="3" fill="#facc15" />
    </>
  );
}

function Charmander() {
  return (
    <>
      {/* 머리 */}
      <rect x="8"  y="6"  width="12" height="9" fill="#fb923c" />
      <rect x="7"  y="8"  width="1"  height="5" fill="#fb923c" />
      <rect x="20" y="8"  width="1"  height="5" fill="#fb923c" />
      {/* 눈 */}
      <rect x="11" y="9"  width="2" height="2" fill="#0f172a" />
      <rect x="16" y="9"  width="2" height="2" fill="#0f172a" />
      <rect x="12" y="9"  width="1" height="1" fill="#fff" />
      <rect x="17" y="9"  width="1" height="1" fill="#fff" />
      {/* 입 */}
      <rect x="13" y="13" width="3" height="1" fill="#7c2d12" />
      {/* 몸 (배는 크림) */}
      <rect x="10" y="15" width="9" height="8" fill="#fb923c" />
      <rect x="12" y="17" width="5" height="5" fill="#fde68a" />
      {/* 다리 */}
      <rect x="10" y="23" width="3" height="3" fill="#fb923c" />
      <rect x="16" y="23" width="3" height="3" fill="#fb923c" />
      {/* 발톱 */}
      <rect x="10" y="26" width="1" height="1" fill="#fcd34d" />
      <rect x="12" y="26" width="1" height="1" fill="#fcd34d" />
      <rect x="16" y="26" width="1" height="1" fill="#fcd34d" />
      <rect x="18" y="26" width="1" height="1" fill="#fcd34d" />
      {/* 꼬리 + 불꽃 */}
      <rect x="20" y="20" width="3" height="2" fill="#fb923c" />
      <rect x="23" y="18" width="2" height="3" fill="#fb923c" />
      <rect x="25" y="14" width="2" height="5" fill="#fbbf24" />
      <rect x="24" y="11" width="3" height="3" fill="#f97316" />
      <rect x="25" y="9"  width="2" height="2" fill="#facc15" />
    </>
  );
}

function Squirtle() {
  return (
    <>
      {/* 머리 */}
      <rect x="8"  y="6"  width="12" height="8" fill="#38bdf8" />
      <rect x="7"  y="8"  width="1"  height="5" fill="#38bdf8" />
      <rect x="20" y="8"  width="1"  height="5" fill="#38bdf8" />
      {/* 눈 */}
      <rect x="11" y="9"  width="2" height="2" fill="#0f172a" />
      <rect x="16" y="9"  width="2" height="2" fill="#0f172a" />
      <rect x="12" y="9"  width="1" height="1" fill="#fff" />
      <rect x="17" y="9"  width="1" height="1" fill="#fff" />
      {/* 입 */}
      <rect x="13" y="12" width="3" height="1" fill="#0c4a6e" />
      <rect x="14" y="13" width="2" height="1" fill="#0c4a6e" />
      {/* 등껍질 */}
      <rect x="9"  y="14" width="14" height="9" fill="#a16207" />
      <rect x="10" y="15" width="12" height="7" fill="#ca8a04" />
      <rect x="12" y="17" width="2"  height="2" fill="#854d0e" />
      <rect x="18" y="17" width="2"  height="2" fill="#854d0e" />
      <rect x="15" y="20" width="2"  height="2" fill="#854d0e" />
      {/* 배 (껍질 안쪽 크림) */}
      <rect x="13" y="23" width="6"  height="3" fill="#fde68a" />
      {/* 발 */}
      <rect x="10" y="23" width="3" height="3" fill="#38bdf8" />
      <rect x="19" y="23" width="3" height="3" fill="#38bdf8" />
      {/* 꼬리 */}
      <rect x="22" y="20" width="3" height="2" fill="#38bdf8" />
    </>
  );
}

function Bulbasaur() {
  return (
    <>
      {/* 머리 */}
      <rect x="8"  y="9"  width="12" height="9" fill="#65a30d" />
      <rect x="7"  y="11" width="1"  height="5" fill="#65a30d" />
      <rect x="20" y="11" width="1"  height="5" fill="#65a30d" />
      {/* 머리 점박이 */}
      <rect x="9"  y="10" width="2" height="2" fill="#3f6212" />
      <rect x="17" y="10" width="2" height="2" fill="#3f6212" />
      <rect x="13" y="11" width="2" height="2" fill="#3f6212" />
      {/* 눈 */}
      <rect x="10" y="13" width="2" height="2" fill="#fff" />
      <rect x="16" y="13" width="2" height="2" fill="#fff" />
      <rect x="11" y="13" width="1" height="2" fill="#dc2626" />
      <rect x="17" y="13" width="1" height="2" fill="#dc2626" />
      {/* 입 */}
      <rect x="12" y="16" width="4" height="1" fill="#3f6212" />
      <rect x="13" y="17" width="1" height="1" fill="#3f6212" />
      <rect x="15" y="17" width="1" height="1" fill="#3f6212" />
      {/* 몸 */}
      <rect x="9"  y="18" width="14" height="6" fill="#84cc16" />
      <rect x="10" y="19" width="2"  height="2" fill="#3f6212" />
      <rect x="20" y="19" width="2"  height="2" fill="#3f6212" />
      {/* 다리 */}
      <rect x="9"  y="24" width="3" height="2" fill="#65a30d" />
      <rect x="20" y="24" width="3" height="2" fill="#65a30d" />
      {/* 등의 구근 */}
      <rect x="20" y="6"  width="6" height="6" fill="#22c55e" />
      <rect x="22" y="4"  width="2" height="2" fill="#16a34a" />
      <rect x="21" y="7"  width="1" height="1" fill="#bbf7d0" />
      <rect x="24" y="7"  width="1" height="1" fill="#bbf7d0" />
    </>
  );
}

function Gastly() {
  return (
    <>
      {/* 외각 보라 안개 */}
      <rect x="6"  y="6"  width="20" height="20" fill="#581c87" opacity="0.45" />
      {/* 본체 검은 가스 구슬 */}
      <rect x="9"  y="8"  width="14" height="14" fill="#1e1b4b" />
      <rect x="8"  y="10" width="1"  height="10" fill="#1e1b4b" />
      <rect x="23" y="10" width="1"  height="10" fill="#1e1b4b" />
      <rect x="10" y="7"  width="12" height="1"  fill="#1e1b4b" />
      <rect x="10" y="22" width="12" height="1"  fill="#1e1b4b" />
      {/* 눈 (빛나는 흰자) */}
      <rect x="12" y="11" width="3" height="3" fill="#fff" />
      <rect x="17" y="11" width="3" height="3" fill="#fff" />
      <rect x="13" y="12" width="1" height="1" fill="#0f172a" />
      <rect x="18" y="12" width="1" height="1" fill="#0f172a" />
      {/* 입 (이빨) */}
      <rect x="12" y="17" width="8" height="2" fill="#fff" />
      <rect x="13" y="19" width="1" height="1" fill="#fff" />
      <rect x="15" y="19" width="1" height="1" fill="#fff" />
      <rect x="17" y="19" width="1" height="1" fill="#fff" />
      <rect x="19" y="19" width="1" height="1" fill="#fff" />
      {/* 가스 안개 흩날림 */}
      <rect x="4"  y="14" width="2" height="2" fill="#7c3aed" opacity="0.6" />
      <rect x="26" y="14" width="2" height="2" fill="#7c3aed" opacity="0.6" />
      <rect x="14" y="4"  width="2" height="2" fill="#7c3aed" opacity="0.5" />
      <rect x="14" y="26" width="2" height="2" fill="#7c3aed" opacity="0.5" />
    </>
  );
}

function Dratini() {
  return (
    <>
      {/* S 자 몸통 */}
      <rect x="6"  y="20" width="18" height="3" fill="#60a5fa" />
      <rect x="22" y="14" width="3"  height="9" fill="#60a5fa" />
      <rect x="9"  y="14" width="16" height="3" fill="#60a5fa" />
      <rect x="9"  y="8"  width="3"  height="9" fill="#60a5fa" />
      <rect x="9"  y="6"  width="14" height="3" fill="#60a5fa" />
      {/* 머리 (둥글게) */}
      <rect x="20" y="6"  width="6" height="6" fill="#60a5fa" />
      <rect x="19" y="7"  width="1" height="4" fill="#60a5fa" />
      {/* 흰색 배 */}
      <rect x="11" y="21" width="11" height="1" fill="#dbeafe" />
      {/* 귀느낌 (보라) */}
      <rect x="20" y="3"  width="2" height="3" fill="#a855f7" />
      <rect x="24" y="3"  width="2" height="3" fill="#a855f7" />
      {/* 눈 */}
      <rect x="22" y="8"  width="2" height="2" fill="#0f172a" />
      <rect x="22" y="8"  width="1" height="1" fill="#fff" />
      {/* 입 */}
      <rect x="24" y="10" width="2" height="1" fill="#1e3a8a" />
    </>
  );
}

function Pidgey() {
  return (
    <>
      {/* 몸 (둥근 갈색) */}
      <rect x="9"  y="10" width="14" height="12" fill="#a16207" />
      <rect x="8"  y="12" width="1"  height="8"  fill="#a16207" />
      <rect x="23" y="12" width="1"  height="8"  fill="#a16207" />
      <rect x="10" y="9"  width="12" height="1"  fill="#a16207" />
      <rect x="10" y="22" width="12" height="1"  fill="#a16207" />
      {/* 얼굴 크림 */}
      <rect x="11" y="11" width="10" height="6" fill="#fde68a" />
      {/* 눈 */}
      <rect x="13" y="13" width="2" height="2" fill="#0f172a" />
      <rect x="17" y="13" width="2" height="2" fill="#0f172a" />
      <rect x="13" y="13" width="1" height="1" fill="#fff" />
      <rect x="17" y="13" width="1" height="1" fill="#fff" />
      {/* 부리 */}
      <rect x="14" y="16" width="4" height="2" fill="#f59e0b" />
      <rect x="15" y="18" width="2" height="1" fill="#f59e0b" />
      {/* 머리 깃털 (앞쪽) */}
      <rect x="13" y="7"  width="3" height="2" fill="#854d0e" />
      <rect x="16" y="6"  width="3" height="3" fill="#854d0e" />
      <rect x="19" y="7"  width="2" height="2" fill="#854d0e" />
      {/* 날개 */}
      <rect x="6"  y="14" width="3" height="5" fill="#854d0e" />
      <rect x="23" y="14" width="3" height="5" fill="#854d0e" />
      {/* 발 */}
      <rect x="11" y="23" width="2" height="2" fill="#f59e0b" />
      <rect x="19" y="23" width="2" height="2" fill="#f59e0b" />
    </>
  );
}

function Piplup() {
  return (
    <>
      {/* 머리 (진한 파랑) */}
      <rect x="9"  y="5"  width="14" height="9" fill="#1d4ed8" />
      <rect x="8"  y="7"  width="1"  height="5" fill="#1d4ed8" />
      <rect x="23" y="7"  width="1"  height="5" fill="#1d4ed8" />
      {/* 머리 위 왕관 모양 */}
      <rect x="13" y="3"  width="2" height="3" fill="#1d4ed8" />
      <rect x="17" y="3"  width="2" height="3" fill="#1d4ed8" />
      {/* 얼굴 흰색 */}
      <rect x="11" y="9"  width="10" height="5" fill="#dbeafe" />
      {/* 눈 */}
      <rect x="13" y="10" width="2" height="2" fill="#0f172a" />
      <rect x="17" y="10" width="2" height="2" fill="#0f172a" />
      <rect x="13" y="10" width="1" height="1" fill="#fff" />
      <rect x="17" y="10" width="1" height="1" fill="#fff" />
      {/* 부리 */}
      <rect x="14" y="13" width="4" height="2" fill="#facc15" />
      {/* 몸 */}
      <rect x="10" y="14" width="12" height="9" fill="#1d4ed8" />
      <rect x="12" y="16" width="8"  height="6" fill="#dbeafe" />
      {/* 가슴 노란 라인 */}
      <rect x="14" y="17" width="4" height="1" fill="#facc15" />
      <rect x="14" y="20" width="4" height="1" fill="#facc15" />
      {/* 날개 */}
      <rect x="7"  y="16" width="3" height="5" fill="#1d4ed8" />
      <rect x="22" y="16" width="3" height="5" fill="#1d4ed8" />
      {/* 발 */}
      <rect x="11" y="23" width="3" height="3" fill="#facc15" />
      <rect x="18" y="23" width="3" height="3" fill="#facc15" />
    </>
  );
}

function Mew() {
  return (
    <>
      {/* 머리 (큰 분홍 원) */}
      <rect x="8"  y="6"  width="14" height="11" fill="#f9a8d4" />
      <rect x="7"  y="8"  width="1"  height="7"  fill="#f9a8d4" />
      <rect x="22" y="8"  width="1"  height="7"  fill="#f9a8d4" />
      <rect x="9"  y="5"  width="12" height="1"  fill="#f9a8d4" />
      {/* 귀 */}
      <rect x="9"  y="3"  width="3" height="3" fill="#f9a8d4" />
      <rect x="20" y="3"  width="3" height="3" fill="#f9a8d4" />
      <rect x="10" y="4"  width="1" height="1" fill="#fb7185" />
      <rect x="21" y="4"  width="1" height="1" fill="#fb7185" />
      {/* 큰 눈 */}
      <rect x="11" y="9"  width="3" height="4" fill="#1e1b4b" />
      <rect x="16" y="9"  width="3" height="4" fill="#1e1b4b" />
      <rect x="11" y="9"  width="1" height="2" fill="#fff" />
      <rect x="16" y="9"  width="1" height="2" fill="#fff" />
      <rect x="13" y="11" width="1" height="1" fill="#a78bfa" />
      <rect x="18" y="11" width="1" height="1" fill="#a78bfa" />
      {/* 입 */}
      <rect x="14" y="14" width="2" height="1" fill="#9d174d" />
      {/* 작은 몸통 */}
      <rect x="11" y="17" width="8" height="6" fill="#f9a8d4" />
      {/* 작은 팔 */}
      <rect x="8"  y="18" width="3" height="2" fill="#f9a8d4" />
      <rect x="19" y="18" width="3" height="2" fill="#f9a8d4" />
      {/* 작은 다리 */}
      <rect x="11" y="23" width="3" height="2" fill="#f9a8d4" />
      <rect x="16" y="23" width="3" height="2" fill="#f9a8d4" />
      {/* 긴 꼬리 (구불) */}
      <rect x="19" y="25" width="2" height="2" fill="#f9a8d4" />
      <rect x="21" y="23" width="2" height="3" fill="#f9a8d4" />
      <rect x="23" y="20" width="2" height="4" fill="#f9a8d4" />
      <rect x="25" y="17" width="2" height="4" fill="#f9a8d4" />
      <rect x="26" y="15" width="2" height="3" fill="#f9a8d4" />
      {/* 신비한 광채 */}
      <rect x="4"  y="6"  width="2" height="2" fill="#f0abfc" opacity="0.7" />
      <rect x="27" y="6"  width="2" height="2" fill="#f0abfc" opacity="0.7" />
      <rect x="4"  y="22" width="2" height="2" fill="#f0abfc" opacity="0.7" />
    </>
  );
}

function Mewtwo() {
  return (
    <>
      {/* 머리 (보라 캣형) */}
      <rect x="9"  y="4"  width="14" height="8" fill="#a78bfa" />
      <rect x="8"  y="6"  width="1"  height="4" fill="#a78bfa" />
      <rect x="23" y="6"  width="1"  height="4" fill="#a78bfa" />
      {/* 머리 위 두 뿔 (캣 이어) */}
      <rect x="9"  y="2"  width="2" height="2" fill="#a78bfa" />
      <rect x="21" y="2"  width="2" height="2" fill="#a78bfa" />
      {/* 눈 (날카로운 보라/흰) */}
      <rect x="11" y="7"  width="3" height="2" fill="#1e1b4b" />
      <rect x="18" y="7"  width="3" height="2" fill="#1e1b4b" />
      <rect x="12" y="7"  width="1" height="1" fill="#fff" />
      <rect x="19" y="7"  width="1" height="1" fill="#fff" />
      {/* 입 */}
      <rect x="14" y="10" width="4" height="1" fill="#312e81" />
      {/* 목 튜브 (회색) */}
      <rect x="14" y="12" width="4" height="3" fill="#52525b" />
      {/* 가슴/몸 (크림 톤 + 보라 외곽) */}
      <rect x="10" y="14" width="12" height="9" fill="#c4b5fd" />
      <rect x="12" y="16" width="8"  height="6" fill="#ede9fe" />
      {/* 어깨 보라 */}
      <rect x="9"  y="14" width="1" height="6" fill="#a78bfa" />
      <rect x="22" y="14" width="1" height="6" fill="#a78bfa" />
      {/* 팔 */}
      <rect x="6"  y="15" width="3" height="6" fill="#a78bfa" />
      <rect x="23" y="15" width="3" height="6" fill="#a78bfa" />
      {/* 다리 */}
      <rect x="11" y="23" width="3" height="3" fill="#a78bfa" />
      <rect x="18" y="23" width="3" height="3" fill="#a78bfa" />
      {/* 꼬리 (긴 보라 곡선) */}
      <rect x="22" y="22" width="3" height="2" fill="#a78bfa" />
      <rect x="24" y="20" width="3" height="2" fill="#a78bfa" />
      <rect x="26" y="17" width="3" height="3" fill="#a78bfa" />
      {/* 사이오 광채 */}
      <rect x="3"  y="3"  width="2" height="2" fill="#c084fc" opacity="0.7" />
      <rect x="27" y="3"  width="2" height="2" fill="#c084fc" opacity="0.7" />
      <rect x="3"  y="27" width="2" height="2" fill="#c084fc" opacity="0.6" />
      <rect x="27" y="27" width="2" height="2" fill="#c084fc" opacity="0.6" />
    </>
  );
}

const SPRITES: Record<StarterSpecies, () => React.JSX.Element> = {
  pikachu: Pikachu,
  charmander: Charmander,
  squirtle: Squirtle,
  bulbasaur: Bulbasaur,
  gastly: Gastly,
  dratini: Dratini,
  pidgey: Pidgey,
  piplup: Piplup,
  mew: Mew,
  mewtwo: Mewtwo,
};

// 하단 네비 / 더보기 시트용 아이콘 (몬스터볼 외각만 그린 라인 아이콘).
export function PokeballNavIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h7" />
      <path d="M14 12h7" />
      <circle cx="12" cy="12" r="2.2" />
    </svg>
  );
}
