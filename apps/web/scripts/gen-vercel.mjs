// Writes vercel.json from sealed.config.json (decision P-07, D-36).
// Vercel reads vercel.json before the build runs, so the file is generated here and committed.
//   node scripts/gen-vercel.mjs          write vercel.json
//   node scripts/gen-vercel.mjs --check  fail if vercel.json is out of date (runs in `pnpm build`)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { securityHeaders, documentHeaders } from "./security-headers.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(join(root, "sealed.config.json"), "utf8"));
const target = join(root, "vercel.json");

const vercel = {
  $schema: "https://openapi.vercel.sh/vercel.json",
  framework: null,
  installCommand: "pnpm install --frozen-lockfile",
  buildCommand: "pnpm build",
  outputDirectory: "dist",
  cleanUrls: true,
  trailingSlash: false,
  // With cleanUrls, /index.html itself redirects to /, so app routes must rewrite to "/" or Vercel answers 404.
  rewrites: [{ source: "/((?!assets/|fonts/).*)", destination: "/" }],
  headers: [
    { source: "/(.*)", headers: securityHeaders(config) },
    { source: "/((?!assets/|fonts/).*)", headers: documentHeaders },
  ],
};

const text = `${JSON.stringify(vercel, null, 2)}\n`;

if (process.argv.includes("--check")) {
  const current = existsSync(target) ? readFileSync(target, "utf8").replace(/\r\n/g, "\n") : "";
  if (current !== text) {
    console.error("vercel.json is out of date with sealed.config.json. Run: pnpm gen:vercel");
    process.exit(1);
  }
} else {
  writeFileSync(target, text);
  console.log("Wrote vercel.json");
}
