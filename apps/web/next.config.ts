import type { NextConfig } from "next";

if (process.env.NODE_ENV === "production" && !process.env.API_JWT_SECRET && !process.env.JWT_SECRET) {
  throw new Error("API_JWT_SECRET (or JWT_SECRET) must be set in production to mint API session tokens.");
}

if (process.env.NODE_ENV === "production" && !process.env.EMAIL_SERVER) {
  const requiredSmtp = ["EMAIL_FROM", "SMTP_HOST", "SMTP_USER", "SMTP_PASS"];
  const missing = requiredSmtp.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(
      `SMTP configuration incomplete: set EMAIL_SERVER or provide ${missing.join(", ")} in production.`
    );
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Use Webpack for production builds to avoid Turbopack UTF-8 strictness
};

export default nextConfig;
