import { NextResponse } from "next/server";

// 새 배포 감지용. next.config.ts 가 build 시점에 BUILD_ID 를 산출
// 해 NEXT_PUBLIC_BUILD_ID 로 주입. 클라 번들에는 build 시점 값이
// 동결되고, 이 라우트는 runtime 에 같은 env 를 읽어 응답.
// 두 값이 다르면 새 deploy → 클라가 stale.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  // Fallback chain 은 next.config.ts 와 동일 — 어떤 환경에서든
  // 0 충돌 보장 (Date.now() 가 ultimate fallback).
  const buildId =
    process.env.NEXT_PUBLIC_BUILD_ID ??
    process.env.VERCEL_DEPLOYMENT_ID ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    "runtime-no-build-id";
  return NextResponse.json(
    { buildId },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
