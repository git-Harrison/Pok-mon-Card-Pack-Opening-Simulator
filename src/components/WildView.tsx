"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/lib/auth";
import {
  fetchUndisplayedGradings,
  wildBattleLoss,
  wildBattleReward,
} from "@/lib/db";
import type { PsaGrading } from "@/lib/types";
import { getCard } from "@/lib/sets";
import { RARITY_STYLE } from "@/lib/rarity";
import { psaTone } from "@/lib/psa";
import { CARD_NAME_TO_TYPE } from "@/lib/wild/name-to-type";
import { WILD_POOL, wildSpriteUrl, type WildMon } from "@/lib/wild/pool";
import { effectiveness, effectivenessLabel } from "@/lib/wild/typechart";
import { computeDamage, slabStats, winReward } from "@/lib/wild/stats";
import { TYPE_STYLE, type WildType } from "@/lib/wild/types";
import PageHeader from "./PageHeader";
import CoinIcon from "./CoinIcon";
import HelpButton, { type HelpSection } from "./HelpButton";

const WILD_HELP_SECTIONS: HelpSection[] = [
  {
    heading: "야생 배틀이란",
    icon: "🌿",
    body: (
      <>
        내 PCL 슬랩 한 장으로 야생 포켓몬과 1:1 턴제 배틀이에요. 이기면 보상이
        들어오지만, <b className="text-rose-300">지면 그 슬랩은 영구 삭제</b>
        돼요.
      </>
    ),
  },
  {
    heading: "스탯 계산",
    icon: "📊",
    body: (
      <>
        슬랩의 (희귀도 + PCL 등급)에 따라 HP·공격력이 결정돼요.
        <ul className="mt-1.5">
          <li>희귀도 베이스 · C 30 ↗ MUR 95 (HP), C 8 ↗ MUR 24 (ATK)</li>
          <li>등급 배수 · 6→1.0 / 7→1.1 / 8→1.3 / 9→1.6 / 10→2.0</li>
        </ul>
        <p className="mt-1.5 text-zinc-400">즉, MUR PCL10 슬랩이 단연 최강.</p>
      </>
    ),
  },
  {
    heading: "타입 상성",
    icon: "⚔️",
    body: (
      <>
        슬랩 ↔ 야생의 타입 상성에 따라 공격 효과가 달라져요.
        <ul className="mt-1.5">
          <li>
            <b className="text-emerald-300">2배</b> 효과는 <b>발군이다!</b>
          </li>
          <li>
            <b className="text-zinc-400">0.5배</b>는 <b>효과가 별로다…</b>
          </li>
          <li>
            <b className="text-zinc-500">0배</b>는 <b>효과가 없는 것 같다…</b>
          </li>
        </ul>
        <p className="mt-1.5 text-zinc-400">
          게임 화면 아래 &quot;타입 상성표&quot;를 펼쳐 미리 확인하세요.
        </p>
      </>
    ),
  },
  {
    heading: "보상",
    icon: "🪙",
    body: (
      <ul>
        <li>
          승리 · <b className="text-amber-300">+20,000p</b> · 랭킹{" "}
          <b className="text-amber-300">+50점</b>
        </li>
        <li>도망 · 비용·페널티 없음. 다음 카드 고를 때 유용</li>
        <li>
          패배 · 슬랩 영구 삭제 + <b>30초 쿨다운</b>
        </li>
      </ul>
    ),
  },
  {
    heading: "배경",
    icon: "🏞️",
    body: (
      <>
        매 조우마다 풀숲·동굴·해변·화산·설산·밤의 숲·고대 유적·체육관·배틀
        스타디움·도시 거리·항구·우주·꽃밭 등 다양한 배틀 무대가 무작위로
        펼쳐져요.
      </>
    ),
  },
  {
    heading: "포켓몬 종류",
    icon: "👾",
    body: (
      <>
        1세대를 중심으로 35종 이상의 야생 포켓몬이 등장해요. 망나뇽·갸라도스·
        프리져·썬더·파이어 같은 강적부터 메타몽·이브이·파오리 같은 친숙한
        얼굴까지 매번 새로운 만남이 기다립니다.
      </>
    ),
  },
  {
    heading: "팁",
    icon: "💡",
    body: (
      <ul>
        <li>야생의 타입을 보고 상성 좋은 슬랩을 골라야 한 방에 끝나요.</li>
        <li>
          PCL 6~7 슬랩은 어차피 랭킹 점수에 안 들어가니 야생 출전 후보로 좋아요.
        </li>
        <li>
          PCL 10이나 MUR 슬랩은 가능하면 안전하게 센터 전시로 보존하세요 —
          부수기로도 잃을 수 있으니 분산이 중요해요.
        </li>
      </ul>
    ),
  },
];

type Phase =
  | "idle"
  | "intro"
  | "picking"
  | "starting"
  | "player-turn"
  | "enemy-attack"
  | "message"
  | "dying"
  | "won"
  | "lost";

/** 카드가 부서질 때 랜덤하게 고르는 마지막 대사. {name} 을 치환. */
const FAREWELL_LINES = [
  "잘 싸웠어… 고마웠어, {name}…",
  "미안해, 내가 부족했어… 잘 가, {name}.",
  "{name}… 영원히 잊지 않을게.",
  "끝까지 버텨줘서 고마워, {name}…",
  "좋은 친구였어, {name}…",
];

const INTRO_LINES = [
  "{name}, 부탁해!",
  "{name}, 보여줘!",
  "가라! {name}!",
  "{name}, 너만 믿는다!",
  "내 차례야! {name}!",
  "좋아! {name} — 가자!",
];

const TURN_OPENER_LINES = [
  "내 턴!",
  "이 기회야!",
  "지금이다!",
  "집중하자…",
  "한 방에 끝내자!",
];

const PLAYER_ATTACK_LINES = [
  "{name}의 일격!",
  "{name}, 공격!",
  "{name}의 결정타!",
  "받아라!",
  "여기다!",
  "{name}의 공격!",
];

const ENEMY_ATTACK_LINES = [
  "야생의 {name}이(가) 반격!",
  "야생의 {name}의 공격!",
  "야생의 {name}이(가) 노려본다!",
  "{name}이(가) 덮친다!",
  "야생의 {name}이(가) 달려든다!",
];

