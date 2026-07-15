import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  outputFileTracingExcludes: {
    "**/*": [".next/cache/webpack-client-development/", ".next/cache/webpack-server-development/"],
  },
  experimental: {
    serverActions: { allowedOrigins: ["*"] },
  },
  async rewrites() {
    return [
      { source: "/@:username", destination: "/users/:username" },
      { source: "/@:username/:path*", destination: "/users/:username/:path*" },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
