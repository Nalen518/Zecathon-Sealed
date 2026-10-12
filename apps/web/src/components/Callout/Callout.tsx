import type { ReactNode } from "react";
import { Icon, type IconName } from "../Icon/Icon";
import "./Callout.css";

/** Figma: Callout, property Tone (Info, Warning, Success). Icon plus title, never color alone. */
export type CalloutTone = "info" | "warning" | "success";

const ICON: Record<CalloutTone, IconName> = { info: "info", warning: "alert", success: "check" };

interface CalloutProps {
  tone: CalloutTone;
  title: string;
  children: ReactNode;
  /** "alert" announces the callout when it appears (errors). Default "note". */
  role?: "note" | "alert" | "status";
  className?: string;
}

export function Callout({ tone, title, children, role = "note", className }: CalloutProps) {
  return (
    <div role={role} className={`callout callout-${tone}${className ? ` ${className}` : ""}`}>
      <Icon name={ICON[tone]} className="callout-icon" />
      <div className="callout-text">
        <p className="text-body-default-medium callout-title">{title}</p>
        <div className="text-body-small callout-body">{children}</div>
      </div>
    </div>
  );
}
