import { NextResponse } from "next/server";
import { getCard, SETS } from "@/lib/sets";
import { RARITY_LABEL } from "@/lib/rarity";
import { PSA_LABEL } from "@/lib/psa";
import type { Rarity } from "@/lib/types";

/**
 * POST /api/discord/share
 *
 * Body (one of):
 *   { kind: "card-hit",   username, cardId, setCode }
 *   { kind: "psa-success", username, cardId, grade }
 *   { kind: "psa-fail",   username, cardId }
 *   { kind: "pack-open",  username, setCode, cardIds }   // legacy
 */

interface CardHitBody {
  kind: "card-hit";
  username: string;
  cardId: string;
  setCode?: string;
}
interface PackOpenBody {
  kind: "pack-open";
  username: string;
  setCode: string;
  cardIds: string[];
}
interface PsaSuccessBody {
  kind: "psa-success";
  username: string;
  cardId: string;
  grade: number;
}
interface PsaFailBody {
  kind: "psa-fail";
  username: string;
  cardId: string;
}
type Body = CardHitBody | PackOpenBody | PsaSuccessBody | PsaFailBody;

// Decimal colors per rarity tier
const RARITY_COLOR: Record<Rarity, number> = {
  C: 0x71717a,
  U: 0x10b981,
  R: 0x0ea5e9,
  RR: 0x6366f1,
  AR: 0xec4899,
  SR: 0xf59e0b,
  MA: 0xf97316,
  SAR: 0xec4899,
  MUR: 0xfbbf24,
  UR: 0xfbbf24,
};

const PSA_COLOR: Record<number, number> = {
  10: 0xfbbf24,
  9: 0xe4e4e7,
  8: 0x34d399,
  7: 0x22d3ee,
  6: 0x0ea5e9,
  5: 0x3b82f6,
  4: 0x8b5cf6,
  3: 0xec4899,
  2: 0xfb7185,
  1: 0x71717a,
};

const ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL ??
  "https://pok-mon-card-pack-opening-simulator.vercel.app";

function absoluteImageUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  if (raw.startsWith("http")) return raw;
  return `${ORIGIN}${raw}`;
}

function mentionFor(rarity: Rarity): string {
  if (rarity === "MUR" || rarity === "UR") return "@everyone";
  if (rarity === "SAR") return "@here";
  return "";
}

function psaMention(grade: number): string {
  if (grade === 10) return "@everyone";
  if (grade === 9) return "@here";
  return "";
}

