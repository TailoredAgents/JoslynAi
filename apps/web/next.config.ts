import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Use Webpack for production builds to avoid Turbopack UTF-8 strictness
};

export default nextConfig;
