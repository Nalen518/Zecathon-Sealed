import { fromBase64Url, toBase64Url } from "./bytes";
import { formatZec } from "./format";
import { MEMO_BYTES } from "./memo";

/**
 * ZIP 321 payment link (FR-4, SRD §3, rules §3.2):
 *   zcash:ADDRESS?amount=0.001&memo=BASE64URL
 * The memo is the text memo without trailing zero bytes, base64url without padding.
 * No req- parameter, ever: an unknown required parameter invalidates the whole request.
 */

export interface PaymentRequest {
  address: string;
  amountZat: number;
  memoBytes: Uint8Array;
}

const TRANSPARENT = /^(t1|t3|tm|t2|tex1|textest1)/;

function trimZeros(bytes: Uint8Array): Uint8Array {
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end--;
  return bytes.subarray(0, end);
}

export function buildPaymentUri({ address, amountZat, memoBytes }: PaymentRequest): string {
  if (TRANSPARENT.test(address)) throw new Error("A memo needs a shielded address");
  if (!/^[a-z0-9]+$/.test(address)) throw new Error("Address has characters a Zcash address cannot have");
  if (memoBytes.length > MEMO_BYTES) throw new Error("Memo is over 512 bytes");
  const memo = toBase64Url(trimZeros(memoBytes));
  return `zcash:${address}?amount=${formatZec(amountZat)}&memo=${memo}`;
}

export interface ParsedPaymentUri {
  address: string;
  amount: string;
  memo: Uint8Array;
  /** Every parameter name, for checks such as "no req- parameter". */
  params: string[];
}

/**
 * Strict parser for the single-payment form this app builds. Used by tests (T-2) to check
 * every link against the ZIP 321 grammar, until BR-9 validates them with the zip321 crate.
 */
export function parsePaymentUri(uri: string): ParsedPaymentUri {
  const m = /^zcash:([a-z0-9]+)\?(.*)$/.exec(uri);
  if (!m) throw new Error("Not a zcash: URI with an address and parameters");
  const address = m[1]!;
  const params: string[] = [];
  let amount = "";
  let memo: Uint8Array | null = null;
  for (const pair of m[2]!.split("&")) {
    const eq = pair.indexOf("=");
    if (eq <= 0) throw new Error(`Bad parameter: ${pair}`);
    const name = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    if (params.includes(name)) throw new Error(`Duplicate parameter: ${name}`);
    params.push(name);
    if (name.startsWith("req-")) throw new Error(`Unknown required parameter: ${name}`);
    if (name === "amount") {
      if (!/^(0|[1-9][0-9]{0,7})(\.[0-9]{1,8})?$/.test(value)) throw new Error(`Bad amount: ${value}`);
      amount = value;
    } else if (name === "memo") {
      memo = fromBase64Url(value);
      if (!memo) throw new Error("Memo is not base64url");
      if (memo.length > MEMO_BYTES) throw new Error("Memo is over 512 bytes");
    }
  }
  if (!amount) throw new Error("Missing amount");
  if (!memo) throw new Error("Missing memo");
  if (TRANSPARENT.test(address)) throw new Error("Memo on a transparent address");
  return { address, amount, memo, params };
}
