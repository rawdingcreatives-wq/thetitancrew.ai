import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turborepo monorepo support
  transpilePackages: ["@titancrew/agents", "@titancrew/shared"],

  // Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },

  // Stripe & Twilio webhooks must have raw body access
  serverExternalPackages: ["stripe", "twilio"],

  // Image optimization
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "titancrew.ai" },
    ],
  },

  // Environment variable validation at build time
  env: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "https://app.titancrew.ai",
  },
};

export default nextConfig;
