"use client";

/**
 * RouteBackdrop — fixed full-viewport scenery for routes that don't ship
 * their own page-level scene (HomeView, WildView, GradingView, CenterView
 * each render their own immersive backdrops).
 *
 * Why we render via inline CSS background-image instead of an <img>:
 *   1) The CSS layer paints with the first style flush, so the backdrop is
 *      visible on the very first paint — no client-hydration delay or
 *      "white frame" before the image decodes.
 *   2) We can stack TWO background-images in the same paint pass: a vivid
 *      multi-stop gradient as the always-visible base, and the Pokémon
 *      Showdown gen6bgs PNG on top. If the network image 404s or is blocked,
 *      the gradient still fills the screen with a route-themed scene.
 *   3) We avoid the `negative z-index → behind body's <html>/<body>
 *      gradient → invisible` trap that the old <img className="-z-20"/>
 *      version fell into.
 *
 * Routes that own their full-screen scenery internally (home, wild, center,
 * grading, set, card, login, signup, access-blocked) return null so we
 * don't double-stack competing scenes.
 */

import { usePathname } from "next/navigation";
import { useMemo } from "react";
import PageBackdrop, { type BackdropTone } from "./PageBackdrop";

// Pokémon Showdown gen6bgs — we only use filenames that WildView has been
// rendering successfully in production for months, so we know they 200.
const SHOWDOWN = "https://play.pokemonshowdown.com/sprites/gen6bgs/";

interface RouteSpec {
  /** Optional theme passed to the aurora-blob <PageBackdrop> layer. */
  tone: BackdropTone | null;
  /** Pokémon Showdown bg filename (must be a known-200 file). */
  imageFile: string | null;
  /**
   * Multi-stop gradient that ALWAYS paints, even before/instead of the
   * Showdown image. Uses route-distinctive colors so each page is
   * visually identifiable from any other.
   */
  gradient: string;
  /** Vertical bottom-fade tint so text near footer stays legible. */
  bottomFade: string;
}

/** Same biome PNGs WildView uses — verified to load. */
const ROUTE_MAP: Record<string, RouteSpec | null> = {
  // 지갑 — 황금 보물창고
  wallet: {
    tone: "amber",
    imageFile: "bg-darkbeach.png",
    gradient:
      "radial-gradient(120% 80% at 20% -10%, rgba(251,191,36,0.55) 0%, rgba(180,83,9,0.35) 35%, rgba(20,12,4,0.92) 75%), linear-gradient(180deg, #1a1208 0%, #0c0804 100%)",
    bottomFade:
      "linear-gradient(180deg, transparent 55%, rgba(6,4,2,0.55) 100%)",
  },
  // 도감 — 양피지 도서관
  pokedex: {
    tone: "parchment",
    imageFile: "bg-darkforest.png",
    gradient:
      "radial-gradient(110% 75% at 80% 0%, rgba(217,119,6,0.42) 0%, rgba(67,20,7,0.38) 40%, rgba(8,6,4,0.92) 80%), linear-gradient(180deg, #1a140a 0%, #0a0805 100%)",
    bottomFade:
      "linear-gradient(180deg, transparent 55%, rgba(8,6,3,0.55) 100%)",
  },
  // 트레이너 — 체육관 / 명예의 전당
  users: {
    tone: "stadium",
    imageFile: "bg-elite.png",
    gradient:
      "radial-gradient(120% 80% at 50% -10%, rgba(244,114,182,0.40) 0%, rgba(99,102,241,0.35) 35%, rgba(8,6,16,0.92) 78%), linear-gradient(180deg, #110a1a 0%, #060410 100%)",
    bottomFade:
      "linear-gradient(180deg, transparent 55%, rgba(4,3,8,0.55) 100%)",
  },
  // 프로필 — 트레이너의 하늘
  profile: {
    tone: "sky",
    imageFile: "bg-tundra.png",
    gradient:
      "radial-gradient(120% 80% at 30% -10%, rgba(56,189,248,0.45) 0%, rgba(99,102,241,0.32) 40%, rgba(6,8,18,0.92) 80%), linear-gradient(180deg, #0a1428 0%, #060812 100%)",
    bottomFade:
      "linear-gradient(180deg, transparent 55%, rgba(4,6,12,0.55) 100%)",
  },
  // 관리자 — 어둠의 화산
  admin: {
    tone: "admin",
    imageFile: "bg-volcanocave.png",
    gradient:
      "radial-gradient(120% 80% at 70% 0%, rgba(244,63,94,0.42) 0%, rgba(127,29,29,0.35) 40%, rgba(10,4,4,0.92) 78%), linear-gradient(180deg, #1a0808 0%, #0a0404 100%)",
    bottomFade:
      "linear-gradient(180deg, transparent 55%, rgba(8,3,3,0.55) 100%)",
  },
  // 선물함 — 따뜻한 보랏빛 황혼
  gifts: {
    tone: "amber",
    imageFile: "bg-meadow.png",
    gradient:
      "radial-gradient(120% 80% at 50% -10%, rgba(251,191,36,0.45) 0%, rgba(190,24,93,0.32) 40%, rgba(10,6,12,0.92) 80%), linear-gradient(180deg, #1a0e1a 0%, #0a0610 100%)",
    bottomFade:
      "linear-gradient(180deg, transparent 55%, rgba(6,4,8,0.55) 100%)",
  },
  // Pages that own their full-screen scenery internally.
  "": null, // home (BackgroundFx)
  center: null, // CenterBackdrop
  grading: null, // LabScene
  wild: null, // per-encounter biome
  card: null, // card detail uses its own panel chrome
  set: null, // set list uses its own header art
  "access-blocked": null,
  login: null,
  signup: null,
};