export async function POST(request: Request) {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) {
    return NextResponse.json(
      { ok: false, error: "Discord 웹훅이 설정되지 않았어요." },
      { status: 503 }
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  const safeUser = (body.username ?? "익명").slice(0, 24);
  let embed: Record<string, unknown>;
  let content = "";

  if (body.kind === "card-hit") {
    const card = getCard(body.cardId);
    if (!card) {
      return NextResponse.json(
        { ok: false, error: "카드를 찾을 수 없어요." },
        { status: 400 }
      );
    }
    const headline =
      card.rarity === "MUR" || card.rarity === "UR"
        ? "🏆 초대박! 울트라/메가 레어 등장!"
        : card.rarity === "SAR"
        ? "🎇 SAR 드랍!"
        : "✨ 레어 카드 등장";
    content = mentionFor(card.rarity);
    embed = {
      title: `${headline} — ${safeUser}님`,
      description: `**${card.name}**\n${SETS[card.setCode].name} · #${card.number}\n등급: **${card.rarity}** (${RARITY_LABEL[card.rarity]})`,
      color: RARITY_COLOR[card.rarity] ?? 0x71717a,
      image: card.imageUrl ? { url: absoluteImageUrl(card.imageUrl) } : undefined,
      footer: { text: "카드깡 자동 알림" },
      timestamp: new Date().toISOString(),
    };
  } else if (body.kind === "psa-success") {
    const card = getCard(body.cardId);
    if (!card) {
      return NextResponse.json(
        { ok: false, error: "카드를 찾을 수 없어요." },
        { status: 400 }
      );
    }
    const grade = Math.max(1, Math.min(10, Math.floor(body.grade)));
    content = psaMention(grade);
    const title =
      grade === 10
        ? `🏆 PSA 10 GEM MINT — ${safeUser}님`
        : grade === 9
        ? `💎 PSA 9 MINT — ${safeUser}님`
        : `🧿 PSA ${grade} — ${safeUser}님`;
    embed = {
      title,
      description: `**${card.name}**\n${SETS[card.setCode].name} · #${card.number}\n등급: **PSA ${grade} (${PSA_LABEL[grade]})**`,
      color: PSA_COLOR[grade] ?? 0x71717a,
      image: card.imageUrl ? { url: absoluteImageUrl(card.imageUrl) } : undefined,
      footer: { text: "PSA 자동 알림" },
      timestamp: new Date().toISOString(),
    };
  } else if (body.kind === "psa-fail") {
    const card = getCard(body.cardId);
    if (!card) {
      return NextResponse.json(
        { ok: false, error: "카드를 찾을 수 없어요." },
        { status: 400 }
      );
    }
    embed = {
      title: `😭 ${safeUser}님의 PSA 감정 실패`,
      description: `**${card.name}** · ${SETS[card.setCode].name} · #${card.number}\n감정 중 카드가 손상되었습니다...`,
      color: 0xdc2626,
      thumbnail: card.imageUrl
        ? { url: absoluteImageUrl(card.imageUrl) }
        : undefined,
      footer: { text: "PSA 자동 알림" },
      timestamp: new Date().toISOString(),
    };
  } else if (body.kind === "pack-open") {
    // Legacy bulk share retained for manual share use-cases.
    const set = SETS[body.setCode as keyof typeof SETS];
    const cards = body.cardIds
      .map((id) => getCard(id))
      .filter((c): c is NonNullable<ReturnType<typeof getCard>> => c !== null)
      .sort((a, b) => {
        const order: Rarity[] = [
          "UR",
          "MUR",
          "SAR",
          "MA",
          "SR",
          "AR",
          "RR",
          "R",
          "U",
          "C",
        ];
        return order.indexOf(a.rarity) - order.indexOf(b.rarity);
      });
    if (cards.length === 0) {
      return NextResponse.json(
        { ok: false, error: "공유할 카드가 없어요." },
        { status: 400 }
      );
    }
    const best = cards[0]!;
    embed = {
      title: `🎴 ${safeUser}님이 팩을 열었어요!`,
      description: cards
        .slice(0, 10)
        .map(
          (c) =>
            `\`${c.rarity.padEnd(3)}\` **${c.name}** · ${SETS[c.setCode].name} · #${c.number}`
        )
        .join("\n"),
      color: RARITY_COLOR[best.rarity] ?? 0x71717a,
      image: best.imageUrl ? { url: absoluteImageUrl(best.imageUrl) } : undefined,
      footer: { text: `최고 등급: ${best.rarity} · ${set?.name ?? body.setCode}` },
      timestamp: new Date().toISOString(),
    };
  } else {
    return NextResponse.json(
      { ok: false, error: "Unknown kind" },
      { status: 400 }
    );
  }

  const payload: Record<string, unknown> = { embeds: [embed] };
  if (content) {
    payload.content = content;
    payload.allowed_mentions = {
      parse: content.includes("@everyone")
        ? ["everyone"]
        : content.includes("@here")
        ? ["everyone"] // @here also requires the "everyone" parse flag
        : [],
    };
  }

  const discordRes = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!discordRes.ok) {
    const text = await discordRes.text().catch(() => "");
    return NextResponse.json(
      { ok: false, error: `Discord ${discordRes.status}: ${text.slice(0, 120)}` },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
