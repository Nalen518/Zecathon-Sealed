import "./Icon.css";

/** Figma: Components / Icons (20 px stroke icons). */
export type IconName =
  | "check"
  | "x"
  | "minus"
  | "chevron-down"
  | "chevron-up"
  | "arrow-right"
  | "copy"
  | "external"
  | "alert"
  | "info"
  | "lock"
  | "coin"
  | "eye-off";

interface IconProps {
  name: IconName;
  /** 20 is the Figma size. 16 is used inside the List item marker. */
  size?: 16 | 20;
  className?: string;
}

/**
 * Decorative icon. The Figma SVG is used as a CSS mask filled with currentColor,
 * so the asset stays untouched and its color comes from the surrounding token.
 * Meaning is always carried by text next to it (rules §6.5).
 */
export function Icon({ name, size = 20, className }: IconProps) {
  return <span aria-hidden="true" className={`icon icon-${name} icon-${size}${className ? ` ${className}` : ""}`} />;
}
