// Single source for the CSP and security headers (rules.md §1.3, api-contract.md §3).
// Used by gen-vercel.mjs (production headers) and vite.config.ts (preview server),
// so the CSP tested locally is byte for byte the one Vercel sends.

/** Origin of the Inbox API from `api_base_url`, or null when no backend is configured yet. */
export function apiOrigin(config) {
  const base = config.api_base_url;
  if (!base) return null;
  const url = new URL(base);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !local) {
    throw new Error(`api_base_url must use https: ${base}`);
  }
  return url.origin;
}

export function contentSecurityPolicy(config) {
  const origin = apiOrigin(config);
  return [
    "default-src 'none'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self'",
    "font-src 'self'",
    "img-src 'self' data:",
    `connect-src 'self'${origin ? ` ${origin}` : ""}`,
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** Headers for every response. */
export function securityHeaders(config) {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(config) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "no-referrer" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    },
  ];
}

/** Extra headers for HTML documents: never cached (NFR-4). */
export const documentHeaders = [
  { key: "Cache-Control", value: "no-store" },
  { key: "Pragma", value: "no-cache" },
];
