/** @type {import('next').NextConfig} */
const nextConfig = {
    transpilePackages: ["@titancrew/agents", "@titancrew/shared"],
    // TODO: Remove these suppressions once @ts-nocheck is removed from all files
    // and TypeScript/ESLint errors are properly resolved across the codebase.
    typescript: {
          ignoreBuildErrors: true,
    },
    eslint: {
          ignoreDuringBuilds: true,
    },
    async headers() {
          return [
            {
                      source: "/(.*)",
                      headers: [
                        { key: "X-Frame-Options", value: "DENY" },
                        { key: "X-Content-Type-Options", value: "nosniff" },
                        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
                        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
                                ],
            },
                ];
    },
    serverExternalPackages: ["stripe", "twilio"],
    images: {
          remotePatterns: [
            { protocol: "https", hostname: "**.supabase.co" },
            { protocol: "https", hostname: "titancrew.ai" },
                ],
    },
    env: {
          NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "https://thetitancrew-bfzoq9i6e-stephen-rawding.vercel.app",
    },
};
export default nextConfig;
