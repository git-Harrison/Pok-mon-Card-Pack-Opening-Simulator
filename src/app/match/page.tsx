"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ───────────────────────────────────────────────────────────
 * 4~6세 영유아용 카드 짝 맞추기 게임 + 행동 분석.
 *  · 메인 프로젝트와 별개 페이지. 로그인 불필요. /match.
 *  · 풀스크린 fixed inset-0. CSR only.
 *  · 모바일/아이패드 우선.
 *
 * 기능:
 *   - 그리드: 3x3(8장+와일드1) / 4x4 / 6x6 / 8x8
 *   - 카테고리: 탈것 / 곤충
 *   - 사용자: 이라온 / 민서진
 *   - 매 탭 ms 기록 → 종료 시 결정시간/시도간 간격/정확도/전·후반 분석
 *   - localStorage 히스토리 → 직전 기록과 성장 비교
 * ─────────────────────────────────────────────────────────── */

type Player = "이라온" | "민서진";
type Category = "vehicle" | "insect";
type Grid = 3 | 4 | 6 | 8;

const PLAYERS: Player[] = ["이라온", "민서진"];

const CATEGORY_LABEL: Record<Category, string> = {
  vehicle: "탈것",
  insect: "곤충",
};

const GRID_LABEL: Record<Grid, string> = {
  3: "쉬움",
  4: "보통",
  6: "어려움",
  8: "전문가",
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

const PASTELS: string[] = [
  "#FFD6E0","#FFEFC1","#D7F0FF","#D4F8E8","#EAD6FF",
  "#FFE0CC","#CFEEFF","#FFD4D4","#E8FFD4","#FFE7F0",
];

interface CardData {
  id: number;
  pairKey: string;
  emoji: string;
  bg: string;
  matched: boolean;
  isWild?: boolean;   // 3x3 가운데 1칸 — 항상 matched, 클릭 불가
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
  const total = grid * grid;
  const wildCount = total % 2;                // 9 → 1, 그 외 0
  const pairsNeeded = (total - wildCount) / 2;
  const pairs = buildPairs(category, pairsNeeded);
  const cards: CardData[] = [];
  pairs.forEach((p) => {
    cards.push({ id: 0, pairKey: p.key, emoji: p.emoji, bg: p.bg, matched: false });
    cards.push({ id: 0, pairKey: p.key, emoji: p.emoji, bg: p.bg, matched: false });
  });
  if (wildCount > 0) {
    // 와일드 — 자동 매치 처리. 데코 ⭐.
    cards.push({
      id: 0,
      pairKey: "__wild__",
      emoji: "⭐",
      bg: "#FFFBE0",
      matched: true,
      isWild: true,
    });
  }
  return shuffle(cards).map((c, i) => ({ ...c, id: i }));
}

/* ─────────────── 분석 / 히스토리 ─────────────── */

interface PlayRecord {
  ts: number;
  player: Player;
  category: Category;
  grid: Grid;
  totalPairs: number;
  moves: number;
  successRate: number;        // matches / moves * 100
  totalDurationMs: number;
  avgDecisionMs: number;      // 한 시도 안 1탭→2탭 평균
  avgBetweenMs: number;       // 직전 시도 종료→다음 시도 시작 평균
  decisionStdev: number;      // 결정시간 표준편차
  firstHalfAccuracy: number;  // 0~1
  secondHalfAccuracy: number; // 0~1
}

const HISTORY_KEY = "match:history:v1";

function loadHistory(): PlayRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr as PlayRecord[];
  } catch {
    return [];
  }
}

function saveRecord(rec: PlayRecord) {
  if (typeof window === "undefined") return;
  try {
    const list = loadHistory();
    list.push(rec);
    // 200개만 보관
    const trimmed = list.slice(-200);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  } catch {
    /* quota / disabled — silently skip */
  }
}

function findPrevious(
  records: PlayRecord[],
  player: Player,
  category: Category,
  grid: Grid
): PlayRecord | null {
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i];
    if (r.player === player && r.category === category && r.grid === grid) {
      return r;
    }
  }
  return null;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = mean(xs.map((x) => (x - m) ** 2));
  return Math.sqrt(v);
}

