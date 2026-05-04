"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/* ───────────────────────────────────────────────────────────
 * 4~6세 영유아용 카드 맞추기(메모리 매칭) 게임.
 *  · 메인 프로젝트(포켓몬 시뮬) 와 별개 페이지. 로그인 불필요.
 *  · /match 단독 라우트 — Navbar 위에 fixed inset-0 으로 풀스크린.
 *  · CSR 만, server 의존성 없음.
 *  · 모바일/아이패드 우선. 큰 탭 영역, 단순 디자인.
 * ─────────────────────────────────────────────────────────── */

type Player = "이라온" | "민서진";
type Category = "vehicle" | "insect";
type Grid = 4 | 8 | 16;

const PLAYERS: Player[] = ["이라온", "민서진"];

const CATEGORY_LABEL: Record<Category, string> = {
  vehicle: "탈것",
  insect: "곤충",
};

const VEHICLE_EMOJI: string[] = [
  "🚗","🚙","🚕","🚓","🚒","🚑","🚐","🛻","🚚","🚛","🚜",
  "🏎️","🏍️","🛵","🚲","🛴","🛹","🛼",
  "🚂","🚆","🚄","🚅","🚈","🚇","🚊","🚝","🚞","🚋","🚌","🚎",
  "✈️","🛩️","🛫","🛬","🚁","🚀","🛸",
  "🚢","⛵","🛥️","🚤","⛴️","🛶",
  "🎈","🚏","🛺","🚧",
];

const INSECT_EMOJI: string[] = [
  "🐛","🦋","🐌","🐞","🐜","🪰","🪲","🪳","🦗","🦟","🪱",
  "🕷️","🕸️","🦂","🐝",
];

// 부족한 경우 컬러 변형으로 unique 한 짝을 만들어내기 위한 파스텔 팔레트.
const PASTELS: string[] = [
  "#FFD6E0", // pink
  "#FFEFC1", // yellow
  "#D7F0FF", // sky
  "#D4F8E8", // mint
  "#EAD6FF", // lavender
  "#FFE0CC", // peach
  "#CFEEFF", // light blue
  "#FFD4D4", // salmon
  "#E8FFD4", // lime
  "#FFE7F0", // rose
];

interface CardData {
  id: number;          // 카드 인덱스 (0..N-1)
  pairKey: string;     // 같은 짝은 동일 key — emoji + bg
  emoji: string;
  bg: string;
  matched: boolean;
}

