import type { Network } from "./config";

/**
 * Browser-side check of the key pasted into Create inbox 2 (FR-11, BR-13, NFR-3, rules §1.7).
 * Anything that could spend is refused here, before any request, and again by the server.
 * The server does the full decode. This is a prefix and shape check only (api-contract §4.2).
 */
export type KeyCheck =
  | { kind: "ufvk" }
  | { kind: "spend" }
  | { kind: "wrong_network" }
  | { kind: "not_unified" }
  | { kind: "invalid" };

const UFVK_PREFIX: Record<Network, string> = { test: "uviewtest1", main: "uview1" };

const SPEND_PATTERNS = [
  /^secret-extended-key-(main|test)1/i, // Sapling extended spending key
  /^uspend/i,
  /^usk/i,
  /^[5KLc9][1-9A-HJ-NP-Za-km-z]{50,51}$/, // transparent WIF private keys
  /^xprv|^tprv/i, // BIP 32 extended private keys
];

/** A pasted seed phrase: 12 to 24 lowercase words. */
const SEED_PHRASE = /^([a-z]+\s+){11,23}[a-z]+$/;

export function checkViewingKey(input: string, network: Network): KeyCheck {
  const key = input.trim();
  if (!key) return { kind: "invalid" };
  if (SEED_PHRASE.test(key) || SPEND_PATTERNS.some((p) => p.test(key))) return { kind: "spend" };
  const other: Network = network === "test" ? "main" : "test";
  if (key.startsWith(UFVK_PREFIX[network])) {
    return /^[a-z0-9]+$/.test(key) && key.length > 60 ? { kind: "ufvk" } : { kind: "invalid" };
  }
  if (key.startsWith(UFVK_PREFIX[other])) return { kind: "wrong_network" };
  if (/^zxview(s|testsapling)/.test(key) || /^uivk/.test(key)) return { kind: "not_unified" };
  return { kind: "invalid" };
}

export const UFVK_HINT_PREFIX = UFVK_PREFIX;
