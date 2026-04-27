import { NextResponse } from "next/server";

// 새 배포 감지용. 매 deploy 마다 Vercel 이 VERCEL_GIT_COMMIT_SHA 를
// 새로 주입하므로, 클라가 들고 있는 BUILD_ID 와 다르면 새 deploy.
// no-store 로 항상 최신 값을 받도록.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const buildId =
    process.env.NEXT_PUBLIC_BUILD_ID ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    "dev";
  return NextResponse.json(
    { buildId },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
