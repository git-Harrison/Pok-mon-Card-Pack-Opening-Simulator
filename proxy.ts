import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ALLOWED_COUNTRY = "KR";

/**
 * Geo-block: only allow visitors whose Vercel-resolved IP country is KR.
 *
 * Header source: `x-vercel-ip-country` is set by Vercel's edge network on
 * production traffic. On local dev or non-Vercel hosts the header is absent,
 * so we fail open in development. In production, missing header → block
 * (treats unknown origins as foreign).
 */
export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV === "development") {
    return NextResponse.next();
  }

  const country = request.headers.get("x-vercel-ip-country")?.toUpperCase();

  // Production but no header (preview/edge case) — fail open so we don't
  // accidentally lock ourselves out during a Vercel rollout.
  if (!country) return NextResponse.next();

  if (country !== ALLOWED_COUNTRY) {
    const url = request.nextUrl.clone();
    url.pathname = "/access-blocked";
    url.search = "";
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next internals, static assets, favicon, and the block page itself
    "/((?!_next/static|_next/image|favicon\\.ico|access-blocked|images/).*)",
  ],
};
