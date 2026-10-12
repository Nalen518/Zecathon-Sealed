import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests run against a production build served by `vite preview`, which sends the same CSP
 * and security headers as Vercel (scripts/security-headers.mjs). The build uses the test-only
 * config tests/fixtures/sealed.config.e2e.json, so the sender flow has a desk key to seal to.
 * PW_CHANNEL picks an installed browser (for example "msedge") when the bundled one is missing (D-42).
 */
const channel = process.env.PW_CHANNEL;
const PORT = 4174;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...(channel ? { channel } : {}),
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "narrow", use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 780 } } },
  ],
  webServer: {
    command: "vite build && vite preview --strictPort",
    env: { SEALED_CONFIG: "tests/fixtures/sealed.config.e2e.json" },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
