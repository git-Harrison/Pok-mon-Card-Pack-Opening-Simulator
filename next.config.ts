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

const nextConfig: NextConfig = {
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
