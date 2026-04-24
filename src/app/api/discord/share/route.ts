import { NextResponse } from "next/server";
import { getCard, SETS } from "@/lib/sets";
import { PSA_LABEL } from "@/lib/psa";
import type { Rarity } from "@/lib/types";

/**
 * POST /api/discord/share
 *
 * Auto-notify hooks — all embeds use the same compact "PSA 실패" style:
 *   thumbnail (small card) + title with emoji + two-line description +
 *   event-specific color.
 *
 * Only the events below will actually post (server-side filter):
 *   - card-hit  : rarity ∈ {SAR, UR, MUR}
 *   - psa-success : grade ∈ {9, 10}
 *   - psa-fail  : always
 */

interface CardHitBody {
  kind: "card-hit";
  username: string;
  cardId: string;
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
interface SabotageBody {
  kind: "sabotage";
  username: string;
  victim: string;
  cardId: string;
  success: boolean;
}
type Body = CardHitBody | PsaSuccessBody | PsaFailBody | SabotageBody;

const NOTIFY_RARITIES = new Set<Rarity>(["SAR", "UR", "MUR"]);

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
};

const ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL ??
  "https://pok-mon-card-pack-opening-simulator.vercel.app";

function absoluteImageUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  if (raw.startsWith("http")) return raw;
  return `${ORIGIN}${raw}`;
}

function mentionForRarity(rarity: Rarity): string {
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
    // Server-side guard — only SAR / UR / MUR should ever notify, even if
    // a client sends something else.
    if (!NOTIFY_RARITIES.has(card.rarity)) {
      return NextResponse.json({ ok: true, skipped: true });
    }
    const headline =
      card.rarity === "MUR" || card.rarity === "UR"
        ? `🏆 ${safeUser}님이 ${card.rarity} 카드를 뽑았어요!`
        : `🎇 ${safeUser}님이 SAR 카드를 뽑았어요!`;
    content = mentionForRarity(card.rarity);
    embed = {
      title: headline,
      description: `**${card.name}**\n${SETS[card.setCode].name} · #${card.number}\n등급: **${card.rarity}**`,
      color: RARITY_COLOR[card.rarity] ?? 0x71717a,
      thumbnail: card.imageUrl
        ? { url: absoluteImageUrl(card.imageUrl) }
        : undefined,
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
    // Server-side guard — only grade 9 / 10 should notify.
    if (grade < 9) {
      return NextResponse.json({ ok: true, skipped: true });
    }
    content = psaMention(grade);
    const title =
      grade === 10
        ? `🏆 ${safeUser}님의 AURA 10 GEM MINT!`
        : `💎 ${safeUser}님의 AURA 9 MINT!`;
    embed = {
      title,
      description: `**${card.name}**\n${SETS[card.setCode].name} · #${card.number}\n등급: **AURA ${grade}** (${PSA_LABEL[grade]})`,
      color: PSA_COLOR[grade] ?? 0x71717a,
      thumbnail: card.imageUrl
        ? { url: absoluteImageUrl(card.imageUrl) }
        : undefined,
      footer: { text: "카드깡 자동 알림" },
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
      title: `😭 ${safeUser}님의 AURA 감정 실패`,
      description: `**${card.name}**\n${SETS[card.setCode].name} · #${card.number}\n감정 중 카드가 손상되었습니다...`,
      color: 0xdc2626,
      thumbnail: card.imageUrl
        ? { url: absoluteImageUrl(card.imageUrl) }
        : undefined,
      footer: { text: "카드깡 자동 알림" },
      timestamp: new Date().toISOString(),
    };
  } else if (body.kind === "sabotage") {
    const card = getCard(body.cardId);
    if (!card) {
      return NextResponse.json(
        { ok: false, error: "카드를 찾을 수 없어요." },
        { status: 400 }
      );
    }
    const victim = (body.victim ?? "익명").slice(0, 24);
    const title = body.success
      ? `💥 ${safeUser}님이 ${victim}님의 ${card.rarity} 카드를 부쉈어요!`
      : `🛡️ ${safeUser}님이 ${victim}님의 ${card.rarity} 카드를 노렸지만 실패했어요`;
    content = body.success ? "@here" : "";
    embed = {
      title,
      description: `**${card.name}**\n${SETS[card.setCode].name} · #${card.number}\n등급: **${card.rarity}** · 결과: ${body.success ? "✅ 성공" : "❌ 실패"}\n공격자: ${safeUser} · 센터 주인: ${victim}`,
      color: body.success ? 0xdc2626 : 0x64748b,
      thumbnail: card.imageUrl
        ? { url: absoluteImageUrl(card.imageUrl) }
        : undefined,
      footer: { text: "포켓몬센터 부수기 알림" },
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
    payload.allowed_mentions = { parse: ["everyone"] };
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
