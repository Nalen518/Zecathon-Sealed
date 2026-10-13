import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon/Icon";
import "./Fingerprint.css";

/**
 * Figma: Fingerprint (copy field), property State (Default, Copied).
 * A labelled mono value with a copy control. Used for the fingerprint, address, amount and memo.
 * The clipboard is written only inside the click handler and never read (rules §1.10).
 */
interface FingerprintProps {
  label: string;
  value: string;
  /** What goes on the clipboard, if different from the shown value. */
  copyValue?: string;
}

const COPIED_MS = 2000;

export function Fingerprint({ label, value, copyValue }: FingerprintProps) {
  const [copied, setCopied] = useState(false);
  const valueRef = useRef<HTMLParagraphElement>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function selectValue() {
    const node = valueRef.current;
    const selection = window.getSelection();
    if (!node || !selection) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(copyValue ?? value);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      // Clipboard blocked (permissions or an insecure context): select the text so it can be copied by hand.
      selectValue();
    }
  }

  return (
    <div className="fingerprint">
      <p className="text-mono-eyebrow fingerprint-label">
        {label}
      </p>
      <div className="fingerprint-row">
        <p ref={valueRef} className="fingerprint-value text-mono-code">
          {value}
        </p>
        <button type="button" className="fingerprint-copy text-mono-label" onClick={onCopy}>
          <Icon name={copied ? "check" : "copy"} />
          <span aria-hidden="true">{copied ? "Copied" : "Copy"}</span>
          <span className="visually-hidden">{`Copy ${label.toLowerCase()}`}</span>
        </button>
      </div>
      <span className="visually-hidden" role="status" aria-live="polite">
        {copied ? `${label} copied` : ""}
      </span>
    </div>
  );
}
