import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon/Icon";
import "./IconCopyButton.css";

/**
 * Figma: Icon button / Copy, property State (Default, Copied). 32 px box with a 16 px icon,
 * a 48 px hit area (rules §6.2) and a tooltip with the same text as its label (critique DC-06).
 * After a copy the check icon shows in the success color for 2 s.
 * The clipboard is written only inside the click handler and never read (rules §1.10).
 */
interface IconCopyButtonProps {
  /** What goes on the clipboard. */
  value: string;
  /** Accessible name and tooltip, for example "Copy transaction id". */
  label: string;
}

const COPIED_MS = 2000;

export function IconCopyButton({ value, label }: IconCopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      setCopied(false);
    }
  }

  return (
    <span className="icon-copy">
      <button
        type="button"
        className={`icon-copy-button${copied ? " icon-copy-button-copied" : ""}`}
        aria-label={label}
        onClick={onCopy}
      >
        <Icon name={copied ? "check" : "copy"} size={16} />
      </button>
      <span className="icon-copy-tooltip text-body-small" aria-hidden="true">
        {copied ? "Copied" : label}
      </span>
      <span className="visually-hidden" role="status" aria-live="polite">
        {copied ? "Copied" : ""}
      </span>
    </span>
  );
}
