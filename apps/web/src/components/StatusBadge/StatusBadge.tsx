import type { DisplayStatus } from "../../lib/api";
import "./StatusBadge.css";

/**
 * Figma: Status badge, property Status. The five tip states only, in the contract's spelling
 * (api-contract §5.3, D-15). Any other label uses Tag.
 */
const LABEL: Record<DisplayStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  below_floor: "Below floor",
  unreadable: "Unreadable",
  orphaned: "Orphaned",
};

export function StatusBadge({ status }: { status: DisplayStatus }) {
  return <span className={`status-badge status-badge-${status} text-mono-badge`}>{LABEL[status]}</span>;
}
