import type { DisplayStatus } from "../../lib/api";
import { StatusBadge } from "../StatusBadge/StatusBadge";
import "./TipRow.css";

/** Figma: Tip row, property State (Default, Selected). The whole row is a button (FR-12, FR-15). */
interface TipRowProps {
  time: string;
  meta: string;
  amount: string;
  status: DisplayStatus;
  selected: boolean;
  onSelect: () => void;
}

export function TipRow({ time, meta, amount, status, selected, onSelect }: TipRowProps) {
  return (
    <button
      type="button"
      className={`tip-row${selected ? " tip-row-selected" : ""}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="tip-row-left">
        <span className="text-body-default-medium">{time}</span>
        <span className="text-mono-label tip-row-meta">{meta}</span>
      </span>
      <span className="tip-row-right">
        <span className="text-mono-label">{amount}</span>
        <StatusBadge status={status} />
      </span>
    </button>
  );
}
