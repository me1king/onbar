import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const nextConfig = (phase: string): NextConfig => ({
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
  outputFileTracingRoot: process.cwd(),
  deploymentId: process.env.RENDER_GIT_COMMIT || process.env.VERCEL_DEPLOYMENT_ID || undefined,
  images: {
    unoptimized: process.env.NODE_ENV === 'development', // Prevent timeouts during dev
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
});

export default nextConfig;