function buildPairs(category: Category, pairsNeeded: number): { emoji: string; bg: string; key: string }[] {
  const pool = category === "vehicle" ? VEHICLE_EMOJI : INSECT_EMOJI;
  const pairs: { emoji: string; bg: string; key: string }[] = [];
  let i = 0;
  while (pairs.length < pairsNeeded) {
    const e = pool[i % pool.length];
    const c = PASTELS[Math.floor(i / pool.length) % PASTELS.length];
    pairs.push({ emoji: e, bg: c, key: `${e}|${c}` });
    i++;
  }
  return pairs;
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildDeck(category: Category, grid: Grid): CardData[] {
  const total = grid * grid;            // 짝수 보장 (4·8·16 모두 짝수²)
  const pairsNeeded = total / 2;
  const pairs = buildPairs(category, pairsNeeded);
  const cards: CardData[] = [];
  pairs.forEach((p, idx) => {
    cards.push({
      id: idx * 2,
      pairKey: p.key,
      emoji: p.emoji,
      bg: p.bg,
      matched: false,
    });
    cards.push({
      id: idx * 2 + 1,
      pairKey: p.key,
      emoji: p.emoji,
      bg: p.bg,
      matched: false,
    });
  });
  // 셔플 후 인덱스 재할당
  const shuffled = shuffle(cards);
  return shuffled.map((c, i) => ({ ...c, id: i }));
}

type Screen = "menu" | "playing" | "won";

export default function MatchPage() {
  const [screen, setScreen] = useState<Screen>("menu");

  // 메뉴 선택값 — playing 진입 시 deck 생성에 사용.
  const [player, setPlayer] = useState<Player | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [grid, setGrid] = useState<Grid | null>(null);

  // 게임 상태.
  const [cards, setCards] = useState<CardData[]>([]);
  const [selected, setSelected] = useState<number[]>([]);   // 0~2개
  const [busy, setBusy] = useState(false);                  // 매치 판정 대기
  const [moves, setMoves] = useState(0);                    // 페어 시도 수
  const [activeGrid, setActiveGrid] = useState<Grid>(4);    // 진행 중 grid

  // body 스크롤 잠금 — 풀스크린 게임 중 페이지 흔들림 방지.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const startGame = useCallback(() => {
    if (!player || !category || !grid) return;
    setCards(buildDeck(category, grid));
    setSelected([]);
    setBusy(false);
    setMoves(0);
    setActiveGrid(grid);
    setScreen("playing");
  }, [player, category, grid]);

  const restart = useCallback(() => {
    if (!category) return;
    setCards(buildDeck(category, activeGrid));
    setSelected([]);
    setBusy(false);
    setMoves(0);
    setScreen("playing");
  }, [category, activeGrid]);

  const goMenu = useCallback(() => {
    setScreen("menu");
    setSelected([]);
    setBusy(false);
    setMoves(0);
  }, []);

  // 카드 탭 핸들러.
  const onTapCard = useCallback(
    (idx: number) => {
      if (busy) return;
      const card = cards[idx];
      if (!card || card.matched) return;
      if (selected.includes(idx)) return;

      if (selected.length === 0) {
        setSelected([idx]);
        return;
      }
      // 두 번째 카드.
      const firstIdx = selected[0];
      const first = cards[firstIdx];
      const next = [firstIdx, idx];
      setSelected(next);
      setMoves((m) => m + 1);
      setBusy(true);

      if (first.pairKey === card.pairKey) {
        // 매치 — 살짝 보여주고 matched 처리.
        window.setTimeout(() => {
          setCards((prev) =>
            prev.map((c, i) =>
              i === firstIdx || i === idx ? { ...c, matched: true } : c
            )
          );
          setSelected([]);
          setBusy(false);
        }, 500);
      } else {
        // 미매치 — 잠시 노출 후 다시 뒤집힘.
        window.setTimeout(() => {
          setSelected([]);
          setBusy(false);
        }, 900);
      }
    },
    [busy, cards, selected]
  );

  // 승리 감지.
  useEffect(() => {
    if (screen !== "playing") return;
    if (cards.length === 0) return;
    if (cards.every((c) => c.matched)) {
      const t = window.setTimeout(() => setScreen("won"), 600);
      return () => window.clearTimeout(t);
    }
  }, [cards, screen]);

  return (
    <div
      className="fixed inset-0 z-[1000] overflow-hidden"
      style={{
        background:
          "linear-gradient(180deg, #FFF6E5 0%, #FFE5F1 50%, #E5F1FF 100%)",
      }}
    >
      {screen === "menu" && (
        <MenuScreen
          player={player}
          category={category}
          grid={grid}
          onPlayer={setPlayer}
          onCategory={setCategory}
          onGrid={setGrid}
          onStart={startGame}
        />
      )}
      {screen === "playing" && player && category && (
        <PlayScreen
          player={player}
          category={category}
          grid={activeGrid}
          cards={cards}
          selected={selected}
          moves={moves}
          onTap={onTapCard}
          onMenu={goMenu}
        />
      )}
      {screen === "won" && player && category && (
        <WonScreen
          player={player}
          category={category}
          grid={activeGrid}
          moves={moves}
          onRestart={restart}
          onMenu={goMenu}
        />
      )}
    </div>
  );
}

/* ─────────────── Menu ─────────────── */

