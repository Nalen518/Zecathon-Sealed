/**
 * Memo constants and byte helpers (rules.md §3, SRD §3, api-contract §4.4).
 * Every module imports these numbers from here. Never retype them.
 */

/** Zcash memo size (ZIP 302). */
export const MEMO_BYTES = 512;
/** 2-byte big-endian length prefix in the plaintext block. */
export const LENGTH_PREFIX_BYTES = 2;
/** Maximum tip length in UTF-8 bytes (FR-1). */
export const MAX_MESSAGE_BYTES = 331;
/** Plaintext block: length prefix + message, zero padded to this size. */
export const PLAINTEXT_BLOCK_BYTES = LENGTH_PREFIX_BYTES + MAX_MESSAGE_BYTES;
/** crypto_box_seal overhead: 32-byte ephemeral key + 16-byte tag. */
export const SEAL_OVERHEAD_BYTES = 48;
/** Sealed box size: 333 + 48 = 381. */
export const SEALED_BOX_BYTES = PLAINTEXT_BLOCK_BYTES + SEAL_OVERHEAD_BYTES;
/** Text memo prefix. */
export const TEXT_PREFIX = "z1:";
/** "z1:" + standard base64 of the sealed box: 3 + 508 = 511. */
export const SEALED_MEMO_BYTES = TEXT_PREFIX.length + 4 * Math.ceil(SEALED_BOX_BYTES / 3);
/** ZIP 317 fee for a two-action transaction, the lowest possible network fee and the floor minimum (BR-8). */
export const ZIP317_MIN_FEE_ZAT = 10_000;
/** Default tip floor in zatoshis (0.001 ZEC). */
export const DEFAULT_TIP_FLOOR_ZAT = 100_000;

const encoder = new TextEncoder();

/** Real UTF-8 byte length, the same count the sealing code uses (FR-1). */
export const utf8Length = (text: string): number => encoder.encode(text).length;

/**
 * Cut text to at most `maxBytes` UTF-8 bytes without splitting a character
 * (walks by code point, so emoji and accented letters stay whole).
 */
export function truncateToBytes(text: string, maxBytes = MAX_MESSAGE_BYTES): string {
  if (utf8Length(text) <= maxBytes) return text;
  let out = "";
  let used = 0;
  for (const ch of text) {
    const n = utf8Length(ch);
    if (used + n > maxBytes) break;
    out += ch;
    used += n;
  }
  return out;
}