export default function RouteBackdrop() {
  const pathname = usePathname();
  const spec = useMemo<RouteSpec | null>(() => {
    const seg = pathname?.split("/")[1] ?? "";
    if (seg in ROUTE_MAP) return ROUTE_MAP[seg];
    // Unknown route — fall back to the gifts/meadow look so we never
    // ship a flat black page.
    return ROUTE_MAP.gifts;
  }, [pathname]);

  if (!spec) return null;

  const imgUrl = spec.imageFile ? `${SHOWDOWN}${spec.imageFile}` : null;

  // Layer order top→bottom in CSS background shorthand:
  //   [overlay fade] → [Showdown png] → [route gradient]
  // The Showdown image uses `multiply` blend so it tints the gradient
  // rather than blocking it; if the PNG fails to load, the gradient
  // still shows at full strength.
  const layers: string[] = [];
  layers.push(spec.bottomFade);
  if (imgUrl) layers.push(`url("${imgUrl}")`);
  layers.push(spec.gradient);

  // Matching background-size/repeat/blend lists, one entry per layer.
  const sizes: string[] = [];
  const repeats: string[] = [];
  const blends: string[] = [];
  // bottomFade
  sizes.push("100% 100%");
  repeats.push("no-repeat");
  blends.push("normal");
  // showdown image
  if (imgUrl) {
    sizes.push("cover");
    repeats.push("no-repeat");
    blends.push("soft-light");
  }
  // gradient
  sizes.push("100% 100%");
  repeats.push("no-repeat");
  blends.push("normal");

  return (
    <>
      <div
        aria-hidden
        // -z-20 keeps the backdrop strictly behind page content but still
        // inside main's stacking context (positive enough to sit ABOVE the
        // body's radial-gradient root canvas — verified visually).
        className="pointer-events-none fixed inset-0 -z-20"
        style={{
          backgroundImage: layers.join(", "),
          backgroundSize: sizes.join(", "),
          backgroundRepeat: repeats.join(", "),
          backgroundPosition: "center center",
          backgroundBlendMode: blends.join(", "),
          imageRendering: "pixelated",
        }}
      />
      {spec.tone && <PageBackdrop tone={spec.tone} />}
    </>
  );
}