interface AnalysisTag {
  icon: string;
  label: string;
  desc: string;
  tone: "good" | "neutral" | "warn";
}

function analyzeRecord(rec: PlayRecord): AnalysisTag[] {
  const tags: AnalysisTag[] = [];

  // 1) 반응 속도 (한 시도 안 두 카드 사이 결정시간)
  const dec = rec.avgDecisionMs;
  if (dec < 1500) {
    tags.push({ icon: "⚡", label: "매우 빠른 결정", desc: "직관적·적극적 성향. 카드를 보자마자 결정하는 편이에요.", tone: "neutral" });
  } else if (dec < 3000) {
    tags.push({ icon: "🏃", label: "빠른 반응", desc: "재빠른 판단력. 또래 평균보다 빠른 편이에요.", tone: "good" });
  } else if (dec < 5000) {
    tags.push({ icon: "🧘", label: "차분한 페이스", desc: "신중하게 관찰한 뒤 결정합니다.", tone: "good" });
  } else {
    tags.push({ icon: "🐢", label: "매우 신중함", desc: "충분히 생각하고 누르는 성향. 정답률을 높이기에 유리해요.", tone: "neutral" });
  }

  // 2) 시도 간 간격 (성격 급함 vs 여유)
  const bet = rec.avgBetweenMs;
  if (bet < 700) {
    tags.push({ icon: "🔥", label: "성격이 급한 편", desc: "결과 확인 즉시 다음 시도. 충동성이 약간 있을 수 있어요.", tone: "warn" });
  } else if (bet < 1800) {
    tags.push({ icon: "😊", label: "활발한 진행", desc: "적당한 호흡으로 게임을 즐깁니다.", tone: "good" });
  } else {
    tags.push({ icon: "🤔", label: "여유로운 진행", desc: "한 번씩 생각을 정리하며 진행합니다.", tone: "good" });
  }

  // 3) 정확도 (작업기억력)
  const acc = rec.successRate;
  if (acc >= 70) {
    tags.push({ icon: "🧠", label: "기억력 우수", desc: "본 카드 위치를 잘 유지하는 작업기억(working memory) 이 좋아요.", tone: "good" });
  } else if (acc >= 50) {
    tags.push({ icon: "👍", label: "기억력 양호", desc: "또래 평균 수준의 작업기억을 보여줍니다.", tone: "good" });
  } else if (acc >= 35) {
    tags.push({ icon: "🌱", label: "기억력 발달 중", desc: "꾸준한 반복으로 향상이 기대됩니다.", tone: "neutral" });
  } else {
    tags.push({ icon: "🎲", label: "추측 위주 시도", desc: "기억보다 시도가 앞섭니다. 카드 수가 적은 그리드부터 권장.", tone: "warn" });
  }

  // 4) 학습 곡선 (전·후반 정확도)
  const delta = rec.secondHalfAccuracy - rec.firstHalfAccuracy;
  if (delta >= 0.15) {
    tags.push({ icon: "📈", label: "빠른 적응력", desc: "게임이 진행될수록 정확도가 또렷이 향상됩니다.", tone: "good" });
  } else if (delta <= -0.15) {
    tags.push({ icon: "⚠️", label: "후반 집중력 저하", desc: "후반에 정확도가 떨어집니다. 짧은 휴식 후 재도전 권장.", tone: "warn" });
  } else {
    tags.push({ icon: "⚖️", label: "꾸준한 집중", desc: "전·후반 정확도가 일정합니다.", tone: "good" });
  }

  // 5) 페이스 변동성 (CV = stdev / mean)
  const cv = dec > 0 ? rec.decisionStdev / dec : 0;
  if (cv > 0.7) {
    tags.push({ icon: "🌊", label: "페이스 변동 큼", desc: "쉬운 카드는 빠르게, 어려운 카드는 느리게 — 인지 부하에 민감.", tone: "neutral" });
  } else if (cv < 0.3 && rec.moves >= 6) {
    tags.push({ icon: "🎯", label: "안정적 페이스", desc: "결정 속도가 매우 일정합니다. 정서 안정성·집중력 우수.", tone: "good" });
  }

  return tags;
}

interface DiffItem {
  metric: string;
  delta: number;
  display: string;
  isBetter: boolean;
}

