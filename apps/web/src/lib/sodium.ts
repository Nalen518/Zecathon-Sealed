import type Sodium from "libsodium-wrappers-sumo";

export type SodiumLib = typeof Sodium;

let loading: Promise<SodiumLib> | null = null;

/**
 * libsodium, loaded once and on demand so pages that never seal or open a memo
 * do not download it. The sumo build is needed for crypto_pwhash (Argon2id), D-33.
 */
export function sodiumReady(): Promise<SodiumLib> {
  loading ??= import("libsodium-wrappers-sumo").then(async (mod) => {
    const sodium = mod.default;
    await sodium.ready;
    return sodium;
  });
  return loading;
}
