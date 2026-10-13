import "./RadioOption.css";

/** Figma: Radio option, property State. The whole card is the label of a native radio input. */
interface RadioOptionProps {
  name: string;
  value: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: string) => void;
}

export function RadioOption({ name, value, label, hint, checked, onChange }: RadioOptionProps) {
  return (
    <label className={`radio-option${checked ? " radio-option-selected" : ""}`}>
      <input
        type="radio"
        className="radio-option-input"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
      />
      <span className="radio-option-text">
        <span className="text-body-default-medium">{label}</span>
        <span className="text-body-small radio-option-hint">{hint}</span>
      </span>
    </label>
  );
}