function MenuScreen({
  player,
  category,
  grid,
  onPlayer,
  onCategory,
  onGrid,
  onStart,
}: {
  player: Player | null;
  category: Category | null;
  grid: Grid | null;
  onPlayer: (p: Player) => void;
  onCategory: (c: Category) => void;
  onGrid: (g: Grid) => void;
  onStart: () => void;
}) {
  const ready = !!player && !!category && !!grid;
  return (
    <div className="absolute inset-0 overflow-y-auto px-4 py-6 md:px-8 md:py-12 flex flex-col items-center gap-6 md:gap-10">
      <h1 className="text-3xl md:text-5xl font-black text-rose-500 text-center mt-2">
        🃏 카드 짝 맞추기
      </h1>
      <p className="text-sm md:text-base text-zinc-600 text-center">
        같은 그림 두 장을 찾아보세요!
      </p>

      <Section title="누가 할까요?" emoji="👶">
        <div className="grid grid-cols-2 gap-3 md:gap-4 w-full max-w-md">
          {PLAYERS.map((p) => (
            <SelectButton
              key={p}
              active={player === p}
              onClick={() => onPlayer(p)}
              color="rose"
            >
              <span className="text-2xl md:text-3xl">🧒</span>
              <span className="block mt-1 text-base md:text-lg font-black">{p}</span>
            </SelectButton>
          ))}
        </div>
      </Section>

      <Section title="무엇을 맞출까요?" emoji="🎯">
        <div className="grid grid-cols-2 gap-3 md:gap-4 w-full max-w-md">
          <SelectButton
            active={category === "vehicle"}
            onClick={() => onCategory("vehicle")}
            color="sky"
          >
            <span className="text-3xl md:text-4xl">🚗</span>
            <span className="block mt-1 text-base md:text-lg font-black">탈것</span>
          </SelectButton>
          <SelectButton
            active={category === "insect"}
            onClick={() => onCategory("insect")}
            color="emerald"
          >
            <span className="text-3xl md:text-4xl">🐛</span>
            <span className="block mt-1 text-base md:text-lg font-black">곤충</span>
          </SelectButton>
        </div>
      </Section>

      <Section title="얼마나 많이?" emoji="🔢">
        <div className="grid grid-cols-3 gap-3 md:gap-4 w-full max-w-md">
          {([4, 8, 16] as Grid[]).map((g) => (
            <SelectButton
              key={g}
              active={grid === g}
              onClick={() => onGrid(g)}
              color="amber"
            >
              <span className="text-xl md:text-2xl font-black">
                {g}×{g}
              </span>
              <span className="block mt-0.5 text-[10px] md:text-xs text-zinc-500 font-bold">
                {g === 4 ? "쉬움" : g === 8 ? "보통" : "어려움"}
              </span>
              <span className="block mt-0.5 text-[9px] md:text-[10px] text-zinc-400">
                ({(g * g) / 2}쌍)
              </span>
            </SelectButton>
          ))}
        </div>
      </Section>

      <button
        type="button"
        onClick={onStart}
        disabled={!ready}
        style={{ touchAction: "manipulation" }}
        className={`mt-2 w-full max-w-md h-16 md:h-20 rounded-3xl text-xl md:text-2xl font-black transition active:scale-[0.98] ${
          ready
            ? "bg-gradient-to-r from-rose-400 to-orange-400 text-white shadow-lg shadow-rose-200"
            : "bg-zinc-200 text-zinc-400 cursor-not-allowed"
        }`}
      >
        ▶ 시작!
      </button>

      <p className="text-[10px] md:text-xs text-zinc-400 text-center mt-2">
        모바일 · 아이패드 가로/세로 모두 지원
      </p>
    </div>
  );
}

function Section({
  title,
  emoji,
  children,
}: {
  title: string;
  emoji: string;
  children: React.ReactNode;
}) {
  return (
    <section className="w-full flex flex-col items-center gap-3">
      <h2 className="text-base md:text-lg font-black text-zinc-700">
        <span className="mr-1">{emoji}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function SelectButton({
  children,
  active,
  onClick,
  color,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  color: "rose" | "sky" | "emerald" | "amber";
}) {
  // Tailwind JIT 가 동적 class 못 잡는 경우 대비 — 풀 클래스명 인라인.
  const palette: Record<typeof color, { active: string; idle: string }> = {
    rose:    { active: "bg-rose-400 text-white border-rose-500 shadow-rose-200",   idle: "bg-white text-rose-600 border-rose-200 hover:bg-rose-50" },
    sky:     { active: "bg-sky-400 text-white border-sky-500 shadow-sky-200",      idle: "bg-white text-sky-600 border-sky-200 hover:bg-sky-50" },
    emerald: { active: "bg-emerald-400 text-white border-emerald-500 shadow-emerald-200", idle: "bg-white text-emerald-600 border-emerald-200 hover:bg-emerald-50" },
    amber:   { active: "bg-amber-400 text-white border-amber-500 shadow-amber-200", idle: "bg-white text-amber-600 border-amber-200 hover:bg-amber-50" },
  };
  const c = palette[color];
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ touchAction: "manipulation" }}
      className={`min-h-[80px] md:min-h-[96px] rounded-2xl border-2 p-3 transition active:scale-[0.97] shadow-md ${active ? c.active : c.idle}`}
    >
      {children}
    </button>
  );
}

/* ─────────────── Play ─────────────── */

