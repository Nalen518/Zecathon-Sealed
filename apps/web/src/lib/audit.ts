/**
 * Audit trail hash chain (FR-20, api-contract §5.6 and §6.10, D-55, D-59).
 *   hash      = lower_hex( BLAKE2b-256( UTF-8( JCS( entry without "hash" ) ) ) )
 *   prev_hash = hash of the entry with seq - 1, 64 zeros for seq 1
 * Entries are hashed exactly as received (raw JSON objects), never a parsed or renamed copy.
 * Runs in the browser only. Nothing here touches the network.
 */
import { ApiError, originOnly } from "./api";
import { sodiumReady } from "./sodium";

export const GENESIS_HASH = "0".repeat(64);

export class CanonicalError extends Error {
  constructor(readonly path: string) {
    super(`Value outside the canonical form rules at ${path}`);
    this.name = "CanonicalError";
  }
}

const KEY = /^[a-z_]+$/;
// A lone surrogate: a high surrogate not followed by a low one, or a low one with no high one before it.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
// Control characters U+0000 to U+001F, refused by the canonical form rules.
const CONTROL = /[\u0000-\u001F]/;

/**
 * RFC 8785 canonical JSON for the contract's subset (§5.6): null, booleans, integers from 0 to
 * 2^53 - 1, valid Unicode strings without control characters, arrays, and objects with ASCII
 * [a-z_] keys. Inside that subset JSON.stringify of a string and the default key sort are exactly
 * what RFC 8785 requires, so the output matches Rust's serde_json_canonicalizer byte for byte.
 * Anything outside the subset throws instead of guessing.
 */
export function canonicalize(value: unknown, path = "$"): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) throw new CanonicalError(path);
    return String(value);
  }
  if (typeof value === "string") {
    if (LONE_SURROGATE.test(value) || CONTROL.test(value)) throw new CanonicalError(path);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((v, i) => canonicalize(v, `${path}[${i}]`)).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    const parts = keys.map((k) => {
      if (!KEY.test(k)) throw new CanonicalError(`${path}.${k}`);
      return `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k], `${path}.${k}`)}`;
    });
    return `{${parts.join(",")}}`;
  }
  throw new CanonicalError(path);
}

/** Hash of one raw entry, over every field except "hash". */
export async function entryHash(raw: Record<string, unknown>): Promise<string> {
  const sodium = await sodiumReady();
  const { hash: _ignored, ...body } = raw;
  const bytes = new TextEncoder().encode(canonicalize(body));
  return sodium.to_hex(sodium.crypto_generichash(32, bytes, null));
}

export type BreakReason = "hash" | "link" | "gap" | "form";

export type ChainResult =
  | { verified: true; latestHash: string | null; count: number }
  | { verified: false; brokenAt: number; reason: BreakReason; latestHash: string | null; count: number };

const AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const HEX64 = /^[0-9a-f]{64}$/;
const ACTORS = new Set(["setup", "desk", "watcher"]);

/** Contract §5.6 event types and their exact `details` fields. A type not listed here is checked for form only. */
export const EVENT_FIELDS: Record<string, readonly string[]> = {
  inbox_created: ["birthday_height", "fingerprint", "network", "tip_floor_zat"],
  token_issued: ["rotated", "token_id"],
  floor_changed: ["from_zat", "to_zat"],
  tip_received: ["amount_zat", "format_ok", "height", "output_index", "tip_id", "txid"],
  tip_confirmed: ["confirmations", "tip_id", "txid"],
  tip_orphaned: ["height", "tip_id", "txid"],
  source_down: ["origin"],
  source_up: ["origin"],
};

/** The canonical form rules of §5.6 that a hash alone cannot prove. */
function formOk(raw: Record<string, unknown>): boolean {
  try {
    canonicalize(raw);
  } catch {
    return false;
  }
  const { seq, at, type, actor, details, prev_hash, hash } = raw;
  if (typeof seq !== "number" || typeof at !== "string" || !AT.test(at)) return false;
  if (typeof type !== "string" || typeof actor !== "string" || !ACTORS.has(actor)) return false;
  if (typeof prev_hash !== "string" || !HEX64.test(prev_hash) || typeof hash !== "string" || !HEX64.test(hash)) return false;
  if (typeof details !== "object" || details === null || Array.isArray(details)) return false;
  const d = details as Record<string, unknown>;
  const expected = EVENT_FIELDS[type];
  if (expected) {
    const keys = Object.keys(d).sort();
    if (keys.length !== expected.length || keys.some((k, i) => k !== expected[i])) return false;
    if (Object.values(d).some((v) => v === null)) return false;
  }
  if (type === "source_down" || type === "source_up") {
    try {
      originOnly(String(d.origin), "audit.details.origin");
    } catch (e) {
      if (e instanceof ApiError) return false;
      throw e;
    }
  }
  return true;
}

/**
 * Check the whole chain from seq 1 (§5.6). The first entry that breaks a form rule, whose hash does
 * not match its contents, whose prev_hash does not equal the previous hash, or whose seq leaves a
 * gap is reported. Entries must be in seq ascending order, as the API returns them.
 */
export async function verifyChain(raw: Record<string, unknown>[]): Promise<ChainResult> {
  let prev = GENESIS_HASH;
  const latest = raw.length ? (typeof raw[raw.length - 1]!.hash === "string" ? (raw[raw.length - 1]!.hash as string) : null) : null;
  const count = raw.length;
  for (let i = 0; i < raw.length; i++) {
    const e = raw[i]!;
    const seq = typeof e.seq === "number" ? e.seq : i + 1;
    const fail = (reason: BreakReason): ChainResult => ({ verified: false, brokenAt: seq, reason, latestHash: latest, count });
    if (!formOk(e)) return fail("form");
    if (e.seq !== i + 1) return fail("gap");
    if (e.prev_hash !== prev) return fail("link");
    if ((await entryHash(e)) !== e.hash) return fail("hash");
    prev = e.hash as string;
  }
  return { verified: true, latestHash: latest, count };
}

/** Browser-side export (§6.10): raw entries plus the check result, named by inbox and UTC date. */
export function exportAudit(
  inboxId: string,
  raw: Record<string, unknown>[],
  result: ChainResult,
  now = new Date(),
): { filename: string; json: string } {
  const iso = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  const body = {
    inbox_id: inboxId,
    exported_at: iso,
    verified: result.verified,
    broken_at: result.verified ? null : result.brokenAt,
    entries: raw,
  };
  return { filename: `sealed-audit-${inboxId}-${iso.slice(0, 10)}.json`, json: `${JSON.stringify(body, null, 2)}\n` };
}
