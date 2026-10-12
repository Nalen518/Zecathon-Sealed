import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
// @ts-expect-error The header helpers are plain ESM shared with scripts/gen-vercel.mjs and have no types.
import { documentHeaders, securityHeaders } from "./scripts/security-headers.mjs";

type Header = { key: string; value: string };

const config = JSON.parse(readFileSync(new URL("./sealed.config.json", import.meta.url), "utf8"));
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
  define: {
    __SEALED_BUILD__: JSON.stringify(buildCommit()),
    __SEALED_VERSION__: JSON.stringify(pkg.version.split(".").slice(0, 2).join(".")),
  },
  build: {
    target: "es2022",
    sourcemap: false,
    // No data: URIs for fonts or scripts: everything is served as a file from our own origin.
    assetsInlineLimit: 0,
  },
  preview: {
    headers: previewHeaders,
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
