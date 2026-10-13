/**
 * Inbox API client (docs/api-contract.md). The only file that calls fetch (rules §8.5).
 * - snake_case on the wire, camelCase here (§2)
 * - every response is validated before use. A response that does not match the contract is an error
 * - cache: "no-store", credentials: "omit", the token only in Authorization (§3, rules §1.9)
 * - only endpoints, fields and errors listed in the contract
 */
import type { Network } from "./config";

// ---------- Types (api-contract §4, §5) ----------

export interface Inbox {
  id: string;
  name: string;
  network: Network;
  address: string;
  deskPublicKey: string;
  fingerprint: string;
  tipFloorZat: number;
  createdAt: string;
}

export type ChainState = "pending" | "confirmed" | "orphaned";
export type DisplayStatus = "orphaned" | "unreadable" | "below_floor" | "pending" | "confirmed";

export interface Tip {
  id: string;
  seq: number;
  txid: string;
  outputIndex: number;
  height: number | null;
  blockTimeAt: string | null;
  seenAt: string;
  amountZat: number;
  confirmations: number | null;
  chainState: ChainState;
  belowFloor: boolean;
  formatOk: boolean;
  displayStatus: DisplayStatus;
  memoB64: string | null;
}

export interface TipsPage {
  tips: Tip[];
  nextSeq: number;
  hasMore: boolean;
  counts: { visible: number; belowFloor: number };
}

export interface HealthSource {
  /** Scheme, host and port only (C-14). */
  origin: string;
  ok: boolean;
  tipHeight: number | null;
  lagBlocks: number | null;
  lastCheckedAt: string | null;
}

export interface Health {
  network: Network;
  tipHeight: number;
  lagBlocks: number;
  sources: HealthSource[];
  version: string;
}

/**
 * One page of the audit log (§6.10). Entries stay raw JSON objects exactly as received: the hash
 * chain is checked over those bytes (§5.6, D-59), and a malformed entry is reported by the chain
 * check as Broken instead of failing the whole page.
 */
export interface AuditPage {
  entries: Record<string, unknown>[];
  nextSeq: number;
  hasMore: boolean;
  total: number;
}

export interface IssuedToken {
  token: string;
  createdAt: string;
}

export type ErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "inbox_exists"
  | "spend_key_rejected"
  | "network_mismatch"
  | "address_mismatch"
  | "address_not_shielded"
  | "fingerprint_mismatch"
  | "floor_out_of_range"
  | "rate_limited"
  | "watcher_unavailable";

const ERROR_CODES: readonly ErrorCode[] = [
  "invalid_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "inbox_exists",
  "spend_key_rejected",
  "network_mismatch",
  "address_mismatch",
  "address_not_shielded",
  "fingerprint_mismatch",
  "floor_out_of_range",
  "rate_limited",
  "watcher_unavailable",
];

/**
 * Every failure the screens handle. `code` comes from the contract (§5.5), or is one of:
 * "network" (no answer), "bad_response" (answer that breaks the contract), "not_configured" (no api_base_url).
 * The UI picks its text by code and never shows `message` (§5.5).
 */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode | "network" | "bad_response" | "not_configured",
    readonly status: number,
    readonly field?: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

// ---------- Validation ----------

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

class Shape {
  constructor(
    private readonly o: Json,
    private readonly where: string,
  ) {}
  private fail(k: string): never {
    throw new ApiError("bad_response", 0, `${this.where}.${k}`);
  }
  str(k: string): string {
    const v = this.o[k];
    return typeof v === "string" ? v : this.fail(k);
  }
  strOrNull(k: string): string | null {
    const v = this.o[k];
    return v === null ? null : typeof v === "string" ? v : this.fail(k);
  }
  int(k: string): number {
    const v = this.o[k];
    return typeof v === "number" && Number.isSafeInteger(v) ? v : this.fail(k);
  }
  intOrNull(k: string): number | null {
    const v = this.o[k];
    return v === null ? null : typeof v === "number" && Number.isSafeInteger(v) ? v : this.fail(k);
  }
  bool(k: string): boolean {
    const v = this.o[k];
    return typeof v === "boolean" ? v : this.fail(k);
  }
  oneOf<T extends string>(k: string, values: readonly T[]): T {
    const v = this.o[k];
    return typeof v === "string" && (values as readonly string[]).includes(v) ? (v as T) : this.fail(k);
  }
  obj(k: string): Shape {
    const v = this.o[k];
    return isObj(v) ? new Shape(v, `${this.where}.${k}`) : this.fail(k);
  }
  arr(k: string): unknown[] {
    const v = this.o[k];
    return Array.isArray(v) ? v : this.fail(k);
  }
}

function shape(v: unknown, where: string): Shape {
  if (!isObj(v)) throw new ApiError("bad_response", 0, where);
  return new Shape(v, where);
}

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const TXID = /^[0-9a-f]{64}$/;

