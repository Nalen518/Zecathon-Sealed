import { useId, type ReactNode } from "react";
import { Icon } from "../Icon/Icon";
import "./Textarea.css";

/**
 * Figma: Textarea, property State (Empty, Typing, At limit, Error).
 * The counter is aria-live="polite" (rules §6.6). Errors are linked with aria-describedby (rules §6.3).
 */
interface TextareaProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Helper text under the field when there is no error. */
  helper?: ReactNode;
  /** Error message. Turns the field red and shows the alert icon (At limit or Error). */
  error?: string;
  /** Counter text, for example "127 / 331 bytes". */
  counter?: string;
  /** Counter in the danger color (At limit). */
  counterDanger?: boolean;
  spellCheck?: boolean;
  mono?: boolean;
  id?: string;
}

export function Textarea({
  label,
  value,
  onChange,
  placeholder,
  helper,
  error,
  counter,
  counterDanger,
  spellCheck = true,
  mono = false,
  id,
}: TextareaProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const helperId = `${fieldId}-helper`;
  const counterId = `${fieldId}-counter`;
  const describedBy = [helper || error ? helperId : null, counter ? counterId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="textarea">
      <label htmlFor={fieldId} className="text-body-default-medium">
        {label}
      </label>
      <textarea
        id={fieldId}
        className={`textarea-field ${mono ? "text-mono-code" : "text-body-default"}${error ? " textarea-field-error" : ""}`}
        value={value}
        placeholder={placeholder}
        spellCheck={spellCheck}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="textarea-helper-row">
        {(helper || error) && (
          <div id={helperId} className={`textarea-helper text-body-small${error ? " textarea-helper-error" : ""}`}>
            {error && <Icon name="alert" size={16} className="textarea-helper-icon" />}
            <span>{error ?? helper}</span>
          </div>
        )}
        {counter && (
          <p
            id={counterId}
            className={`textarea-counter text-mono-label${counterDanger ? " textarea-counter-danger" : ""}`}
            aria-live="polite"
          >
            {counter}
          </p>
        )}
      </div>
    </div>
  );
}
