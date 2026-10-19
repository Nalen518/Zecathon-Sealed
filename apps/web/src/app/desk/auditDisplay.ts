import { formatFingerprint } from "../../lib/fingerprint";
import { formatZec } from "../../lib/format";
import { formatHeight, formatWhen, shortTxid } from "./format";

/**
 * How one raw audit entry reads in the table (Figma: Audit trail — Verified). Pure display.
 * Values come only from the entry. A field of the wrong type shows as empty, never as raw JSON.
 */
export interface AuditView {
  seq: string;
  when: string;
  event: string;
  details: string;
  /** Full transaction id when the entry has one (tip events, §5.6), for the copy button. Never a link (D-82). */
  txid: string | null;
  by: string;
  hash: string;
}

const ACTOR: Record<string, string> = { setup: "Setup", desk: "Desk", watcher: "Watcher" };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const zec = (v: unknown) => (num(v) === null ? "" : `${formatZec(num(v)!)} ZEC`);
const tx = (v: unknown) => (str(v) ? `tx ${shortTxid(str(v))}` : "");
const block = (v: unknown) => (num(v) === null ? "" : `block ${formatHeight(num(v)!)}`);
const join = (...parts: string[]) => parts.filter(Boolean).join(" · ");

/** Host name of a chain server origin, for example "testnet.zec.rocks". Origins only reach here (§5.6, C-14). */
function host(origin: unknown): string {
  try {
    return new URL(str(origin)).hostname;
  } catch {
    return "";
  }
}

export function auditView(raw: Record<string, unknown>): AuditView {
  const d = (typeof raw.details === "object" && raw.details !== null ? raw.details : {}) as Record<string, unknown>;
  const type = str(raw.type);
  let event = type || "Unknown event";
  let details = "";
  switch (type) {
    case "inbox_created":
      event = "Inbox created";
      details = join(str(d.fingerprint) ? `Fingerprint ${formatFingerprint(str(d.fingerprint))}` : "", num(d.tip_floor_zat) === null ? "" : `floor ${zec(d.tip_floor_zat)}`);
      break;
    case "token_issued":
      event = d.rotated === true ? "Desk token rotated" : "Desk token issued";
      details = d.rotated === true ? "Earlier tokens revoked" : "First token for this inbox";
      break;
    case "floor_changed":
      event = "Tip floor changed";
      details = num(d.from_zat) !== null && num(d.to_zat) !== null ? `From ${formatZec(num(d.from_zat)!)} to ${zec(d.to_zat)}` : "";
      break;
    case "tip_received":
      event = "Tip received";
      details = join(zec(d.amount_zat), tx(d.txid), d.format_ok === false ? "memo not in Sealed format" : block(d.height));
      break;
    case "tip_confirmed":
      event = "Tip confirmed";
      details = join(tx(d.txid), num(d.confirmations) === null ? "" : `${num(d.confirmations)} confirmations`);
      break;
    case "tip_orphaned":
      event = "Tip orphaned";
      details = join(tx(d.txid), block(d.height));
      break;
    case "source_down":
      event = "Chain server not answering";
      details = host(d.origin);
      break;
    case "source_up":
      event = "Chain server back";
      details = host(d.origin) ? `${host(d.origin)} answering again` : "";
      break;
  }
  const at = str(raw.at);
  const hash = str(raw.hash);
  return {
    seq: num(raw.seq) === null ? "#?" : `#${num(raw.seq)}`,
    when: at ? formatWhen(at) : "",
    event,
    details,
    txid: /^[0-9a-f]{64}$/.test(str(d.txid)) ? str(d.txid) : null,
    by: ACTOR[str(raw.actor)] ?? str(raw.actor),
    hash: hash.length > 8 ? `${hash.slice(0, 4)}…${hash.slice(-4)}` : hash,
  };
}