function time(s: string, where: string): string {
  if (!RFC3339.test(s)) throw new ApiError("bad_response", 0, where);
  return s;
}

export function parseInbox(v: unknown): Inbox {
  const s = shape(v, "inbox");
  return {
    id: s.str("id"),
    name: s.str("name"),
    network: s.oneOf("network", ["test", "main"] as const),
    address: s.str("address"),
    deskPublicKey: s.str("desk_public_key"),
    fingerprint: s.str("fingerprint"),
    tipFloorZat: s.int("tip_floor_zat"),
    createdAt: time(s.str("created_at"), "inbox.created_at"),
  };
}

export function parseTip(v: unknown): Tip {
  const s = shape(v, "tip");
  const txid = s.str("txid");
  if (!TXID.test(txid)) throw new ApiError("bad_response", 0, "tip.txid");
  const blockTimeAt = s.strOrNull("block_time_at");
  return {
    id: s.str("id"),
    seq: s.int("seq"),
    txid,
    outputIndex: s.int("output_index"),
    height: s.intOrNull("height"),
    blockTimeAt: blockTimeAt === null ? null : time(blockTimeAt, "tip.block_time_at"),
    seenAt: time(s.str("seen_at"), "tip.seen_at"),
    amountZat: s.int("amount_zat"),
    confirmations: s.intOrNull("confirmations"),
    chainState: s.oneOf("chain_state", ["pending", "confirmed", "orphaned"] as const),
    belowFloor: s.bool("below_floor"),
    formatOk: s.bool("format_ok"),
    displayStatus: s.oneOf("display_status", ["orphaned", "unreadable", "below_floor", "pending", "confirmed"] as const),
    memoB64: s.strOrNull("memo_b64"),
  };
}

export function parseTipsPage(v: unknown): TipsPage {
  const s = shape(v, "tips_page");
  const counts = s.obj("counts");
  return {
    tips: s.arr("tips").map(parseTip),
    nextSeq: s.int("next_seq"),
    hasMore: s.bool("has_more"),
    counts: { visible: counts.int("visible"), belowFloor: counts.int("below_floor") },
  };
}

/**
 * A chain server is named by its origin only (C-14, §5.6). Anything more (path, query, user name,
 * password) is refused, so a credential in a server URL can never reach the screen or a log.
 */
export function originOnly(value: string, where: string): string {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw new ApiError("bad_response", 0, where);
  }
  // `u.host` drops a default port, so ":443" written out is accepted as well.
  const defaultPort = u.protocol === "https:" ? "443" : "80";
  const exact = [`${u.protocol}//${u.host}`, `${u.protocol}//${u.hostname}:${u.port || defaultPort}`];
  const isHttp = u.protocol === "https:" || u.protocol === "http:";
  if (!isHttp || u.username || u.password || !exact.includes(value)) throw new ApiError("bad_response", 0, where);
  return value;
}

export function parseHealth(v: unknown): Health {
  const s = shape(v, "health");
  return {
    network: s.oneOf("network", ["test", "main"] as const),
    tipHeight: s.int("tip_height"),
    lagBlocks: s.int("lag_blocks"),
    sources: s.arr("sources").map((src, i) => {
      const x = shape(src, `health.sources[${i}]`);
      const checked = x.strOrNull("last_checked_at");
      return {
        origin: originOnly(x.str("origin"), `health.sources[${i}].origin`),
        ok: x.bool("ok"),
        tipHeight: x.intOrNull("tip_height"),
        lagBlocks: x.intOrNull("lag_blocks"),
        lastCheckedAt: checked === null ? null : time(checked, "health.sources.last_checked_at"),
      };
    }),
    version: s.str("version"),
  };
}

export function parseAuditPage(v: unknown): AuditPage {
  const s = shape(v, "audit_page");
  const entries = s.arr("entries").map((e, i) => {
    if (!isObj(e)) throw new ApiError("bad_response", 0, `audit_page.entries[${i}]`);
    return e;
  });
  return { entries, nextSeq: s.int("next_seq"), hasMore: s.bool("has_more"), total: s.int("total") };
}

export function parseToken(v: unknown): IssuedToken {
  const s = shape(v, "token");
  return { token: s.str("token"), createdAt: time(s.str("created_at"), "token.created_at") };
}

export function parseError(v: unknown, status: number, retryAfter: string | null): ApiError {
  try {
    const e = shape(v, "error").obj("error");
    const code = e.oneOf("code", ERROR_CODES);
    const field = (() => {
      try {
        return e.str("field");
      } catch {
        return undefined;
      }
    })();
    const seconds = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : undefined;
    return new ApiError(code, status, field, seconds);
  } catch {
    return new ApiError("bad_response", status);
  }
}

// ---------- Client ----------

export interface CreateInboxRequest {
  id: string;
  name: string;
  deskPublicKey: string;
  fingerprint: string;
  address: string;
  ufvk: string;
  tipFloorZat: number;
  birthdayHeight?: number;
}

