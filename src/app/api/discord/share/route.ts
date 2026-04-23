import { NextResponse } from "next/server";
import { getCard, SETS } from "@/lib/sets";
import { RARITY_LABEL, RARITY_STYLE } from "@/lib/rarity";
import { PSA_LABEL } from "@/lib/psa";

/**
 * POST /api/discord/share
 *
 * Body:
 *   { kind: "pack-open", username, setCode, cardIds: string[] }
 *   { kind: "psa-success", username, cardId, grade }
 *   { kind: "psa-fail", username, cardId }
 *
 * Uses the DISCORD_WEBHOOK_URL env var (server-only). Returns 503 if unset.
 */

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
type Body = PackOpenBody | PsaSuccessBody | PsaFailBody;

// Discord decimal colors
const RARITY_COLOR: Record<string, number> = {
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

function absoluteImageUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return undefined;
  if (rawUrl.startsWith("http")) return rawUrl;
  return `${ORIGIN}${rawUrl}`;
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

  if (body.kind === "pack-open") {
    const set = SETS[body.setCode as keyof typeof SETS];
    const cards = body.cardIds
      .map((id) => getCard(id))
      .filter(Boolean)
      .sort(
        (a, b) =>
          RARITY_STYLE[b!.rarity].tier - RARITY_STYLE[a!.rarity].tier
      );
    if (cards.length === 0) {
      return NextResponse.json(
        { ok: false, error: "공유할 카드가 없어요." },
        { status: 400 }
      );
    }
    const best = cards[0]!;
    const color = RARITY_COLOR[best.rarity] ?? 0x71717a;
    const description = cards
      .slice(0, 10)
      .map(
        (c) =>
          `\`${c!.rarity.padEnd(3)}\` **${c!.name}** · ${SETS[c!.setCode].name} · #${c!.number}`
      )
      .join("\n");
    embed = {
      title: `🎴 ${safeUser}님이 팩을 열었어요!`,
      description,
      color,
      image: best.imageUrl
        ? { url: absoluteImageUrl(best.imageUrl) }
        : undefined,
      footer: {
        text: `최고 등급: ${best.rarity} · ${
          set?.name ?? body.setCode
        }`,
      },
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
    const color = PSA_COLOR[grade] ?? 0x71717a;
    const title =
      grade === 10
        ? `🏆 ${safeUser}님이 PSA 10 GEM MINT 카드를 뽑았어요!`
        : `🧿 ${safeUser}님의 PSA ${grade} 감정 결과`;
    embed = {
      title,
      description: `**${card.name}** · ${SETS[card.setCode].name} · #${card.number}\n등급: **PSA ${grade} (${PSA_LABEL[grade]})**`,
      color,
      image: card.imageUrl
        ? { url: absoluteImageUrl(card.imageUrl) }
        : undefined,
      footer: { text: "PSA 등급 감별" },
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
      footer: { text: "PSA 등급 감별" },
      timestamp: new Date().toISOString(),
    };
  } else {
    return NextResponse.json(
      { ok: false, error: "Unknown kind" },
      { status: 400 }
    );
  }

  const discordRes = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] }),
  });

  if (!discordRes.ok) {
    const text = await discordRes.text().catch(() => "");
    return NextResponse.json(
      { ok: false, error: `Discord 응답: ${discordRes.status} ${text.slice(0, 120)}` },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
