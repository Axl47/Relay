import type { NextConfig } from "next";

const relayApiOrigin = process.env.NEXT_PUBLIC_API_URL?.trim() || "http://localhost:4000";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "commondatastorage.googleapis.com" },
      { protocol: "https", hostname: "test-streams.mux.dev" },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/__relay_api/:path*",
        destination: `${relayApiOrigin}/:path*`,
      },
    ];
  },
};

export default nextConfig;