export type TipFilter = "visible" | "below_floor" | "all";

/** Desk token or setup secret. Kept in memory by the caller, only ever sent as a header. */
export interface Auth {
  token?: string;
  setupSecret?: string;
}

export class SealedApi {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  private async call<T>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    parse: ((v: unknown) => T) | null,
    { auth, body }: { auth?: Auth; body?: Json } = {},
  ): Promise<T> {
    if (!this.baseUrl) throw new ApiError("not_configured", 0);
    const headers: Record<string, string> = {};
    if (body) headers["Content-Type"] = "application/json";
    if (auth?.token) headers.Authorization = `Bearer ${auth.token}`;
    if (auth?.setupSecret) headers["X-Setup-Secret"] = auth.setupSecret;

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
      });
    } catch {
      throw new ApiError("network", 0);
    }

    if (res.status === 204) {
      if (parse) throw new ApiError("bad_response", 204);
      return undefined as T;
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new ApiError("bad_response", res.status);
    }
    if (!res.ok) throw parseError(json, res.status, res.headers.get("Retry-After"));
    if (!parse) throw new ApiError("bad_response", res.status);
    return parse(json);
  }

  /** §6.1 */
  health(): Promise<Health> {
    return this.call("GET", "/health", parseHealth);
  }

  /** §6.2. Sender pages may only compare this with the bundled config, never use it (rules §1.8). */
  inbox(id: string): Promise<Inbox> {
    return this.call("GET", `/inbox/${encodeURIComponent(id)}`, parseInbox);
  }

  /** §6.3 */
  createInbox(req: CreateInboxRequest, setupSecret: string): Promise<Inbox> {
    const body: Json = {
      id: req.id,
      name: req.name,
      desk_public_key: req.deskPublicKey,
      fingerprint: req.fingerprint,
      address: req.address,
      ufvk: req.ufvk,
      tip_floor_zat: req.tipFloorZat,
    };
    if (req.birthdayHeight !== undefined) body.birthday_height = req.birthdayHeight;
    return this.call("POST", "/inbox", parseInbox, { auth: { setupSecret }, body });
  }

  /** §6.4. Setup secret on create, current token or setup secret on rotate (C-5). */
  issueToken(id: string, auth: Auth): Promise<IssuedToken> {
    return this.call("POST", `/inbox/${encodeURIComponent(id)}/tokens`, parseToken, { auth });
  }

  /** §6.5 */
  tips(id: string, token: string, opts: { afterSeq?: number; filter?: TipFilter; limit?: number } = {}): Promise<TipsPage> {
    const q = new URLSearchParams();
    q.set("after_seq", String(opts.afterSeq ?? 0));
    q.set("filter", opts.filter ?? "visible");
    if (opts.limit !== undefined) q.set("limit", String(opts.limit));
    return this.call("GET", `/inbox/${encodeURIComponent(id)}/tips?${q.toString()}`, parseTipsPage, { auth: { token } });
  }

  /** §6.6 */
  tip(id: string, tipId: string, token: string): Promise<Tip> {
    return this.call("GET", `/inbox/${encodeURIComponent(id)}/tips/${encodeURIComponent(tipId)}`, parseTip, {
      auth: { token },
    });
  }

  /** §6.10, one page. */
  auditPage(id: string, token: string, opts: { afterSeq?: number; limit?: number } = {}): Promise<AuditPage> {
    const q = new URLSearchParams();
    q.set("after_seq", String(opts.afterSeq ?? 0));
    if (opts.limit !== undefined) q.set("limit", String(opts.limit));
    return this.call("GET", `/inbox/${encodeURIComponent(id)}/audit?${q.toString()}`, parseAuditPage, { auth: { token } });
  }

  /** §6.10: every entry from seq 1, paging while has_more, so the whole chain can be checked. */
  async auditAll(id: string, token: string): Promise<Record<string, unknown>[]> {
    const all: Record<string, unknown>[] = [];
    let afterSeq = 0;
    for (;;) {
      const page = await this.auditPage(id, token, { afterSeq, limit: 500 });
      all.push(...page.entries);
      if (!page.hasMore || page.nextSeq <= afterSeq) return all;
      afterSeq = page.nextSeq;
    }
  }

  /** §6.7 */
  setTipFloor(id: string, tipFloorZat: number, token: string): Promise<Inbox> {
    return this.call("PATCH", `/inbox/${encodeURIComponent(id)}`, parseInbox, {
      auth: { token },
      body: { tip_floor_zat: tipFloorZat },
    });
  }

  /** §6.8. Needs both the desk token and the setup secret (C-6). */
  deleteInbox(id: string, token: string, setupSecret: string): Promise<void> {
    return this.call("DELETE", `/inbox/${encodeURIComponent(id)}`, null, { auth: { token, setupSecret } });
  }
}
