import "./PermissionRow.css";

/**
 * Figma: Permission row, properties Visibility (Sealed, Visible, Not protected) and
 * Layout (Inline, Stacked). Layout switches to Stacked below 860 px in CSS.
 */
export type Visibility = "sealed" | "visible" | "not-protected";

const STATUS: Record<Visibility, string> = {
  sealed: "Sealed",
  visible: "Visible",
  "not-protected": "Not protected",
};

export function PermissionRow({ visibility, label, detail }: { visibility: Visibility; label: string; detail: string }) {
  return (
    <li className="permission-row">
      <div className="permission-row-text">
        <span className="text-mono-label permission-row-label">{label}</span>
        <span className="text-body-small permission-row-detail">{detail}</span>
      </div>
      <span className={`permission-row-status permission-row-status-${visibility} text-mono-badge`}>
        {STATUS[visibility]}
      </span>
    </li>
  );
}
