import { NextResponse } from "next/server";
import { getCard } from "@/lib/sets";

/**
 * Proxy the card's source image (Pokellector CDN) through our own origin
 * so the browser can convert it into a File object without tripping CORS.
 * Used by the "카드 공유하기" button on the /card/[id] page (CardActions
 * island) to attach the real card image to navigator.share({ files }).
 *
 * Also reused by the OG image response so link previews in Discord /
 * iMessage / KakaoTalk show the card art directly.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const card = getCard(decodeURIComponent(id));
  if (!card || !card.imageUrl) {
    return new NextResponse("Not found", { status: 404 });
  }
  let upstream: Response;
  try {
    upstream = await fetch(card.imageUrl, {
      // Pokellector 403s without a browser-ish UA.
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PokemonTCGSim/1.0)" },
      // Next 16 edge caches for us; 24h is fine for public card art.
      next: { revalidate: 86400 },
    });
  } catch {
    return new NextResponse("Upstream fetch failed", { status: 502 });
  }
  if (!upstream.ok) {
    return new NextResponse(`Upstream ${upstream.status}`, {
      status: 502,
    });
  }
  const buf = await upstream.arrayBuffer();
  const contentType = upstream.headers.get("content-type") ?? "image/png";
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, s-maxage=604800",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
