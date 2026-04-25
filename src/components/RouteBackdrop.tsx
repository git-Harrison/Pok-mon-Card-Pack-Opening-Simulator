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

const ROUTE_TONES: Record<string, BackdropTone | null> = {
  wallet: "amber",
  pokedex: "parchment",
  users: "stadium",
  profile: "sky",
  admin: "admin",
  gifts: "amber",
  // Owned scenery — no PageBackdrop here:
  "": null, // home
  center: null,
  grading: null,
  wild: null,
  card: null,
  "access-blocked": null,
  login: null,
  signup: null,
  set: null,
};

export default function RouteBackdrop() {
  const pathname = usePathname();
  const tone = useMemo<BackdropTone | null>(() => {
    const seg = pathname?.split("/")[1] ?? "";
    if (seg in ROUTE_TONES) return ROUTE_TONES[seg];
    // Default for unknown routes: a neutral tone so something still shows.
    return "sky";
  }, [pathname]);

  if (!tone) return null;
  return <PageBackdrop tone={tone} />;
}
