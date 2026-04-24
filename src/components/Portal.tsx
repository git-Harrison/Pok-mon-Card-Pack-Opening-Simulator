"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Renders children into `document.body` so modals/overlays escape every
 * parent stacking context (important because several routes nest
 * content inside `relative` / `transform` / backdrop-filter wrappers
 * that would otherwise clip a `fixed` modal or lose the z-index race
 * against the sticky navbar).
 *
 * SSR-safe: renders nothing on the server tick, then mounts on the
 * client after hydration.
 */
export default function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
