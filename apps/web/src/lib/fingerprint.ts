import { sodiumReady } from "./sodium";

/**
 * Desk key fingerprint (api-contract §4.3, D-24):
 * upper_hex(BLAKE2b-256(desk_public_key_bytes))[0..16]
 */
export async function fingerprintOf(publicKey: Uint8Array): Promise<string> {
  const sodium = await sodiumReady();
  const hash = sodium.crypto_generichash(32, publicKey, null);
  return sodium.to_hex(hash).toUpperCase().slice(0, 16);
}

/** "3F9AC21E8B0277AD" -> "3F9A C21E 8B02 77AD". Spaces are display only. */
export function formatFingerprint(fingerprint: string): string {
  return fingerprint.replace(/(.{4})(?=.)/g, "$1 ");
}
