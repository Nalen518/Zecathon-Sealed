import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon/Icon";
import "./AuditRow.css";

/**
 * Figma: Audit header row and Audit row (State: Default, Broken). One audit entry per table row.
 * Columns: Seq, When, Event, Details, By, Hash. Never shows tip text, IPs or token values (§5.6).
 */
export function AuditHeaderRow() {
  return (
    <thead className="audit-head">
      <tr>
        <th scope="col" className="text-mono-eyebrow audit-seq">Seq</th>
        <th scope="col" className="text-mono-eyebrow audit-when">When</th>
        <th scope="col" className="text-mono-eyebrow audit-event">Event</th>
        <th scope="col" className="text-mono-eyebrow audit-details">Details</th>
        <th scope="col" className="text-mono-eyebrow audit-by">By</th>
        <th scope="col" className="text-mono-eyebrow audit-hash">Hash</th>
      </tr>
    </thead>
  );
}

interface AuditRowProps {
  seq: string;
  when: string;
  event: string;
  details: string;
  /** Shown as a copy button in the Details cell when present. */
  txid: string | null;
  by: string;
  hash: string;
  broken: boolean;
}

export function AuditRow({ seq, when, event, details, txid, by, hash, broken }: AuditRowProps) {
  return (
    <tr className={`audit-row${broken ? " audit-row-broken" : ""}`}>
      <td className="text-mono-label audit-seq" data-label="Seq">
        {seq}
      </td>
      <td className="text-body-small audit-when" data-label="When">
        {when}
      </td>
      <th scope="row" className="text-body-default-medium audit-event" data-label="Event">
        {event}
      </th>
      <td className="text-body-small audit-details" data-label="Details">
        <div className="audit-details-cell">
          <span>{details}</span>
          {txid && <CopyTxid txid={txid} />}
        </div>
      </td>
      <td className="text-mono-label audit-by" data-label="By">
        {by}
      </td>
      <td className="text-mono-label audit-hash" data-label="Hash">
        {broken ? "Hash mismatch" : hash}
      </td>
    </tr>
  );
}

const COPIED_MS = 2000;

/**
 * 32 px copy button with a 16 px icon (Figma: Audit row, Details cell), with a 44 px hit area (rules §6.2).
 * Copied state as on the Fingerprint copy field. The clipboard is written only in the click handler (rules §1.10).
 */
function CopyTxid({ txid }: { txid: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(txid);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <button type="button" className="audit-copy" aria-label="Copy transaction id" onClick={onCopy}>
        <Icon name={copied ? "check" : "copy"} size={16} />
      </button>
      <span className="visually-hidden" role="status" aria-live="polite">
        {copied ? "Copied" : ""}
      </span>
    </>
  );
}
