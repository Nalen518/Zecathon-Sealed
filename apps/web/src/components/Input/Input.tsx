import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { Icon } from "../Icon/Icon";
import "./Input.css";

/**
 * Figma: Input, properties State (Default, Focus, Error, Disabled) and Font (Sans, Mono).
 * Real <label>, 48 px tall, error with icon and message linked by aria-describedby (rules §6.3).
 */
interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "className"> {
  label: string;
  helper?: string;
  error?: string;
  mono?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, helper, error, mono = false, id, ...rest },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const helperId = `${fieldId}-helper`;
  const message = error ?? helper;
  return (
    <div className="input">
      <label htmlFor={fieldId} className="text-body-default-medium">
        {label}
      </label>
      <input
        ref={ref}
        id={fieldId}
        className={`input-field ${mono ? "text-mono-code" : "text-body-default"}${error ? " input-field-error" : ""}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? helperId : undefined}
        autoComplete="off"
        spellCheck={false}
        {...rest}
      />
      {message && (
        <p id={helperId} className={`input-helper text-body-small${error ? " input-helper-error" : ""}`}>
          {error && <Icon name="alert" size={16} className="input-helper-icon" />}
          <span>{message}</span>
        </p>
      )}
    </div>
  );
});
