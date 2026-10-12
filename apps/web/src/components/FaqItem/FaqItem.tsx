import { useId, useState, type ReactNode } from "react";
import { Icon } from "../Icon/Icon";
import "./FaqItem.css";

/** Figma: FAQ item, property State (Collapsed, Expanded). Disclosure button with aria-expanded (rules §6.7). */
export function FaqItem({
  question,
  children,
  defaultExpanded = false,
}: {
  question: string;
  children: ReactNode;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const answerId = useId();
  return (
    <div className="faq-item">
      <h3 className="faq-item-heading">
        <button
          type="button"
          className="faq-item-question text-body-default-medium"
          aria-expanded={expanded}
          aria-controls={answerId}
          onClick={() => setExpanded((v) => !v)}
        >
          <span>{question}</span>
          <Icon name={expanded ? "chevron-up" : "chevron-down"} />
        </button>
      </h3>
      <div id={answerId} className="faq-item-answer text-body-default" hidden={!expanded}>
        {children}
      </div>
    </div>
  );
}
