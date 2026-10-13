import { fromBase64, toBase64, wipe } from "./bytes";
import {
  LENGTH_PREFIX_BYTES,
  MAX_MESSAGE_BYTES,
  MEMO_BYTES,
  PLAINTEXT_BLOCK_BYTES,
  SEALED_BOX_BYTES,
  SEALED_MEMO_BYTES,
  TEXT_PREFIX,
} from "./memo";
import { sodiumReady } from "./sodium";

/**
 * Seal and open a tip (SRD §3, api-contract §4.4, FR-2, FR-3, FR-8).
 * Plaintext block: 2-byte big-endian length + UTF-8 message, zero padded to 333 bytes.
 * Sealed with crypto_box_seal (381 bytes), then "z1:" + standard base64 = 511 bytes,
 * zero padded to the 512-byte memo. Nothing here touches the network.
 */

export class TipTooLongError extends Error {
  constructor(bytes: number) {
    super(`Tip is ${bytes} bytes. The limit is ${MAX_MESSAGE_BYTES}.`);
    this.name = "TipTooLongError";
  }
}

export interface SealedTip {
  /** The full 512-byte memo, as it travels on chain. */
  memoBytes: Uint8Array;
  /** The 511-character text memo ("z1:" + base64), for the copy-paste fallback. */
  memoText: string;
}

const encoder = new TextEncoder();
const strictDecoder = new TextDecoder("utf-8", { fatal: true });

function plaintextBlock(text: string): Uint8Array {
  const message = encoder.encode(text);
  if (message.length > MAX_MESSAGE_BYTES) throw new TipTooLongError(message.length);
  const block = new Uint8Array(PLAINTEXT_BLOCK_BYTES);
  block[0] = (message.length >> 8) & 0xff;
  block[1] = message.length & 0xff;
  block.set(message, LENGTH_PREFIX_BYTES);
  wipe(message);
  return block;
}

export async function sealTip(text: string, deskPublicKey: Uint8Array): Promise<SealedTip> {
  const sodium = await sodiumReady();
  const block = plaintextBlock(text);
  try {
    const box = sodium.crypto_box_seal(block, deskPublicKey);
    if (box.length !== SEALED_BOX_BYTES) throw new Error("Unexpected sealed box size");
    const memoText = `${TEXT_PREFIX}${toBase64(box)}`;
    if (memoText.length !== SEALED_MEMO_BYTES) throw new Error("Unexpected memo size");
    const memoBytes = new Uint8Array(MEMO_BYTES);
    memoBytes.set(encoder.encode(memoText));
    return { memoBytes, memoText };
  } finally {
    wipe(block);
  }
}

export type OpenResult = { ok: true; text: string } | { ok: false };

/** Strip trailing zero bytes, as the reader in SRD §3 requires. */
function trimZeros(bytes: Uint8Array): Uint8Array {
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end--;
  return bytes.subarray(0, end);
}

/**
 * Open a memo with the desk keypair. Accepts the raw memo bytes or the pasted text.
 * Any failure returns { ok: false } and the caller shows Unreadable (FR-19). Never throws on bad input.
 */
export async function openMemo(
  memo: Uint8Array | string,
  desk: { publicKey: Uint8Array; privateKey: Uint8Array },
): Promise<OpenResult> {
  const sodium = await sodiumReady();
  const raw = typeof memo === "string" ? encoder.encode(memo.trim()) : memo;
  const bytes = trimZeros(raw);
  if (bytes.length !== SEALED_MEMO_BYTES) return { ok: false };

  let text: string;
  try {
    text = strictDecoder.decode(bytes);
  } catch {
    return { ok: false };
  }
  if (!text.startsWith(TEXT_PREFIX)) return { ok: false };
  const box = fromBase64(text.slice(TEXT_PREFIX.length));
  if (!box || box.length !== SEALED_BOX_BYTES) return { ok: false };

  let block: Uint8Array;
  try {
    block = sodium.crypto_box_seal_open(box, desk.publicKey, desk.privateKey);
  } catch {
    return { ok: false };
  }
  try {
    if (block.length !== PLAINTEXT_BLOCK_BYTES) return { ok: false };
    const length = ((block[0] ?? 0) << 8) | (block[1] ?? 0);
    if (length > MAX_MESSAGE_BYTES) return { ok: false };
    return { ok: true, text: strictDecoder.decode(block.subarray(LENGTH_PREFIX_BYTES, LENGTH_PREFIX_BYTES + length)) };
  } catch {
    return { ok: false };
  } finally {
    wipe(block);
  }
}
