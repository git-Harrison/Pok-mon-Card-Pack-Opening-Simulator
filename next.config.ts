import type { NextConfig } from "next";

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://vercel.live https://*.vercel.live",
  "script-src-elem 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://vercel.live https://*.vercel.live",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://vercel.live https://*.vercel.live https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://cdn.jsdelivr.net https://vercel.live https://*.vercel.live https://fonts.gstatic.com",
  "connect-src 'self' https: wss:",
  "frame-src 'self' https://vercel.live https://*.vercel.live",
  "frame-ancestors 'none'",
].join("; ");

// 새 배포 감지용: 빌드 시 unique BUILD_ID 를 클라이언트 번들에
// NEXT_PUBLIC_BUILD_ID 로 동결. 런타임에는 같은 env 를
// /api/build-id 가 매 요청마다 읽어서 둘이 다르면 모달.
//
// fallback chain:
//   1. 명시적 NEXT_PUBLIC_BUILD_ID (CI 등에서 박은 경우)
//   2. VERCEL_DEPLOYMENT_ID (deploy 마다 변경 보장 — SHA 보다 강력)
//   3. VERCEL_GIT_COMMIT_SHA (same-commit redeploy 시 유지)
//   4. Date.now().toString() — Vercel 환경 아니어도 빌드마다 unique.
//      이전엔 "dev" 로 떨어져 모달이 안 뜨던 이슈 fix.
const BUILD_ID =
  process.env.NEXT_PUBLIC_BUILD_ID ??
  process.env.VERCEL_DEPLOYMENT_ID ??
  process.env.VERCEL_GIT_COMMIT_SHA ??
  Date.now().toString();

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_ID: BUILD_ID,
  },
  experimental: {
    // inlineCss 비활성화 — 매 라우트 HTML 응답에 Tailwind atomic CSS 30~40KB
    // (gzip) 가 인라인되어 모바일 iOS 에서 (a) 매 nav 마다 동일한 CSS 를
    // 다운로드, (b) 인터-페이지 stylesheet 캐시 무효화 (c) iOS Safari 가
    // 큰 <style> 블록을 매번 파싱. "preloaded but not used" 경고는 무해.
    // → 라우트 캐시 회복이 모바일 체감에 훨씬 큰 영향.
    optimizePackageImports: ["framer-motion", "clsx"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "data1.pokemonkorea.co.kr" },
      { protocol: "https", hostname: "cards.image.pokemonkorea.co.kr" },
      { protocol: "https", hostname: "den-cards.pokellector.com" },
      { protocol: "https", hostname: "limitlesstcg.nyc3.cdn.digitaloceanspaces.com" },
      { protocol: "https", hostname: "primary.jwwb.nl" },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
