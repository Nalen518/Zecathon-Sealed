import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests run against the production build served by `vite preview`, which sends the
 * same CSP and security headers as Vercel (scripts/security-headers.mjs).
 * PW_CHANNEL picks an installed browser (for example "msedge") when the bundled one is not installed.
 */
const channel = process.env.PW_CHANNEL;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4173",
    ...(channel ? { channel } : {}),
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "narrow", use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 780 } } },
  ],
  webServer: {
    command: "pnpm build && pnpm preview",
    url: "http://localhost:4173",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
