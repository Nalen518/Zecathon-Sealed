import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
// @ts-expect-error The header helpers are plain ESM shared with scripts/gen-vercel.mjs and have no types.
import { documentHeaders, securityHeaders } from "./scripts/security-headers.mjs";

type Header = { key: string; value: string };

/**
 * The bundled config. Production always uses sealed.config.json. End-to-end tests point
 * SEALED_CONFIG at a fixture under tests/fixtures so the sender flow has a desk key (rules §2.3).
 */
const configOverride = process.env.SEALED_CONFIG ? resolve(process.env.SEALED_CONFIG) : null;
const configPath = configOverride ?? fileURLToPath(new URL("./sealed.config.json", import.meta.url));
const config = JSON.parse(readFileSync(configPath, "utf8"));
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

/** Short commit of this build, shown on the landing page next to the source link. */
function buildCommit(): string {
  const fromVercel = process.env.VERCEL_GIT_COMMIT_SHA;
  if (fromVercel) return fromVercel.slice(0, 7);
  try {
    return execSync("git rev-parse --short=7 HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const previewHeaders = Object.fromEntries(
  [...(securityHeaders(config) as Header[]), ...(documentHeaders as Header[])].map((h) => [h.key, h.value]),
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: configOverride ? [{ find: /^.*\/sealed\.config\.json$/, replacement: configOverride }] : [],
  },
  define: {
    __SEALED_BUILD__: JSON.stringify(buildCommit()),
    __SEALED_VERSION__: JSON.stringify(pkg.version.split(".").slice(0, 2).join(".")),
  },
  build: {
    outDir: configOverride ? "dist-e2e" : "dist",
    target: "es2022",
    sourcemap: false,
    // Only the Figma icon SVGs are inlined (as data: URIs, allowed by img-src). An icon then never
    // triggers a request after load, so the offline safety check (T-10) makes none. Fonts and
    // scripts stay files on our own origin.
    assetsInlineLimit: (file) => /[\/]components[\/]Icon[\/]svg[\/][^\/]+\.svg$/.test(file),
  },
  preview: {
    headers: previewHeaders,
    port: configOverride ? 4174 : 4173,
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