const VICTORY_LINES = [
  "야생의 {name}을(를) 쓰러뜨렸다!",
  "{name}, 기절!",
  "이겼다! {name}!",
  "야생의 {name}은(는) 쓰러졌다!",
  "{name}을(를) 무찔렀다!",
];

function pickLine(arr: readonly string[], name: string): string {
  const line = arr[Math.floor(Math.random() * arr.length)];
  return line.replace(/\{name\}/g, name);
}

function randomFarewell(name: string): string {
  return pickLine(FAREWELL_LINES, name);
}

/** Battle biomes — picked per encounter. Pure CSS so we don't
 *  ship any new asset bytes and can't fail on missing images. */
interface Biome {
  key: string;
  name: string;
  sky: string; // main vertical gradient
  ground: string; // ground glow (bottom radial)
  accent: string; // decorative tint (corner radial)
  border: string;
  emoji: string; // tiny flair in the corner
}

const BIOMES: readonly Biome[] = [
  {
    key: "grass",
    name: "풀숲",
    sky: "linear-gradient(180deg, #0a1730 0%, #1b3a66 30%, #1f4722 60%, #0c2012 100%)",
    ground:
      "radial-gradient(70% 100% at 50% 0%, rgba(74,222,128,0.3), rgba(34,197,94,0) 70%)",
    accent:
      "radial-gradient(50% 40% at 85% 15%, rgba(253,224,71,0.18), transparent 70%)",
    border: "border-emerald-500/30",
    emoji: "🌿",
  },
  {
    key: "cave",
    name: "동굴",
    sky: "linear-gradient(180deg, #110a1f 0%, #1d1330 40%, #1a0e28 70%, #090612 100%)",
    ground:
      "radial-gradient(70% 100% at 50% 0%, rgba(139,92,246,0.28), rgba(76,29,149,0) 70%)",
    accent:
      "radial-gradient(45% 40% at 18% 20%, rgba(196,181,253,0.22), transparent 70%)",
    border: "border-violet-500/30",
    emoji: "🕳️",
  },
  {
    key: "beach",
    name: "해변",
    sky: "linear-gradient(180deg, #0a1a3c 0%, #1c3d74 30%, #d6b884 70%, #b89766 100%)",
    ground:
      "radial-gradient(70% 100% at 50% 0%, rgba(251,191,36,0.3), rgba(217,119,6,0) 70%)",
    accent:
      "radial-gradient(40% 35% at 80% 20%, rgba(253,224,71,0.3), transparent 70%)",
    border: "border-sky-400/30",
    emoji: "🏖️",
  },
  {
    key: "volcano",
    name: "화산",
    sky: "linear-gradient(180deg, #1a0a0a 0%, #3d1414 30%, #5a1a0a 55%, #1a0606 100%)",
    ground:
      "radial-gradient(70% 100% at 50% 0%, rgba(239,68,68,0.35), rgba(127,29,29,0) 70%)",
    accent:
      "radial-gradient(55% 45% at 80% 18%, rgba(251,146,60,0.28), transparent 70%)",
    border: "border-rose-500/40",
    emoji: "🌋",
  },
  {
    key: "snow",
    name: "설산",
    sky: "linear-gradient(180deg, #0f1b2c 0%, #1e3a5f 30%, #7ba4c9 65%, #c7dbec 100%)",
    ground:
      "radial-gradient(70% 100% at 50% 0%, rgba(186,230,253,0.38), rgba(147,197,253,0) 70%)",
    accent:
      "radial-gradient(50% 40% at 20% 18%, rgba(219,234,254,0.25), transparent 70%)",
    border: "border-sky-200/40",
    emoji: "❄️",
  },
  {
    key: "night-forest",
    name: "밤의 숲",
    sky: "linear-gradient(180deg, #050817 0%, #0b1230 35%, #0f2a1e 65%, #060c0a 100%)",
    ground:
      "radial-gradient(70% 100% at 50% 0%, rgba(16,185,129,0.22), rgba(4,120,87,0) 70%)",
    accent:
      "radial-gradient(45% 40% at 82% 16%, rgba(226,232,240,0.28), transparent 70%)",
    border: "border-emerald-400/25",
    emoji: "🌙",
  },
  {
    key: "ruins",
    name: "고대 유적",
    sky: "linear-gradient(180deg, #1a1205 0%, #3a2a10 35%, #2a1e0c 65%, #120a04 100%)",
    ground:
      "radial-gradient(70% 100% at 50% 0%, rgba(217,181,87,0.28), rgba(161,98,7,0) 70%)",
    accent:
      "radial-gradient(50% 40% at 75% 20%, rgba(251,191,36,0.22), transparent 70%)",
    border: "border-amber-600/35",
    emoji: "🏛️",
  },
  {
    key: "gym",
    name: "체육관",
    sky: "linear-gradient(180deg, #0a0a14 0%, #181828 35%, #0f0f1a 70%, #050508 100%)",
    ground:
      "radial-gradient(60% 80% at 50% 0%, rgba(250,204,21,0.32), rgba(202,138,4,0) 70%), repeating-linear-gradient(45deg, rgba(255,255,255,0.05) 0 12px, rgba(0,0,0,0.18) 12px 24px)",
    accent:
      "radial-gradient(35% 45% at 50% 0%, rgba(255,255,255,0.18), transparent 75%)",
    border: "border-amber-300/35",
    emoji: "🏟️",
  },
  {
    key: "stadium",
    name: "배틀 스타디움",
    sky: "linear-gradient(180deg, #050912 0%, #0e1a3a 35%, #14224a 65%, #050912 100%)",
    ground:
      "radial-gradient(80% 60% at 50% 0%, rgba(99,102,241,0.32), rgba(30,27,75,0) 75%)",
    accent:
      "radial-gradient(40% 30% at 50% -10%, rgba(255,255,255,0.28), transparent 70%), radial-gradient(35% 18% at 50% 100%, rgba(168,85,247,0.22), transparent 80%)",
    border: "border-indigo-400/35",
    emoji: "🏆",
  },
  {
    key: "city",
    name: "도시 거리",
    sky: "linear-gradient(180deg, #050214 0%, #1a0a3a 30%, #2a0a4a 65%, #08010f 100%)",
    ground:
      "radial-gradient(70% 80% at 50% 0%, rgba(34,211,238,0.22), rgba(2,132,199,0) 70%)",
    accent:
      "radial-gradient(28% 22% at 18% 60%, rgba(244,114,182,0.28), transparent 70%), radial-gradient(24% 20% at 82% 65%, rgba(34,211,238,0.32), transparent 70%), radial-gradient(18% 14% at 35% 78%, rgba(250,204,21,0.22), transparent 70%)",
    border: "border-fuchsia-400/35",
    emoji: "🌆",
  },
  {
    key: "harbor",
    name: "항구",
    sky: "linear-gradient(180deg, #2a0f1a 0%, #6b2a1c 22%, #c45a2a 45%, #1a3a55 75%, #0c1a2a 100%)",
    ground:
      "radial-gradient(80% 70% at 50% 0%, rgba(251,146,60,0.28), rgba(180,83,9,0) 75%)",
    accent:
      "radial-gradient(22% 12% at 50% 38%, rgba(255,236,180,0.55), transparent 70%), repeating-linear-gradient(180deg, rgba(255,255,255,0.05) 0 2px, transparent 2px 8px)",
    border: "border-orange-400/35",
    emoji: "⚓",
  },
  {
    key: "temple",
    name: "사원",
    sky: "linear-gradient(180deg, #0e0805 0%, #2a1408 35%, #1c0d05 65%, #050302 100%)",
    ground:
      "radial-gradient(70% 100% at 50% 0%, rgba(251,146,60,0.32), rgba(124,45,18,0) 70%)",
    accent:
      "radial-gradient(20% 24% at 18% 30%, rgba(251,191,36,0.45), transparent 70%), radial-gradient(20% 24% at 82% 30%, rgba(251,191,36,0.45), transparent 70%), repeating-linear-gradient(0deg, rgba(120,90,60,0.06) 0 18px, rgba(0,0,0,0.15) 18px 24px)",
    border: "border-orange-500/40",
    emoji: "🕯️",
  },
  {
    key: "magma",
    name: "화산 분화구",
    sky: "linear-gradient(180deg, #0a0205 0%, #45100a 25%, #b13a0a 55%, #ff7a1a 80%, #420a05 100%)",
    ground:
      "radial-gradient(75% 90% at 50% 0%, rgba(255,180,40,0.55), rgba(220,40,10,0) 70%)",
    accent:
      "radial-gradient(28% 18% at 30% 80%, rgba(255,140,40,0.55), transparent 70%), radial-gradient(22% 14% at 70% 86%, rgba(255,210,80,0.55), transparent 70%)",
    border: "border-orange-500/50",
    emoji: "🔥",
  },
  {
    key: "space",
    name: "우주 정거장",
    sky: "linear-gradient(180deg, #02010a 0%, #0a0524 35%, #1a0a3a 70%, #02010a 100%)",
    ground:
      "radial-gradient(70% 80% at 50% 0%, rgba(167,139,250,0.22), rgba(76,29,149,0) 75%)",
    accent:
      "radial-gradient(2px 2px at 12% 18%, white, transparent), radial-gradient(2px 2px at 28% 32%, white, transparent), radial-gradient(1px 1px at 44% 12%, white, transparent), radial-gradient(2px 2px at 62% 26%, white, transparent), radial-gradient(1px 1px at 74% 14%, white, transparent), radial-gradient(2px 2px at 88% 36%, white, transparent), radial-gradient(1px 1px at 18% 48%, white, transparent), radial-gradient(2px 2px at 56% 52%, white, transparent), radial-gradient(1px 1px at 82% 60%, white, transparent)",
    border: "border-violet-300/35",
    emoji: "🌌",
  },
  {
    key: "waterfall",
    name: "폭포",
    sky: "linear-gradient(180deg, #051a2c 0%, #0e3a5f 25%, #1d6bb0 55%, #4ba4d8 85%, #08283a 100%)",
    ground:
      "radial-gradient(80% 60% at 50% 0%, rgba(186,230,253,0.45), rgba(14,165,233,0) 75%)",
    accent:
      "repeating-linear-gradient(180deg, rgba(255,255,255,0.12) 0 2px, transparent 2px 6px), radial-gradient(40% 18% at 50% 92%, rgba(255,255,255,0.28), transparent 70%)",
    border: "border-sky-300/40",
    emoji: "💧",
  },
  {
    key: "flower",
    name: "꽃밭",
    sky: "linear-gradient(180deg, #2c0a3a 0%, #6a1d6e 22%, #d97aaa 50%, #f5c4d4 78%, #b46a8a 100%)",
    ground:
      "radial-gradient(75% 80% at 50% 0%, rgba(251,207,232,0.45), rgba(219,39,119,0) 70%)",
    accent:
      "radial-gradient(8% 6% at 22% 78%, rgba(244,114,182,0.6), transparent 70%), radial-gradient(7% 5% at 38% 88%, rgba(250,204,21,0.55), transparent 70%), radial-gradient(8% 6% at 62% 82%, rgba(167,139,250,0.55), transparent 70%), radial-gradient(7% 5% at 78% 90%, rgba(244,114,182,0.6), transparent 70%)",
    border: "border-pink-300/45",
    emoji: "🌸",
  },
  {
    key: "desert",
    name: "사막",
    sky: "linear-gradient(180deg, #2a1208 0%, #8a4a1a 22%, #d8923a 50%, #f0c878 78%, #5a2a10 100%)",
    ground:
      "radial-gradient(80% 70% at 50% 0%, rgba(252,211,77,0.45), rgba(180,83,9,0) 70%)",
    accent:
      "radial-gradient(28% 14% at 50% 32%, rgba(255,236,180,0.55), transparent 70%), repeating-linear-gradient(95deg, rgba(255,255,255,0.04) 0 6px, transparent 6px 16px)",
    border: "border-amber-400/40",
    emoji: "🏜️",
  },
  {
    key: "thunder-plain",
    name: "번개 평원",
    sky: "linear-gradient(180deg, #060a18 0%, #1a2050 30%, #2a1850 60%, #060a18 100%)",
    ground:
      "radial-gradient(80% 70% at 50% 0%, rgba(250,204,21,0.32), rgba(202,138,4,0) 75%)",
    accent:
      "radial-gradient(35% 18% at 28% 22%, rgba(253,224,71,0.55), transparent 70%), radial-gradient(32% 14% at 78% 30%, rgba(125,211,252,0.4), transparent 70%)",
    border: "border-yellow-300/45",
    emoji: "⚡",
  },
];

