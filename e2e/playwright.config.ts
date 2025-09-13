import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  use: {
    headless: true,
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
  },
  reporter: [["list"], ["junit", { outputFile: "junit.xml" }]],
});

