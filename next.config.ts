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