function pickBiome(): Biome {
  return BIOMES[Math.floor(Math.random() * BIOMES.length)];
}

interface Slab {
  gradingId: string;
  cardId: string;
  name: string;
  rarity: keyof typeof RARITY_STYLE;
  grade: number;
  imageUrl: string | undefined;
  type: WildType | null;
  hp: number;
  maxHp: number;
  atk: number;
}

interface FloatingDamage {
  id: number;
  target: "enemy" | "player";
  value: number;
  crit: boolean;
  immune: boolean;
}

/** Resolve a card's Pokemon type. Strips suffixes so "피카츄 ex" still
 *  matches "피카츄" if only the base is mapped. */
function resolveType(name: string): WildType | null {
  if (CARD_NAME_TO_TYPE[name] !== undefined) return CARD_NAME_TO_TYPE[name];
  const base = name
    .replace(/\s*\(골드\)\s*$/, "")
    .replace(/\s*\(SV\)\s*$/, "")
    .replace(/\s+(ex|V|VMAX|GX|BREAK)\s*$/i, "")
    .trim();
  return CARD_NAME_TO_TYPE[base] ?? null;
}

export default function WildView() {
  const { user, setPoints } = useAuth();

  const [gradings, setGradings] = useState<PsaGrading[]>([]);
  const [loading, setLoading] = useState(true);

  const [phase, setPhase] = useState<Phase>("idle");
  const [wild, setWild] = useState<WildMon | null>(null);
  const [wildHp, setWildHp] = useState(0);
  const [slab, setSlab] = useState<Slab | null>(null);
  const [bubble, setBubble] = useState<{
    side: "wild" | "player";
    text: string;
  } | null>(null);
  const [floaters, setFloaters] = useState<FloatingDamage[]>([]);
  const [enemyHit, setEnemyHit] = useState(false);
  const [playerHit, setPlayerHit] = useState(false);
  const [attackingSide, setAttackingSide] = useState<"player" | "enemy" | null>(null);
  const [rewarded, setRewarded] = useState<number | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [biome, setBiome] = useState<Biome>(() => BIOMES[0]);
  const floaterSeq = useRef(0);

  const refresh = useCallback(async () => {
    if (!user) return;
    const g = await fetchUndisplayedGradings(user.id);
    setGradings(g);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const eligibleSlabs: Slab[] = useMemo(() => {
    return gradings
      .map((g) => {
        const card = getCard(g.card_id);
        if (!card) return null;
        const type = resolveType(card.name);
        if (!type) return null; // trainer / 굿즈 / unmapped → excluded
        const s = slabStats(card.rarity, g.grade);
        return {
          gradingId: g.id,
          cardId: card.id,
          name: card.name,
          rarity: card.rarity,
          grade: g.grade,
          imageUrl: card.imageUrl,
          type,
          hp: s.hp,
          maxHp: s.hp,
          atk: s.atk,
        } as Slab;
      })
      .filter((x): x is Slab => x !== null)
      .sort((a, b) =>
        b.grade - a.grade || b.maxHp - a.maxHp
      );
  }, [gradings]);

  const addFloater = useCallback(
    (target: "enemy" | "player", value: number, crit = false, immune = false) => {
      floaterSeq.current += 1;
      const id = floaterSeq.current;
      setFloaters((prev) => [...prev, { id, target, value, crit, immune }]);
      setTimeout(() => {
        setFloaters((prev) => prev.filter((f) => f.id !== id));
      }, 900);
    },
    []
  );

  const say = useCallback(
    (text: string, side: "wild" | "player", ms = 1100) => {
      return new Promise<void>((resolve) => {
        setBubble({ side, text });
        setTimeout(resolve, ms);
      });
    },
    []
  );

  const encounter = useCallback(() => {
    const w = WILD_POOL[Math.floor(Math.random() * WILD_POOL.length)];
    setWild(w);
    setWildHp(w.hp);
    setSlab(null);
    setBubble(null);
    setFloaters([]);
    setRewarded(null);
    setBiome(pickBiome());
    setPhase("intro");
  }, []);

  // Auto-advance from intro → picking after short dialogue.
  useEffect(() => {
    if (phase !== "intro" || !wild) return;
    setBubble({ side: "wild", text: wild.cry });
    const t = setTimeout(() => setPhase("picking"), 1500);
    return () => clearTimeout(t);
  }, [phase, wild]);

  const deploy = useCallback(
    async (s: Slab) => {
      setSlab({ ...s });
      setPhase("starting");
      await say(pickLine(INTRO_LINES, s.name), "player", 900);
      setBubble({ side: "player", text: pickLine(TURN_OPENER_LINES, s.name) });
      setPhase("player-turn");
    },
    [say]
  );

  const playerAttack = useCallback(async () => {
    if (!slab || !wild) return;
    const mult = effectiveness(slab.type!, wild.type);
    const dmg = computeDamage(slab.atk, mult);
    setAttackingSide("player");
    await say(pickLine(PLAYER_ATTACK_LINES, slab.name), "player", 500);
    if (mult === 0) {
      addFloater("enemy", 0, false, true);
    } else {
      addFloater("enemy", dmg, mult >= 2);
    }
    setEnemyHit(true);
    setTimeout(() => setEnemyHit(false), 450);
    const newHp = Math.max(0, wildHp - dmg);
    setWildHp(newHp);
    const label = effectivenessLabel(mult);
    // Effectiveness reads on the side of the Pokemon that TOOK the hit.
    if (label.text) await say(label.text, "wild", 700);
    setAttackingSide(null);

    if (newHp <= 0) {
      await say(pickLine(VICTORY_LINES, wild.name), "wild", 900);
      const prize = winReward(wild.hp);
      setRewarded(prize);
      if (user) {
        const res = await wildBattleReward(user.id, prize);
        if (res.ok && typeof res.points === "number") setPoints(res.points);
      }
      setPhase("won");
      return;
    }
    // enemy counter-attack
    setPhase("enemy-attack");
    await say(pickLine(ENEMY_ATTACK_LINES, wild.name), "wild", 600);
    setAttackingSide("enemy");
    const emult = effectiveness(wild.type, slab.type!);
    const edmg = computeDamage(wild.atk, emult);
    if (emult === 0) {
      addFloater("player", 0, false, true);
    } else {
      addFloater("player", edmg, emult >= 2);
    }
    setPlayerHit(true);
    setTimeout(() => setPlayerHit(false), 450);
    const newSlabHp = Math.max(0, slab.hp - edmg);
    setSlab({ ...slab, hp: newSlabHp });
    const elabel = effectivenessLabel(emult);
    if (elabel.text) await say(elabel.text, "player", 700);
    setAttackingSide(null);

    if (newSlabHp <= 0) {
      // Dying phase — farewell message + shatter animation, then the
      // server permanently deletes the grading.
      setPhase("dying");
      await say(randomFarewell(slab.name), "player", 2400);
      if (user) {
        const res = await wildBattleLoss(user.id, slab.gradingId);
        if (!res.ok) console.error("wild_battle_loss failed", res);
        // Refresh eligible slabs so the deleted one is gone.
        void refresh();
      }
      setPhase("lost");
      setCooldownUntil(Date.now() + 30_000);
      return;
    }
    setBubble({ side: "player", text: pickLine(TURN_OPENER_LINES, slab.name) });
    setPhase("player-turn");
  }, [slab, wild, wildHp, addFloater, say, user, setPoints, refresh]);

  const flee = useCallback(async () => {
    if (!wild) return;
    await say("무사히 도망쳤다!", "player", 800);
    resetAll();
  }, [wild, say]);

  const resetAll = useCallback(() => {
    setPhase("idle");
    setWild(null);
    setWildHp(0);
    setSlab(null);
    setBubble(null);
    setFloaters([]);
    setAttackingSide(null);
    setRewarded(null);
  }, []);

  // Cooldown tick
  const [, force] = useState(0);
  useEffect(() => {
    if (!cooldownUntil) return;
    const i = setInterval(() => force((n) => n + 1), 500);
    return () => clearInterval(i);
  }, [cooldownUntil]);

  const cooldownLeft = cooldownUntil
    ? Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000))
    : 0;

  // ── render ──
  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 flex justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
      </div>
    );
  }
  if (eligibleSlabs.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-5 md:py-8 fade-in">
        <FloatingHelp />
        <PageHeader title="🌿 야생" />
        <div className="mt-8 rounded-2xl border border-dashed border-white/10 bg-white/5 py-14 flex flex-col items-center gap-3 text-center px-4">
          <span className="text-5xl">🌾</span>
          <p className="text-lg text-white font-semibold">
            PCL 감별 카드가 필요해요
          </p>
          <p className="text-sm text-zinc-400">
            감별을 받아 슬랩을 한 장이라도 가지고 계셔야 야생과 싸울 수 있어요.
          </p>
          <Link
            href="/grading"
            className="mt-2 inline-flex items-center h-11 px-5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-indigo-500 text-white font-bold text-sm hover:scale-[1.03] transition"
          >
            감별 받으러 가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-3 md:px-6 py-3 md:py-8 fade-in">
      <FloatingHelp />
      <PageHeader title="🌿 야생" />

      {phase === "idle" && (
        <div className="mt-4">
          <IdleCTA
            count={eligibleSlabs.length}
            cooldownLeft={cooldownLeft}
            onStart={encounter}
          />
          <TypeChartHint className="mt-4" />
        </div>
      )}

      {phase !== "idle" && wild && (
        <BattleScene
          wild={wild}
          wildHp={wildHp}
          slab={slab}
          phase={phase}
          bubble={bubble}
          floaters={floaters}
          enemyHit={enemyHit}
          playerHit={playerHit}
          attackingSide={attackingSide}
          biome={biome}
        />
      )}

      {phase === "picking" && (
        <PickSlabPanel slabs={eligibleSlabs} onPick={deploy} />
      )}

      {phase === "player-turn" && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={playerAttack}
            style={{ touchAction: "manipulation" }}
            className="h-11 md:h-12 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 text-zinc-950 font-black text-sm active:scale-[0.98]"
          >
            ⚔️ 공격
          </button>
          <button
            onClick={flee}
            style={{ touchAction: "manipulation" }}
            className="h-11 md:h-12 rounded-xl bg-white/10 border border-white/15 text-white font-bold text-sm active:scale-[0.98]"
          >
            🏃 도망
          </button>
        </div>
      )}

      {phase === "won" && (
        <ResultPanel
          tone="win"
          title={`야생의 ${wild?.name}을(를) 쓰러뜨렸다!`}
          message={
            rewarded !== null
              ? `보상 +${rewarded.toLocaleString("ko-KR")}p 획득!`
              : ""
          }
          onAgain={encounter}
          onExit={resetAll}
        />
      )}
      {phase === "lost" && (
        <ResultPanel
          tone="lose"
          title={`${slab?.name}은(는) 영원히 사라졌다…`}
          message={
            cooldownLeft > 0
              ? `슬랩이 삭제됐어요. ${cooldownLeft}초 뒤 다시 시도 가능.`
              : "슬랩이 삭제됐어요. 다시 도전해 보세요."
          }
          disableAgain={cooldownLeft > 0}
          onAgain={encounter}
          onExit={resetAll}
        />
      )}
    </div>
  );
}

