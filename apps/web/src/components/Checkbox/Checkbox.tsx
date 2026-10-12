import "./Checkbox.css";

/** Figma: Checkbox, property State. Native checkbox, 24 px box, 44 px row tap target. */
export function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="checkbox">
      <input type="checkbox" className="checkbox-input" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-body-default">{label}</span>
    </label>
  );
}
