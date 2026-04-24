import type { Metadata } from "next";
import AuthGate from "@/components/AuthGate";
import CardDetailView from "@/components/CardDetailView";
import { getCard } from "@/lib/sets";
import { SETS } from "@/lib/sets";

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
  return (
    <AuthGate>
      <CardDetailView cardId={id} />
    </AuthGate>
  );
}