/* ─────────────── sub-components ─────────────── */

function FloatingHelp() {
  return (
    <div
      className="fixed right-3 z-30"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 64px)" }}
    >
      <HelpButton size="sm" title="야생 배틀" sections={WILD_HELP_SECTIONS} />
    </div>
  );
}

function IdleCTA({
  count,
  cooldownLeft,
  onStart,
}: {
  count: number;
  cooldownLeft: number;
  onStart: () => void;
}) {
  const blocked = cooldownLeft > 0;
  return (
    <div
      className="rounded-2xl border border-emerald-500/25 overflow-hidden"
      style={{
        background:
          "radial-gradient(140% 80% at 50% 0%, rgba(16,185,129,0.18) 0%, rgba(6,95,70,0.05) 60%, transparent 100%)",
      }}
    >
      <div className="p-4 md:p-8 text-center">
        <div className="text-4xl md:text-5xl mb-2 motion-safe:animate-bounce">🌾</div>
        <h2 className="text-base md:text-xl font-black text-white">
          풀숲이 흔들린다…
        </h2>
        <p className="mt-1 text-[11px] md:text-xs text-zinc-300">
          보유한 PCL 슬랩 {count}장으로 야생 포켓몬과 겨룹니다.
        </p>
        <button
          onClick={onStart}
          disabled={blocked}
          style={{ touchAction: "manipulation" }}
          className={clsx(
            "mt-3 md:mt-4 h-11 md:h-12 px-5 md:px-6 rounded-xl font-black text-sm inline-flex items-center gap-2 transition",
            blocked
              ? "bg-white/10 text-zinc-500"
              : "bg-gradient-to-r from-emerald-400 to-lime-500 text-zinc-950 hover:scale-[1.03] active:scale-[0.98]"
          )}
        >
          {blocked ? `${cooldownLeft}초 뒤 재도전` : "야생 만나러 가기"}
        </button>
      </div>
      {/* Permanent-loss warning — spelled out so no one stumbles into
          a battle thinking their slab is safe. */}
      <div className="mx-4 mb-4 md:mx-8 md:mb-8 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200 leading-relaxed">
        ⚠️ <b>지면 사용한 PCL 슬랩이 영원히 삭제</b>돼요. 그 카드로 얻었던
        랭킹 점수도 함께 사라집니다. 신중하게 상대의 타입을 보고 고르세요.
      </div>
    </div>
  );
}

