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
  by: string;
  hash: string;
  broken: boolean;
}

export function AuditRow({ seq, when, event, details, by, hash, broken }: AuditRowProps) {
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
        {details}
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
