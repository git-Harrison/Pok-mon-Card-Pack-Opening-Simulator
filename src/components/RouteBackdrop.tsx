"use client";

/**
 * RouteBackdrop — mounts the appropriate <PageBackdrop> based on the
 * current pathname, rendered inside the global <main> element so the
 * backdrop visually belongs to the page chrome rather than each view's
 * inner container.
 *
 * Routes that already ship their own page-specific scenery (HomeView's
 * BackgroundFx, CenterView's CenterBackdrop, GradingView's LabScene,
 * WildView's per-encounter biome) intentionally return null so we don't
 * stack two competing backdrops.
 */

import { usePathname } from "next/navigation";
import { useMemo } from "react";
import PageBackdrop, { type BackdropTone } from "./PageBackdrop";

const SHOWDOWN = "https://play.pokemonshowdown.com/sprites/gen6bgs/";

interface RouteSpec {
  tone: BackdropTone | null;
  image: string | null;
  /** Tailwind classes for the dark overlay tint above the image. */
  overlay: string;
}

const ROUTE_MAP: Record<string, RouteSpec | null> = {
  wallet: {
    tone: "amber",
    image: `${SHOWDOWN}bg-orascave.png`,
    overlay:
      "bg-gradient-to-b from-zinc-950/70 via-zinc-950/80 to-zinc-950/95",
  },
  pokedex: {
    tone: "parchment",
    image: `${SHOWDOWN}bg-darkbeach.png`,
    overlay:
      "bg-gradient-to-b from-zinc-950/65 via-zinc-950/80 to-zinc-950/95",
  },
  users: {
    tone: "stadium",
    image: `${SHOWDOWN}bg-elite.png`,
    overlay:
      "bg-gradient-to-b from-zinc-950/70 via-zinc-950/85 to-zinc-950/95",
  },
  profile: {
    tone: "sky",
    image: `${SHOWDOWN}bg-skycity.png`,
    overlay:
      "bg-gradient-to-b from-zinc-950/55 via-zinc-950/75 to-zinc-950/95",
  },
  admin: {
    tone: "admin",
    image: `${SHOWDOWN}bg-volcanocave.png`,
    overlay:
      "bg-gradient-to-b from-zinc-950/75 via-zinc-950/85 to-zinc-950/95",
  },
  gifts: {
    tone: "amber",
    image: `${SHOWDOWN}bg-meadow.png`,
    overlay:
      "bg-gradient-to-b from-zinc-950/70 via-zinc-950/80 to-zinc-950/95",
  },
  // Pages that own their full-screen scenery internally.
  "": null, // home
  center: null,
  grading: null,
  wild: null,
  card: null,
  set: null,
  "access-blocked": null,
  login: null,
  signup: null,
};

export default function RouteBackdrop() {
  const pathname = usePathname();
  const spec = useMemo<RouteSpec | null>(() => {
    const seg = pathname?.split("/")[1] ?? "";
    if (seg in ROUTE_MAP) return ROUTE_MAP[seg];
    return {
      tone: "sky",
      image: `${SHOWDOWN}bg-meadow.png`,
      overlay:
        "bg-gradient-to-b from-zinc-950/65 via-zinc-950/80 to-zinc-950/95",
    };
  }, [pathname]);

  if (!spec) return null;
  return (
    <>
      {spec.image && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-20 overflow-hidden"
        >
          <img
            src={spec.image}
            alt=""
            draggable={false}
            // Pre-decode off the main thread so backdrop swaps don't block
            // first paint when navigating between routes. `loading="eager"`
            // keeps the image in the initial fetch wave (it's the only
            // visual chrome behind the page) while `decoding="async"` and
            // `fetchPriority="low"` ensure it doesn't compete with content
            // paint on slower devices.
            loading="eager"
            decoding="async"
            fetchPriority="low"
            className="absolute inset-0 w-full h-full object-cover opacity-40 select-none pointer-events-none"
            style={{ imageRendering: "pixelated" }}
          />
          <div
            aria-hidden
            className={`absolute inset-0 ${spec.overlay}`}
          />
        </div>
      )}
      {spec.tone && <PageBackdrop tone={spec.tone} />}
    </>
  );
}