function compareToPrev(curr: PlayRecord, prev: PlayRecord): DiffItem[] {
  const items: DiffItem[] = [];

  const movesDelta = curr.moves - prev.moves;
  items.push({
    metric: "시도 횟수",
    delta: movesDelta,
    display: movesDelta === 0 ? "동일" : `${movesDelta > 0 ? "+" : ""}${movesDelta}회`,
    isBetter: movesDelta < 0,
  });

  const accDelta = curr.successRate - prev.successRate;
  items.push({
    metric: "정확도",
    delta: accDelta,
    display: `${accDelta > 0 ? "+" : ""}${accDelta.toFixed(1)}%p`,
    isBetter: accDelta > 0,
  });

  const decDelta = curr.avgDecisionMs - prev.avgDecisionMs;
  items.push({
    metric: "평균 결정시간",
    delta: decDelta,
    display: `${decDelta > 0 ? "+" : ""}${(decDelta / 1000).toFixed(2)}초`,
    isBetter: decDelta < 0,   // 빨라진 게 좋음
  });

  const durDelta = curr.totalDurationMs - prev.totalDurationMs;
  items.push({
    metric: "총 소요 시간",
    delta: durDelta,
    display: `${durDelta > 0 ? "+" : ""}${(durDelta / 1000).toFixed(1)}초`,
    isBetter: durDelta < 0,
  });

  return items;
}

function growthSummary(diffs: DiffItem[]): { icon: string; text: string } {
  const better = diffs.filter((d) => d.isBetter).length;
  if (better >= 3) return { icon: "🌟", text: "큰 성장이 보여요! 지난번보다 훨씬 능숙해졌어요." };
  if (better === 2) return { icon: "👏", text: "꾸준히 발전하고 있어요." };
  if (better === 1) return { icon: "🌱", text: "한 가지 영역에서 향상이 있어요." };
  return { icon: "💪", text: "다음번엔 더 잘할 수 있어요!" };
}

/* ─────────────── 컴포넌트 ─────────────── */

type Screen = "menu" | "playing" | "won";

