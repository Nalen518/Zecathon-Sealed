import type { ReactNode } from "react";
import "./Step.css";

/** Figma: Step. One numbered step in "How it works". */
export function Step({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return (
    <li className="step">
      <span className="text-mono-label step-number">{number}</span>
      <h3 className="text-heading-h3">{title}</h3>
      <p className="text-body-default step-body">{children}</p>
    </li>
  );
}