function TypeChartHint({ className }: { className?: string }) {
  return (
    <details
      className={clsx(
        "rounded-xl border border-white/10 bg-white/5 group",
        className
      )}
    >
      <summary className="cursor-pointer list-none px-3 py-2 text-[11px] text-zinc-300 flex items-center justify-between">
        <span>💡 타입 상성 요약</span>
        <span className="text-zinc-500 group-open:hidden">▾</span>
        <span className="text-zinc-500 hidden group-open:inline">▴</span>
      </summary>
      <div className="px-3 pb-3 text-[11px] text-zinc-400 leading-snug">
        공격 타입이 방어 타입을 잘 때리면{" "}
        <b className="text-amber-300">×2</b>, 안 먹히면{" "}
        <b className="text-rose-300">×0.5</b>, 완전 무효는{" "}
        <b className="text-zinc-500">×0</b>. 예) 불꽃 → 풀·얼음·벌레·강철 에
        강함, 물·바위·드래곤에 약함.
      </div>
    </details>
  );
}

function BattleScene({
  wild,
  wildHp,
  slab,
  phase,
  bubble,
  floaters,
  enemyHit,
  playerHit,
  attackingSide,
  biome,
}: {
  wild: WildMon;
  wildHp: number;
  slab: Slab | null;
  phase: Phase;
  bubble: { side: "wild" | "player"; text: string } | null;
  floaters: FloatingDamage[];
  enemyHit: boolean;
  playerHit: boolean;
  attackingSide: "player" | "enemy" | null;
  biome: Biome;
}) {
  const wildBubble = bubble?.side === "wild" ? bubble.text : "";
  const playerBubble = bubble?.side === "player" ? bubble.text : "";
  return (
    <section
      className="relative mt-3 overflow-visible aspect-[4/3.2] md:aspect-[4/4]"
    >
      <div
        aria-hidden
        className={clsx(
          "absolute inset-0 rounded-2xl overflow-hidden border pointer-events-none",
          biome.border
        )}
        style={{ background: biome.sky }}
      >
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{ background: biome.accent }}
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-1/3 pointer-events-none"
          style={{ background: biome.ground }}
        />
      </div>
      <div className="absolute top-2 left-2 md:top-3 md:left-3 px-2 py-0.5 rounded-full bg-black/40 backdrop-blur text-[10px] md:text-[11px] text-white/90 border border-white/10 inline-flex items-center gap-1 pointer-events-none z-10">
        <span>{biome.emoji}</span>
        <span className="font-semibold">{biome.name}</span>
      </div>

      {/* Enemy (top-right): bubble on the LEFT of the sprite */}
      <div className="absolute top-3 right-3 md:top-6 md:right-6 flex flex-col items-end">
        <HpBar label={wild.name} hp={wildHp} max={wild.hp} type={wild.type} />
        <div className="mt-2 flex items-center gap-3 md:gap-4">
          {/* Wild speech bubble — pops to the left of the sprite */}
          <AnimatePresence>
            {wildBubble && (
              <SpeechBubble key={wildBubble} text={wildBubble} side="left" />
            )}
          </AnimatePresence>
          <motion.div
            initial={{ x: 200, opacity: 0 }}
            animate={{
              x: 0,
              opacity: wildHp > 0 ? 1 : 0,
              y: enemyHit ? [0, -4, 4, 0] : 0,
              rotate: wildHp <= 0 ? 80 : 0,
            }}
            transition={
              enemyHit
                ? { duration: 0.35 }
                : { type: "spring", stiffness: 180, damping: 18 }
            }
            className="relative"
          >
            {attackingSide === "enemy" && (
              <motion.div
                className="absolute inset-0 pointer-events-none"
                initial={{ x: 0 }}
                animate={{ x: [-6, -30, 0] }}
                transition={{ duration: 0.45 }}
              />
            )}
            <WildSprite dex={wild.dex} hit={enemyHit} />
            <AnimatePresence>
              {floaters
                .filter((f) => f.target === "enemy")
                .map((f) => (
                  <FloatingNumber key={f.id} damage={f} />
                ))}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>

      {/* Player (bottom-left): bubble on the RIGHT of the card */}
      <div className="absolute bottom-3 left-3 md:bottom-6 md:left-6 flex flex-col items-start">
        {slab && (
          <>
            <div className="flex items-center gap-3 md:gap-4">
              <motion.div
                initial={{ x: -200, opacity: 0 }}
                animate={
                  phase === "dying"
                    ? {
                        x: [0, -2, 2, -2, 0],
                        opacity: [1, 0.9, 0.7, 0.35, 0],
                        scale: [1, 1.02, 0.97, 0.92, 0.7],
                        filter: [
                          "blur(0px) brightness(1)",
                          "blur(1px) brightness(1.15)",
                          "blur(3px) brightness(1.3)",
                          "blur(6px) brightness(1.2)",
                          "blur(12px) brightness(0.6)",
                        ],
                        rotate: [0, -2, 3, -4, -8],
                      }
                    : {
                        x: 0,
                        opacity: slab.hp > 0 ? 1 : 0.2,
                        y: playerHit ? [0, -4, 4, 0] : 0,
                        rotate: slab.hp <= 0 ? -15 : 0,
                      }
                }
                transition={
                  phase === "dying"
                    ? { duration: 2.2, ease: "easeIn" }
                    : playerHit
                    ? { duration: 0.35 }
                    : { type: "spring", stiffness: 180, damping: 18 }
                }
                className="relative"
              >
                <PlayerSlab slab={slab} />
                {phase === "dying" && <DeathParticles />}
                <AnimatePresence>
                  {floaters
                    .filter((f) => f.target === "player")
                    .map((f) => (
                      <FloatingNumber key={f.id} damage={f} />
                    ))}
                </AnimatePresence>
              </motion.div>
              {/* Player speech bubble — pops to the right of the card */}
              <AnimatePresence>
                {playerBubble && (
                  <SpeechBubble
                    key={playerBubble}
                    text={playerBubble}
                    side="right"
                  />
                )}
              </AnimatePresence>
            </div>
            <div className="mt-2">
              <HpBar
                label={slab.name}
                hp={slab.hp}
                max={slab.maxHp}
                type={slab.type ?? "노말"}
                align="left"
              />
            </div>
          </>
        )}
      </div>

      {/* Center overlay — intro/starting glyphs */}
      {phase === "intro" && (
        <motion.div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: [0, 1, 1, 0] }}
          transition={{ duration: 1.4, times: [0, 0.2, 0.7, 1] }}
        >
          <span className="text-5xl">❗</span>
        </motion.div>
      )}
    </section>
  );
}