export default function MatchPage() {
  const [screen, setScreen] = useState<Screen>("menu");

  const [player, setPlayer] = useState<Player | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [grid, setGrid] = useState<Grid | null>(null);

  const [cards, setCards] = useState<CardData[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [moves, setMoves] = useState(0);
  const [activeGrid, setActiveGrid] = useState<Grid>(4);

  // 매 카드 탭 시각 (ms). 첫 탭이 게임 시작 기준점.
  const tapTimesRef = useRef<number[]>([]);
  const matchOutcomesRef = useRef<boolean[]>([]); // 시도별 match 여부

  const [finalRecord, setFinalRecord] = useState<PlayRecord | null>(null);
  const [previousRecord, setPreviousRecord] = useState<PlayRecord | null>(null);

  // body 스크롤 잠금.
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
    tapTimesRef.current = [];
    matchOutcomesRef.current = [];
    setFinalRecord(null);
    setPreviousRecord(null);
    setActiveGrid(grid);
    setScreen("playing");
  }, [player, category, grid]);

  const restart = useCallback(() => {
    if (!category) return;
    setCards(buildDeck(category, activeGrid));
    setSelected([]);
    setBusy(false);
    setMoves(0);
    tapTimesRef.current = [];
    matchOutcomesRef.current = [];
    setFinalRecord(null);
    setPreviousRecord(null);
    setScreen("playing");
  }, [category, activeGrid]);

  const goMenu = useCallback(() => {
    setScreen("menu");
    setSelected([]);
    setBusy(false);
    setMoves(0);
  }, []);

  const onTapCard = useCallback(
    (idx: number) => {
      if (busy) return;
      const card = cards[idx];
      if (!card || card.matched || card.isWild) return;
      if (selected.includes(idx)) return;

      const now = Date.now();
      tapTimesRef.current.push(now);

      if (selected.length === 0) {
        setSelected([idx]);
        return;
      }
      const firstIdx = selected[0];
      const first = cards[firstIdx];
      setSelected([firstIdx, idx]);
      setMoves((m) => m + 1);
      setBusy(true);

      const isMatch = first.pairKey === card.pairKey;
      matchOutcomesRef.current.push(isMatch);

      if (isMatch) {
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
        window.setTimeout(() => {
          setSelected([]);
          setBusy(false);
        }, 900);
      }
    },
    [busy, cards, selected]
  );

  // 승리 감지 + 기록 산출.
  useEffect(() => {
    if (screen !== "playing") return;
    if (cards.length === 0) return;
    if (!cards.every((c) => c.matched)) return;
    if (!player || !category) return;

    // 분석 산출.
    const taps = tapTimesRef.current;
    const outcomes = matchOutcomesRef.current;
    const totalPairs = cards.filter((c) => !c.isWild).length / 2;

    // 시도 결정 시간[k] = taps[2k+1] - taps[2k]
    const decisions: number[] = [];
    for (let k = 0; 2 * k + 1 < taps.length; k++) {
      decisions.push(taps[2 * k + 1] - taps[2 * k]);
    }
    // 시도 간 간격[k] = taps[2k] - taps[2k-1] (k>=1)
    const betweens: number[] = [];
    for (let k = 1; 2 * k < taps.length; k++) {
      betweens.push(taps[2 * k] - taps[2 * k - 1]);
    }

    const movesCount = outcomes.length;
    const matchesCount = outcomes.filter(Boolean).length;
    const successRate = movesCount > 0 ? (matchesCount / movesCount) * 100 : 0;

    const half = Math.floor(outcomes.length / 2);
    const firstHalf = outcomes.slice(0, half);
    const secondHalf = outcomes.slice(half);
    const firstAcc = firstHalf.length > 0
      ? firstHalf.filter(Boolean).length / firstHalf.length
      : 0;
    const secondAcc = secondHalf.length > 0
      ? secondHalf.filter(Boolean).length / secondHalf.length
      : 0;

    const totalDuration = taps.length >= 2
      ? taps[taps.length - 1] - taps[0]
      : 0;

    const rec: PlayRecord = {
      ts: Date.now(),
      player,
      category,
      grid: activeGrid,
      totalPairs,
      moves: movesCount,
      successRate,
      totalDurationMs: totalDuration,
      avgDecisionMs: mean(decisions),
      avgBetweenMs: mean(betweens),
      decisionStdev: stdev(decisions),
      firstHalfAccuracy: firstAcc,
      secondHalfAccuracy: secondAcc,
    };

    // 직전 기록 — 저장 전에 조회 (지금 이번 기록이 직전이 되면 안 됨).
    const history = loadHistory();
    const prev = findPrevious(history, player, category, activeGrid);
    setPreviousRecord(prev);

    saveRecord(rec);
    setFinalRecord(rec);

    const t = window.setTimeout(() => setScreen("won"), 600);
    return () => window.clearTimeout(t);
  }, [cards, screen, player, category, activeGrid]);

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
      {screen === "won" && finalRecord && (
        <WonScreen
          record={finalRecord}
          previous={previousRecord}
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
        <div className="grid grid-cols-4 gap-2 md:gap-3 w-full max-w-md">
          {([3, 4, 6, 8] as Grid[]).map((g) => {
            const total = g * g;
            const wild = total % 2;
            const pairs = (total - wild) / 2;
            return (
              <SelectButton
                key={g}
                active={grid === g}
                onClick={() => onGrid(g)}
                color="amber"
              >
                <span className="text-lg md:text-2xl font-black">
                  {g}×{g}
                </span>
                <span className="block mt-0.5 text-[10px] md:text-xs text-zinc-500 font-bold">
                  {GRID_LABEL[g]}
                </span>
                <span className="block mt-0.5 text-[9px] md:text-[10px] text-zinc-400">
                  ({pairs}쌍)
                </span>
              </SelectButton>
            );
          })}
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
  const totalPairs = useMemo(
    () => cards.filter((c) => !c.isWild).length / 2,
    [cards]
  );
  const matchedPairs = useMemo(
    () => cards.filter((c) => !c.isWild && c.matched).length / 2,
    [cards]
  );

  return (
    <div className="absolute inset-0 flex flex-col">
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
            맞춘 짝 <b className="text-emerald-600">{matchedPairs}</b> / {totalPairs}
            {"  ·  "}시도 {moves}
          </p>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-auto p-2 md:p-4">
        <div
          className="mx-auto w-full max-w-[1100px] grid"
          style={{
            gridTemplateColumns: `repeat(${grid}, minmax(0, 1fr))`,
            gap: grid >= 8 ? 5 : grid >= 6 ? 6 : 8,
          }}
        >
          {cards.map((card, idx) => {
            const isShown = card.matched || selected.includes(idx);
            return (
              <Card
                key={card.id}
                card={card}
                shown={isShown}
                disabled={card.matched || !!card.isWild}
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
  const fontSize =
    size <= 3 ? "clamp(36px, 12vw, 80px)"
    : size <= 4 ? "clamp(28px, 8vw, 64px)"
    : size <= 6 ? "clamp(20px, 6vw, 48px)"
    : "clamp(16px, 4.5vw, 36px)";
  const radius = size <= 4 ? 16 : size <= 6 ? 12 : 8;

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
        <div
          className="absolute inset-0 flex items-center justify-center font-black text-white shadow-md"
          style={{
            backfaceVisibility: "hidden",
            borderRadius: radius,
            background:
              "linear-gradient(135deg, #FF8FB1 0%, #FFB18F 50%, #FFD18F 100%)",
            border: "2px solid #ffffffaa",
            fontSize: size <= 4 ? 28 : size <= 6 ? 20 : 14,
          }}
        >
          ?
        </div>
        <div
          className="absolute inset-0 flex items-center justify-center shadow-md"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            borderRadius: radius,
            background: card.bg,
            border: card.isWild
              ? "2px solid #FFD700"
              : card.matched
              ? "2px solid #34D399"
              : "2px solid #ffffffcc",
            fontSize,
            opacity: card.matched && !card.isWild ? 0.92 : 1,
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
  record,
  previous,
  onRestart,
  onMenu,
}: {
  record: PlayRecord;
  previous: PlayRecord | null;
  onRestart: () => void;
  onMenu: () => void;
}) {
  const tags = useMemo(() => analyzeRecord(record), [record]);
  const diffs = useMemo(
    () => (previous ? compareToPrev(record, previous) : null),
    [record, previous]
  );
  const summary = diffs ? growthSummary(diffs) : null;

  return (
    <div className="absolute inset-0 overflow-y-auto px-4 py-6 md:px-8 md:py-10 flex flex-col items-center gap-4">
      {/* 헤더 — 축하 */}
      <div className="flex flex-col items-center gap-2 mt-2">
        <div className="text-6xl md:text-7xl animate-bounce">🎉</div>
        <h1 className="text-2xl md:text-4xl font-black text-rose-500 text-center">
          {record.player} 잘했어요!
        </h1>
        <p className="text-sm md:text-base text-zinc-700 font-bold">
          {CATEGORY_LABEL[record.category]} · {record.grid}×{record.grid} ·{" "}
          {formatDuration(record.totalDurationMs)}
        </p>
      </div>

      {/* 지표 카드 */}
      <section className="w-full max-w-md rounded-2xl bg-white/85 border border-rose-100 shadow-md p-4">
        <h2 className="text-sm font-black text-zinc-700 mb-3">📊 이번 기록</h2>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="시도 횟수" value={`${record.moves}번`} />
          <Stat label="맞춘 짝" value={`${record.totalPairs}쌍`} />
          <Stat
            label="성공률"
            value={`${record.successRate.toFixed(1)}%`}
            tone={record.successRate >= 60 ? "good" : "neutral"}
          />
          <Stat
            label="평균 결정시간"
            value={`${(record.avgDecisionMs / 1000).toFixed(2)}초`}
          />
          <Stat
            label="평균 시도 간격"
            value={`${(record.avgBetweenMs / 1000).toFixed(2)}초`}
          />
          <Stat
            label="총 소요"
            value={formatDuration(record.totalDurationMs)}
          />
        </div>
      </section>

      {/* 분석 */}
      <section className="w-full max-w-md rounded-2xl bg-white/85 border border-violet-100 shadow-md p-4">
        <h2 className="text-sm font-black text-zinc-700 mb-3">
          🧩 행동 분석
        </h2>
        <ul className="flex flex-col gap-2">
          {tags.map((t, i) => (
            <li
              key={i}
              className={`rounded-xl px-3 py-2 border-l-4 ${toneClass(t.tone)}`}
            >
              <p className="text-[13px] font-black text-zinc-800">
                <span className="mr-1">{t.icon}</span>
                {t.label}
              </p>
              <p className="text-[11px] text-zinc-600 mt-0.5 leading-snug">
                {t.desc}
              </p>
            </li>
          ))}
        </ul>
        <p className="text-[10px] text-zinc-400 mt-3 leading-snug">
          ※ 4~6세 영유아 카드 매칭 게임 한 라운드 데이터 기반의 휴리스틱
          분석이며, 진단/평가가 아닙니다. 여러 라운드 누적 시 더 정확합니다.
        </p>
      </section>

      {/* 성장 비교 */}
      {diffs && summary && previous && (
        <section className="w-full max-w-md rounded-2xl bg-white/85 border border-emerald-100 shadow-md p-4">
          <h2 className="text-sm font-black text-zinc-700 mb-1">
            📈 지난 기록과 비교
          </h2>
          <p className="text-[11px] text-zinc-500 mb-3">
            직전 기록: {new Date(previous.ts).toLocaleString("ko-KR", {
              month: "numeric",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          <ul className="flex flex-col gap-2">
            {diffs.map((d, i) => (
              <li
                key={i}
                className="rounded-lg bg-zinc-50 px-3 py-2 flex items-center justify-between gap-2"
              >
                <span className="text-[12px] text-zinc-700 font-bold">
                  {d.metric}
                </span>
                <span
                  className={`text-[12px] font-black tabular-nums ${
                    d.delta === 0
                      ? "text-zinc-500"
                      : d.isBetter
                      ? "text-emerald-600"
                      : "text-rose-500"
                  }`}
                >
                  {d.isBetter && d.delta !== 0 ? "✓ " : d.delta === 0 ? "= " : "↗ "}
                  {d.display}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 rounded-xl bg-gradient-to-r from-emerald-50 to-cyan-50 border border-emerald-200 px-3 py-2">
            <p className="text-[13px] font-black text-emerald-700">
              <span className="mr-1">{summary.icon}</span>
              {summary.text}
            </p>
          </div>
        </section>
      )}

      {!diffs && (
        <section className="w-full max-w-md rounded-2xl bg-white/60 border border-zinc-200 px-3 py-2.5">
          <p className="text-[11px] text-zinc-500 text-center leading-snug">
            🆕 같은 사용자 · 카테고리 · 그리드의 첫 기록입니다. 다음 도전부터
            성장 비교가 표시돼요.
          </p>
        </section>
      )}

      <div className="w-full max-w-md flex flex-col gap-2 mt-2 mb-6">
        <button
          type="button"
          onClick={onRestart}
          style={{ touchAction: "manipulation" }}
          className="w-full h-14 md:h-16 rounded-2xl bg-gradient-to-r from-rose-400 to-orange-400 text-white font-black text-lg md:text-xl shadow-lg shadow-rose-200 active:scale-[0.98]"
        >
          🔁 다시 하기
        </button>
        <button
          type="button"
          onClick={onMenu}
          style={{ touchAction: "manipulation" }}
          className="w-full h-12 md:h-14 rounded-2xl bg-white border-2 border-rose-200 text-rose-600 font-black text-sm md:text-base active:scale-[0.98]"
        >
          🏠 처음 화면
        </button>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "good" | "neutral";
}) {
  return (
    <div
      className={`rounded-xl px-3 py-2 ${
        tone === "good"
          ? "bg-emerald-50 border border-emerald-200"
          : "bg-zinc-50 border border-zinc-200"
      }`}
    >
      <p className="text-[10px] text-zinc-500 font-bold leading-tight">{label}</p>
      <p
        className={`text-base md:text-lg font-black tabular-nums leading-tight mt-0.5 ${
          tone === "good" ? "text-emerald-700" : "text-zinc-800"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function toneClass(tone: AnalysisTag["tone"]): string {
  if (tone === "good") return "bg-emerald-50 border-emerald-400";
  if (tone === "warn") return "bg-amber-50 border-amber-400";
  return "bg-sky-50 border-sky-400";
}

function formatDuration(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}초`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}분 ${s}초`;
}
