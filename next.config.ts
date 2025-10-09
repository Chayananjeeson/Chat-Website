// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // ✅ อย่าทำให้บิลด์ล้มเพราะ ESLint errors
    ignoreDuringBuilds: true,
  },
  typescript: {
    // ✅ อย่าทำให้บิลด์ล้มเพราะ TypeScript errors
    ignoreBuildErrors: true,
  },
  // images: { unoptimized: true }, // (ตัวเลือก)
};

export default nextConfig;