function WildSprite({ dex, hit }: { dex: number; hit: boolean }) {
  const [src, setSrc] = useState(wildSpriteUrl(dex, true));
  // Without this, the local `src` state stays pinned to whichever dex
  // we mounted with — so 한번 더 swaps the name/text but leaves the
  // sprite frozen on the previous Pokémon.
  useEffect(() => {
    setSrc(wildSpriteUrl(dex, true));
  }, [dex]);
  return (
    <div
      className="relative w-28 h-28 md:w-36 md:h-36 flex items-end justify-center"
      style={{
        filter: hit
          ? "drop-shadow(0 0 8px #f43f5e) brightness(1.4)"
          : "drop-shadow(0 4px 12px rgba(0,0,0,0.6))",
      }}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        onError={() => setSrc(wildSpriteUrl(dex, false))}
        style={{
          imageRendering: "pixelated",
          width: "100%",
          height: "auto",
          objectFit: "contain",
        }}
      />
    </div>
  );
}

function PlayerSlab({ slab }: { slab: Slab }) {
  const rstyle = RARITY_STYLE[slab.rarity];
  return (
    <div
      className={clsx(
        "relative w-24 h-32 md:w-28 md:h-40 rounded-lg overflow-hidden ring-2 bg-zinc-900",
        rstyle.frame
      )}
    >
      {slab.imageUrl ? (
        <img
          src={slab.imageUrl}
          alt={slab.name}
          className="w-full h-full object-contain bg-zinc-900"
          draggable={false}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[10px] text-white text-center p-1">
          {slab.name}
        </div>
      )}
    </div>
  );
}

