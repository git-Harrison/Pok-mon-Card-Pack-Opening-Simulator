import type { NextConfig } from "next";

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
};

export default nextConfig;
