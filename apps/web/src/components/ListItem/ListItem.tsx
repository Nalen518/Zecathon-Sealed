import type { ReactNode } from "react";
import { Icon } from "../Icon/Icon";
import "./ListItem.css";

/** Figma: List item, property Type (Include, Exclude). Icon shape plus color, never color alone. */
export function ListItem({ type, children }: { type: "include" | "exclude"; children: ReactNode }) {
  return (
    <li className={`list-item list-item-${type}`}>
      <span className="list-item-marker">
        <Icon name={type === "include" ? "check" : "x"} size={16} />
      </span>
      <span className="text-body-default">{children}</span>
    </li>
  );
}
