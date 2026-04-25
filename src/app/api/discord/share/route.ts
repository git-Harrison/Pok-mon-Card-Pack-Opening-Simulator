import { NextResponse } from "next/server";
import { getCard, SETS } from "@/lib/sets";
import { PSA_LABEL } from "@/lib/psa";

/**
 * POST /api/discord/share
 *
 * Auto-notify hooks. Only the events below will actually post (the server
 * still applies a final whitelist so a misbehaving client can't spam):
 *
 *   - psa-success : grade === 10 only
 *   - sabotage    : success === true only
 *   - taunt       : always
 *   - gift        : always
 *   - rank-change : prev !== next
 */

interface PsaSuccessBody {
  kind: "psa-success";
  username: string;
  cardId: string;
  grade: number;
}
interface SabotageBody {
  kind: "sabotage";
  username: string;
  victim: string;
  cardId: string;
  success: boolean;
}
interface TauntBody {
  kind: "taunt";
  username: string;
  victim: string;
  message: string;
}
interface GiftBody {
  kind: "gift";
  username: string;
  victim: string;
  cardId: string;
  grade: number;
  price: number;
}
interface RankChangeBody {
  kind: "rank-change";
  username: string;
  metric: "rank" | "power" | "pet";
  prev: number;
  next: number;
}
type Body =
  | PsaSuccessBody
  | SabotageBody
  | TauntBody
  | GiftBody
  | RankChangeBody;

const ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL ??
  "https://pok-mon-card-pack-opening-simulator.vercel.app";

function absoluteImageUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  if (raw.startsWith("http")) return raw;
  return `${ORIGIN}${raw}`;
}

const METRIC_LABEL: Record<RankChangeBody["metric"], string> = {
  rank: "🏆 랭킹 점수",
  power: "⚔️ 전투력",
  pet: "🐾 펫 점수",
};

const METRIC_COLOR: Record<RankChangeBody["metric"], number> = {
  rank: 0xfbbf24,
  power: 0xf43f5e,
  pet: 0xd946ef,
};

export async function POST(request: Request) {
  // Fire-and-forget endpoint — never bubble webhook/upstream errors back to
  // the browser as a non-2xx status. The client doesn't await meaningful
  // results from this; surfacing 502/503 just clutters the browser console
  // and makes Vercel runtime metrics noisier. Log server-side, return 200.
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) {
    return NextResponse.json({ ok: false, skipped: "no-webhook" });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, skipped: "invalid-json" });
  }

  const safeUser = (body.username ?? "익명").slice(0, 24);
  let embed: Record<string, unknown>;
  let content = "";

  if (body.kind === "psa-success") {
    const card = getCard(body.cardId);
    if (!card) {
      return NextResponse.json({ ok: false, skipped: "unknown-card" });
    }
    const grade = Math.floor(body.grade);
    if (grade !== 10) {
      return NextResponse.json({ ok: true, skipped: true });
    }
    content = "@everyone";
    embed = {
      title: `🏆 ${safeUser}님의 PCL 10 GEM MINT!`,
      description: `**${card.name}**\n${SETS[card.setCode].name} · #${card.number}\n등급: **PCL 10** (${PSA_LABEL[10]})`,
      color: 0xfbbf24,
      thumbnail: card.imageUrl
        ? { url: absoluteImageUrl(card.imageUrl) }
        : undefined,
      footer: { text: "카드깡 자동 알림" },
      timestamp: new Date().toISOString(),
    };
  } else if (body.kind === "sabotage") {
    if (!body.success) {
      return NextResponse.json({ ok: true, skipped: true });
    }
    const card = getCard(body.cardId);
    if (!card) {
      return NextResponse.json({ ok: false, skipped: "unknown-card" });
    }
    const victim = (body.victim ?? "익명").slice(0, 24);
    content = "@here";
    embed = {
      title: `💥 ${safeUser}님이 ${victim}님의 ${card.rarity} 카드를 부쉈어요!`,
      description: `**${card.name}**\n${SETS[card.setCode].name} · #${card.number}\n등급: **${card.rarity}**\n공격자: ${safeUser} · 센터 주인: ${victim}`,
      color: 0xdc2626,
      thumbnail: card.imageUrl
        ? { url: absoluteImageUrl(card.imageUrl) }
        : undefined,
      footer: { text: "포켓몬센터 부수기 알림" },
      timestamp: new Date().toISOString(),
    };
  } else if (body.kind === "taunt") {
    const victim = (body.victim ?? "익명").slice(0, 24);
    const msg = (body.message ?? "").toString().slice(0, 200);
    embed = {
      title: `🔥 ${safeUser}님이 ${victim}님을 조롱했어요`,
      description: msg ? `> ${msg}` : "(메시지 없음)",
      color: 0xf97316,
      footer: { text: "조롱 알림" },
      timestamp: new Date().toISOString(),
    };
  } else if (body.kind === "gift") {
    const card = getCard(body.cardId);
    const victim = (body.victim ?? "익명").slice(0, 24);
    const grade = Math.floor(body.grade);
    const price = Math.max(0, Math.floor(body.price));
    embed = {
      title: `🎁 ${safeUser}님이 ${victim}님에게 슬랩을 선물했어요`,
      description: card
        ? `**${card.name}** (PCL ${grade})\n${SETS[card.setCode].name} · #${card.number}\n받는 사람 부담: **${price.toLocaleString("ko-KR")}p**`
        : `슬랩 PCL ${grade} · 받는 사람 부담: **${price.toLocaleString("ko-KR")}p**`,
      color: 0xfbbf24,
      thumbnail:
        card && card.imageUrl
          ? { url: absoluteImageUrl(card.imageUrl) }
          : undefined,
      footer: { text: "선물 알림" },
      timestamp: new Date().toISOString(),
    };
  } else if (body.kind === "rank-change") {
    const prev = Math.max(0, Math.floor(body.prev));
    const next = Math.max(0, Math.floor(body.next));
    if (prev === next) {
      return NextResponse.json({ ok: true, skipped: true });
    }
    const direction = next < prev ? "📈 상승" : "📉 하락";
    const arrow = next < prev ? "↑" : "↓";
    const label = METRIC_LABEL[body.metric] ?? body.metric;
    embed = {
      title: `${direction} ${safeUser}님의 ${label} 순위 변동`,
      description: `**${prev}위 → ${next}위** (${arrow}${Math.abs(prev - next)})`,
      color: METRIC_COLOR[body.metric] ?? 0x71717a,
      footer: { text: "랭킹 변동 알림" },
      timestamp: new Date().toISOString(),
    };
  } else {
    return NextResponse.json({ ok: false, skipped: "unknown-kind" });
  }

  const payload: Record<string, unknown> = { embeds: [embed] };
  if (content) {
    payload.content = content;
    payload.allowed_mentions = { parse: ["everyone"] };
  }

  try {
    const discordRes = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!discordRes.ok) {
      // Log upstream error for ops, but return 200 so the browser doesn't
      // surface this as a fetch failure. Discord 4xx (e.g. expired webhook)
      // and 5xx are out of the user's hands.
      const text = await discordRes.text().catch(() => "");
      console.warn(
        `Discord webhook ${discordRes.status}: ${text.slice(0, 200)}`
      );
      return NextResponse.json({
        ok: false,
        skipped: `discord-${discordRes.status}`,
      });
    }
  } catch (err) {
    console.warn("Discord webhook fetch failed", err);
    return NextResponse.json({ ok: false, skipped: "fetch-failed" });
  }

  return NextResponse.json({ ok: true });
}