function HpBar({
  label,
  hp,
  max,
  type,
  align = "right",
}: {
  label: string;
  hp: number;
  max: number;
  type: WildType;
  align?: "right" | "left";
}) {
  const pct = Math.max(0, Math.min(100, (hp / max) * 100));
  const barColor =
    pct > 50
      ? "bg-emerald-400"
      : pct > 20
      ? "bg-amber-400"
      : "bg-rose-500";
  return (
    <div
      className={clsx(
        "rounded-lg border border-white/15 bg-black/55 backdrop-blur px-2.5 py-1 min-w-[140px]",
        align === "left" ? "items-start" : "items-end"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold text-white truncate max-w-[100px]">
          {label}
        </span>
        <span
          className={clsx(
            "text-[8px] font-black px-1.5 py-[1px] rounded-full",
            TYPE_STYLE[type].badge
          )}
        >
          {type}
        </span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <motion.div
          className={clsx("h-full", barColor)}
          initial={{ width: "100%" }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        />
      </div>
      <div className="mt-0.5 text-[9px] text-zinc-300 tabular-nums text-right">
        {hp} / {max}
      </div>
    </div>
  );
}

function FloatingNumber({ damage }: { damage: FloatingDamage }) {
  const txt = damage.immune ? "무효" : `-${damage.value}`;
  const cls = damage.immune
    ? "text-zinc-300"
    : damage.crit
    ? "text-amber-300"
    : "text-rose-200";
  return (
    <motion.span
      className={clsx(
        "absolute left-1/2 top-1/3 -translate-x-1/2 font-black text-lg md:text-xl select-none pointer-events-none",
        cls
      )}
      style={{ textShadow: "0 2px 6px rgba(0,0,0,0.8)" }}
      initial={{ y: 0, opacity: 1, scale: 0.6 }}
      animate={{ y: -46, opacity: 0, scale: 1.2 }}
      transition={{ duration: 0.9, ease: "easeOut" }}
    >
      {txt}
    </motion.span>
  );
}

function PickSlabPanel({
  slabs,
  onPick,
}: {
  slabs: Slab[];
  onPick: (s: Slab) => void;
}) {
  return (
    <div className="mt-2 md:mt-4">
      <p className="text-[11px] md:text-xs text-zinc-400 mb-1.5 md:mb-2 px-1">
        싸울 PCL 슬랩을 고르세요 — 타입 상성을 잘 살피고!
      </p>
      <ul
        className={clsx(
          "flex gap-2 overflow-x-auto pb-1 -mx-3 px-3 snap-x snap-mandatory",
          "md:grid md:gap-2 md:overflow-visible md:mx-0 md:px-0 md:snap-none"
        )}
        style={{
          scrollbarWidth: "thin",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
        }}
      >
        {slabs.map((s) => {
          const tone = psaTone(s.grade);
          return (
            <li
              key={s.gradingId}
              className="snap-start shrink-0 w-[44%] sm:w-[32%] md:w-auto"
            >
              <button
                onClick={() => onPick(s)}
                style={{ touchAction: "manipulation" }}
                className={clsx(
                  "w-full flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2 py-1.5 md:py-2 text-left hover:bg-white/10 active:scale-[0.98] transition"
                )}
              >
                <div
                  className={clsx(
                    "shrink-0 w-9 h-12 md:w-10 md:h-14 rounded-md overflow-hidden ring-2 bg-zinc-900",
                    RARITY_STYLE[s.rarity].frame
                  )}
                >
                  {s.imageUrl && (
                    <img
                      src={s.imageUrl}
                      alt=""
                      className="w-full h-full object-contain"
                      draggable={false}
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10.5px] md:text-[11px] font-bold text-white truncate">
                    {s.name}
                  </p>
                  <p className="text-[10px] flex items-center gap-1 mt-0.5">
                    <span
                      className={clsx(
                        "px-1 py-[1px] rounded font-black text-[9px]",
                        tone.banner
                      )}
                    >
                      PCL {s.grade}
                    </span>
                    {s.type && (
                      <span
                        className={clsx(
                          "px-1 py-[1px] rounded font-bold text-[9px]",
                          TYPE_STYLE[s.type].badge
                        )}
                      >
                        {s.type}
                      </span>
                    )}
                  </p>
                  <p className="text-[9px] text-zinc-400 tabular-nums mt-0.5">
                    HP {s.maxHp} · ATK {s.atk}
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ResultPanel({
  tone,
  title,
  message,
  onAgain,
  onExit,
  disableAgain = false,
}: {
  tone: "win" | "lose";
  title: string;
  message: string;
  onAgain: () => void;
  onExit: () => void;
  disableAgain?: boolean;
}) {
  const win = tone === "win";
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx(
        "mt-4 rounded-2xl border p-5 text-center",
        win
          ? "border-amber-400/50 bg-amber-400/10"
          : "border-rose-500/50 bg-rose-500/10"
      )}
    >
      <div className="text-4xl mb-2">{win ? "🏆" : "💥"}</div>
      <h3
        className={clsx(
          "text-lg font-black",
          win ? "text-amber-200" : "text-rose-200"
        )}
      >
        {title}
      </h3>
      {message && (
        <p
          className={clsx(
            "mt-1 text-sm tabular-nums inline-flex items-center gap-1 justify-center",
            win ? "text-amber-300" : "text-rose-300"
          )}
        >
          {win && <CoinIcon size="xs" />}
          {message}
        </p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={onAgain}
          disabled={disableAgain}
          style={{ touchAction: "manipulation" }}
          className={clsx(
            "h-11 rounded-xl font-bold text-sm",
            disableAgain
              ? "bg-white/5 text-zinc-500"
              : "bg-gradient-to-r from-emerald-400 to-lime-500 text-zinc-950 active:scale-[0.98]"
          )}
        >
          한 번 더
        </button>
        <button
          onClick={onExit}
          style={{ touchAction: "manipulation" }}
          className="h-11 rounded-xl bg-white/10 border border-white/15 text-white font-bold text-sm active:scale-[0.98]"
        >
          그만하기
        </button>
      </div>
    </motion.div>
  );
}

/** Small character-adjacent speech bubble with a tail. */
function SpeechBubble({
  text,
  side,
}: {
  text: string;
  side: "left" | "right";
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4, scale: 0.85 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.9 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={clsx(
        "relative max-w-[140px] md:max-w-[160px] rounded-xl px-2.5 py-1.5",
        "bg-white text-zinc-900 text-[11px] md:text-xs font-bold leading-snug",
        "shadow-[0_4px_14px_rgba(0,0,0,0.4)] break-keep",
        side === "left" ? "mr-1.5" : "ml-1.5"
      )}
    >
      {text}
      {/* tail */}
      <span
        aria-hidden
        className={clsx(
          "absolute top-1/2 -translate-y-1/2 w-0 h-0 border-y-[6px] border-y-transparent",
          side === "left"
            ? "-right-1.5 border-l-[7px] border-l-white"
            : "-left-1.5 border-r-[7px] border-r-white"
        )}
      />
    </motion.div>
  );
}

/** Soft "파스스" dust particles rising + fading as the slab disintegrates. */
function DeathParticles() {
  const dots = Array.from({ length: 14 }).map((_, i) => {
    const angle = (i / 14) * Math.PI * 2 + Math.random() * 0.6;
    const dist = 40 + Math.random() * 60;
    return {
      i,
      dx: Math.cos(angle) * dist,
      dy: -40 - Math.random() * 70,
      delay: Math.random() * 0.6,
      size: 2 + Math.random() * 3,
    };
  });
  return (
    <div className="absolute inset-0 pointer-events-none">
      {dots.map((d) => (
        <motion.span
          key={d.i}
          className="absolute left-1/2 top-1/2 rounded-full bg-rose-200/80"
          style={{
            width: d.size,
            height: d.size,
            boxShadow: "0 0 6px rgba(251,207,232,0.8)",
          }}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.6 }}
          animate={{
            x: d.dx,
            y: d.dy,
            opacity: [0, 1, 0.8, 0],
            scale: [0.6, 1, 0.9, 0.4],
          }}
          transition={{
            duration: 1.8 + Math.random() * 0.5,
            delay: d.delay,
            ease: "easeOut",
          }}
        />
      ))}
    </div>
  );
}