function PlayScreen({
  player,
  category,
  grid,
  cards,
  selected,
  moves,
  onTap,
  onMenu,
}: {
  player: Player;
  category: Category;
  grid: Grid;
  cards: CardData[];
  selected: number[];
  moves: number;
  onTap: (idx: number) => void;
  onMenu: () => void;
}) {
  const matched = useMemo(() => cards.filter((c) => c.matched).length / 2, [cards]);
  const totalPairs = useMemo(() => cards.length / 2, [cards]);

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* 헤더 — 가벼운 정보 */}
      <header className="shrink-0 px-3 py-2 md:px-4 md:py-3 flex items-center gap-2 md:gap-3 bg-white/70 backdrop-blur-sm border-b border-rose-100">
        <button
          type="button"
          onClick={onMenu}
          style={{ touchAction: "manipulation" }}
          className="shrink-0 px-3 py-1.5 md:px-4 md:py-2 rounded-xl bg-rose-100 text-rose-600 font-black text-xs md:text-sm active:scale-95"
        >
          ← 메뉴
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-[11px] md:text-sm font-black text-zinc-700 truncate">
            🧒 {player} · {CATEGORY_LABEL[category]} · {grid}×{grid}
          </p>
          <p className="text-[10px] md:text-xs text-zinc-500 tabular-nums">
            맞춘 짝 <b className="text-emerald-600">{matched}</b> / {totalPairs}
            {"  ·  "}시도 {moves}
          </p>
        </div>
      </header>

      {/* 카드 보드 */}
      <div className="flex-1 min-h-0 overflow-auto p-2 md:p-4">
        <div
          className="mx-auto w-full max-w-[1100px] grid"
          style={{
            gridTemplateColumns: `repeat(${grid}, minmax(0, 1fr))`,
            gap: grid >= 16 ? 3 : grid >= 8 ? 5 : 8,
          }}
        >
          {cards.map((card, idx) => {
            const isShown = card.matched || selected.includes(idx);
            return (
              <Card
                key={card.id}
                card={card}
                shown={isShown}
                disabled={card.matched}
                onTap={() => onTap(idx)}
                size={grid}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Card({
  card,
  shown,
  disabled,
  onTap,
  size,
}: {
  card: CardData;
  shown: boolean;
  disabled: boolean;
  onTap: () => void;
  size: Grid;
}) {
  // 그리드 크기에 따라 이모지 글자 크기 다르게 — 가독성.
  const fontSize =
    size <= 4 ? "clamp(28px, 8vw, 64px)"
    : size <= 8 ? "clamp(18px, 5vw, 40px)"
    : "clamp(10px, 3vw, 24px)";
  const radius = size <= 4 ? 16 : size <= 8 ? 10 : 6;

  return (
    <button
      type="button"
      onClick={onTap}
      disabled={disabled}
      style={{
        touchAction: "manipulation",
        aspectRatio: "1 / 1",
        perspective: "600px",
      }}
      className="relative w-full select-none focus:outline-none"
      aria-label={shown ? `카드 ${card.emoji}` : "뒤집힌 카드"}
    >
      <div
        className="absolute inset-0 transition-transform duration-300"
        style={{
          transformStyle: "preserve-3d",
          transform: shown ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* 카드 뒷면 */}
        <div
          className="absolute inset-0 flex items-center justify-center font-black text-white shadow-md"
          style={{
            backfaceVisibility: "hidden",
            borderRadius: radius,
            background:
              "linear-gradient(135deg, #FF8FB1 0%, #FFB18F 50%, #FFD18F 100%)",
            border: "2px solid #ffffffaa",
            fontSize: size <= 4 ? 28 : size <= 8 ? 18 : 10,
          }}
        >
          ?
        </div>
        {/* 카드 앞면 — emoji */}
        <div
          className="absolute inset-0 flex items-center justify-center shadow-md"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            borderRadius: radius,
            background: card.bg,
            border: card.matched
              ? "2px solid #34D399"
              : "2px solid #ffffffcc",
            fontSize,
            opacity: card.matched ? 0.92 : 1,
          }}
        >
          <span style={{ filter: "drop-shadow(0 1px 0 rgba(0,0,0,0.08))" }}>
            {card.emoji}
          </span>
        </div>
      </div>
    </button>
  );
}

/* ─────────────── Won ─────────────── */

function WonScreen({
  player,
  category,
  grid,
  moves,
  onRestart,
  onMenu,
}: {
  player: Player;
  category: Category;
  grid: Grid;
  moves: number;
  onRestart: () => void;
  onMenu: () => void;
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-6 gap-6 text-center">
      <div className="text-7xl md:text-8xl animate-bounce">🎉</div>
      <h1 className="text-3xl md:text-5xl font-black text-rose-500">
        {player} 잘했어요!
      </h1>
      <p className="text-base md:text-lg text-zinc-700 font-bold">
        {CATEGORY_LABEL[category]} · {grid}×{grid} · {moves}번 시도
      </p>
      <div className="w-full max-w-md flex flex-col gap-3 mt-4">
        <button
          type="button"
          onClick={onRestart}
          style={{ touchAction: "manipulation" }}
          className="w-full h-16 md:h-20 rounded-3xl bg-gradient-to-r from-rose-400 to-orange-400 text-white font-black text-xl md:text-2xl shadow-lg shadow-rose-200 active:scale-[0.98]"
        >
          🔁 다시 하기
        </button>
        <button
          type="button"
          onClick={onMenu}
          style={{ touchAction: "manipulation" }}
          className="w-full h-14 md:h-16 rounded-2xl bg-white border-2 border-rose-200 text-rose-600 font-black text-base md:text-lg active:scale-[0.98]"
        >
          🏠 처음 화면
        </button>
      </div>
    </div>
  );
}
