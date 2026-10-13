import { useGSAP } from "@gsap/react";
import { useId, useRef, useState, type ReactNode } from "react";
import { EASE, gsap, motionAllowed } from "../../motion/gsap";
import { Icon } from "../Icon/Icon";
import "./FaqItem.css";

/**
 * Figma: FAQ item, property State (Collapsed, Expanded). Disclosure button with aria-expanded (rules §6.7).
 * The answer's height eases open and shut (D-67). With reduced motion it simply shows and hides.
 */
export function FaqItem({
  question,
  children,
  defaultExpanded = false,
}: {
  question: string;
  children: ReactNode;
  defaultExpanded?: boolean;
}) {
  // `expanded` drives aria-expanded at once. `shown` keeps the answer rendered while it eases shut.
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [shown, setShown] = useState(defaultExpanded);
  const toggled = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const answer = useRef<HTMLDivElement>(null);
  const answerId = useId();

  const { contextSafe } = useGSAP(
    () => {
      // Ease open after a click, never on first render.
      if (!toggled.current || !expanded || !answer.current || !motionAllowed()) return;
      gsap.from(answer.current, { height: 0, opacity: 0, duration: 0.3, ease: EASE, clearProps: "height,opacity" });
    },
    { scope: root, dependencies: [expanded] },
  );

  const toggle = contextSafe(() => {
    toggled.current = true;
    if (!expanded) {
      setExpanded(true);
      setShown(true);
      return;
    }
    setExpanded(false);
    if (!answer.current || !motionAllowed()) {
      setShown(false);
      return;
    }
    gsap.to(answer.current, {
      height: 0,
      opacity: 0,
      duration: 0.25,
      ease: EASE,
      onComplete: () => {
        setShown(false);
        if (answer.current) gsap.set(answer.current, { clearProps: "height,opacity" });
      },
    });
  });

  return (
    <div className="faq-item" ref={root}>
      <h3 className="faq-item-heading">
        <button
          type="button"
          className="faq-item-question text-body-default-medium"
          aria-expanded={expanded}
          aria-controls={answerId}
          onClick={toggle}
        >
          <span>{question}</span>
          <Icon name={expanded ? "chevron-up" : "chevron-down"} />
        </button>
      </h3>
      <div ref={answer} id={answerId} className="faq-item-answer text-body-default" hidden={!shown}>
        {children}
      </div>
    </div>
  );
}
