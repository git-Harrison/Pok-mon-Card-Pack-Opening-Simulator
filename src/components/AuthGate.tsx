"use client";

import { CenteredPokeLoader } from "./PokeLoader";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AuthGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return <CenteredPokeLoader label="잠시만요..." />;
  }
  // Wrap with a CSS fade-in so the swap from loader → page doesn't snap.
  // Using a CSS keyframe (not framer-motion) means the transition happens
  // synchronously on the very first paint after auth resolves, instead of
  // queuing a re-render to start an animation. This avoids the "loader
  // disappears and the page initial={opacity:0} then re-fades" double
  // animation the user perceived as choppy.
  return <div className="fade-in">{children}</div>;
}
