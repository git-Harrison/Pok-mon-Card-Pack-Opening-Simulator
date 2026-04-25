import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import AuthGate from "@/components/AuthGate";
import RarityBadge from "@/components/RarityBadge";
import {
  BackButton,
  CardActions,
  CardWalletCount,
} from "@/components/CardDetailIsland";
import { getCard, SETS } from "@/lib/sets";
import { RARITY_LABEL, RARITY_STYLE, cardFxClass } from "@/lib/rarity";
import type { Rarity } from "@/lib/types";

/**
 * /card/[id] is rendered server-side at request time. The card's image,
 * name, set, and rarity all come from the static SETS catalog so the
 * entire card layout (image + meta + rarity badge) is server-rendered
 * HTML; only the wallet count and the share/back buttons need client
 * state, and those live in `<CardDetailIsland>`.
 *
 * We deliberately avoid `generateStaticParams` here because the page
 * tree pulls in `<AuthGate>` (a client component) whose module graph
 * imports `lib/db.ts` → `@/utils/supabase/client`. Build-time
 * prerendering would require the Supabase env vars to be present in the
 * build environment, which they aren't. SSR-on-request still gives us
 * the static-content win without that constraint.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const card = getCard(decodeURIComponent(id));
  if (!card) {
    return { title: "카드 | 포켓몬 카드깡 시뮬레이터" };
  }
  const title = `${card.name} (${card.rarity}) | 포켓몬 카드깡`;
  const description = `${SETS[card.setCode].name} · #${card.number} · ${card.rarity}`;
  // Serve OG previews through our own proxy so chat apps can fetch the
  // card art reliably (Pokellector sometimes 403s non-browser UAs).
  const ogImage = `/api/card-image/${encodeURIComponent(card.id)}`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: ogImage, width: 600, height: 825, alt: card.name }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function CardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cardId = decodeURIComponent(id);
  const card = getCard(cardId);

  return (
    <AuthGate>
      {!card ? (
        <div className="max-w-xl mx-auto px-4 py-10 text-center">
          <p className="text-sm text-zinc-400">카드를 찾을 수 없어요.</p>
          <Link
            href="/wallet"
            className="mt-4 inline-flex h-11 px-5 rounded-xl bg-white/10 text-white font-semibold text-sm hover:bg-white/15"
          >
            지갑으로 돌아가기
          </Link>
        </div>
      ) : (
        <CardBody
          cardId={card.id}
          cardName={card.name}
          cardNumber={card.number}
          cardRarity={card.rarity}
          cardImageUrl={card.imageUrl}
          setName={SETS[card.setCode].name}
        />
      )}
    </AuthGate>
  );
}

/**
 * Server-rendered card layout. Pure static — uses the SETS catalog and
 * tailwind classes; no hooks, no event handlers. The interactive bits
 * are split out into `<CardDetailIsland>`.
 */
function CardBody({
  cardId,
  cardName,
  cardNumber,
  cardRarity,
  cardImageUrl,
  setName,
}: {
  cardId: string;
  cardName: string;
  cardNumber: string;
  cardRarity: Rarity;
  cardImageUrl?: string;
  setName: string;
}) {
  const fx = cardFxClass(cardRarity);
  const style = RARITY_STYLE[cardRarity];

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-4 md:py-8 fade-in">
      {/* Back bar */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <BackButton />
        <Link
          href="/wallet"
          className="text-xs text-zinc-400 hover:text-white"
        >
          지갑으로
        </Link>
      </div>

      <div className="rounded-3xl overflow-hidden border border-white/10 bg-zinc-950/90">
        <div className="grid grid-cols-1 md:grid-cols-5">
          {/* Card image — fully static; the previous framer-motion entrance
              animation is replaced by the existing `fade-in` CSS keyframe
              applied to the page wrapper. */}
          <div className="md:col-span-3 relative p-5 md:p-8 flex items-center justify-center bg-gradient-to-br from-zinc-900 to-black min-h-[320px]">
            {fx && (
              <div
                className="absolute inset-0 opacity-40 pointer-events-none"
                style={{
                  background: `radial-gradient(closest-side, ${
                    cardRarity === "MUR" ? "#f59e0b" : "#c084fc"
                  }55, transparent 70%)`,
                }}
              />
            )}
            <div
              className={clsx(
                "relative rounded-xl overflow-hidden ring-2 bg-zinc-900",
                style.frame,
                style.glow
              )}
              style={{
                width: "min(70vw, 280px)",
                aspectRatio: "5 / 7",
              }}
            >
              {cardImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cardImageUrl}
                  alt={cardName}
                  className="w-full h-full object-contain bg-zinc-900"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-700 to-amber-600 p-4 text-center">
                  <div>
                    <div className="text-xs text-white/60">#{cardNumber}</div>
                    <div className="mt-2 text-white font-bold">{cardName}</div>
                  </div>
                </div>
              )}
              {fx && <div className={fx} />}
            </div>
          </div>

          {/* Meta + actions */}
          <div className="md:col-span-2 p-5 md:p-6 flex flex-col gap-4">
            <div>
              <RarityBadge rarity={cardRarity} size="md" />
              <h1 className="mt-3 text-2xl md:text-3xl font-black text-white leading-tight">
                {cardName}
              </h1>
              <p className="mt-1 text-xs text-zinc-400">
                {setName} · 번호 {cardNumber}
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
                <dt className="text-[10px] uppercase tracking-wider text-zinc-400">
                  등급
                </dt>
                <dd className="mt-0.5 text-sm font-bold text-white">
                  {RARITY_LABEL[cardRarity]}
                </dd>
              </div>
              <CardWalletCount cardId={cardId} />
            </dl>

            <CardActions
              cardId={cardId}
              cardName={cardName}
              cardRarity={cardRarity}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
