import { Icon } from "../Icon/Icon";
import "./StepIndicator.css";

/**
 * Figma: Step indicator, property Current (1, 2, 3). An <ol> with aria-current="step" (rules §6.7).
 * Done steps show a check, so state is not color only.
 */
export function StepIndicator({ steps, current }: { steps: [string, string, string]; current: 1 | 2 | 3 }) {
  return (
    <ol className="step-indicator" aria-label="Progress">
      {steps.map((label, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "current" : "todo";
        return (
          <li key={label} className={`step-indicator-item step-indicator-${state}`} aria-current={state === "current" ? "step" : undefined}>
            {i > 0 && <span aria-hidden="true" className="step-indicator-line" />}
            <span className="step-indicator-marker text-mono-label">
              {state === "done" ? <Icon name="check" size={16} /> : <span aria-hidden="true">{n}</span>}
            </span>
            <span className="text-mono-label step-indicator-label">
              {label}
              {state === "done" && <span className="visually-hidden"> (done)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
