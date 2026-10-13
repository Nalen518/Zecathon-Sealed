import type { ReactNode } from "react";
import { Link } from "react-router";
import { Icon } from "../Icon/Icon";
import "./Button.css";

/** Figma: Button, property Variant. State (Default, Hover, Focus, Disabled) comes from CSS and `disabled`. */
export type ButtonVariant = "primary" | "secondary" | "inverse" | "nav" | "danger";

interface CommonProps {
  variant?: ButtonVariant;
  children: ReactNode;
  /** Figma "Show icon": arrow-right after the label. */
  showIcon?: boolean;
  className?: string;
}

type ButtonProps = CommonProps &
  (
    | { to: string; href?: never; onClick?: never; type?: never; disabled?: never }
    | { href: string; to?: never; onClick?: never; type?: never; disabled?: never }
    | {
        to?: never;
        href?: never;
        onClick?: () => void;
        type?: "button" | "submit";
        disabled?: boolean;
      }
  );

export function Button(props: ButtonProps) {
  const { variant = "primary", children, showIcon = true, className } = props;
  const cls = `button button-${variant}${className ? ` ${className}` : ""}`;
  const content = (
    <>
      <span className={variant === "nav" ? "text-mono-label" : "text-button-label"}>{children}</span>
      {showIcon && <Icon name="arrow-right" />}
    </>
  );

  if (props.to !== undefined) {
    return (
      <Link to={props.to} className={cls}>
        {content}
      </Link>
    );
  }
  if (props.href !== undefined) {
    return (
      <a href={props.href} className={cls}>
        {content}
      </a>
    );
  }
  return (
    <button type={props.type ?? "button"} className={cls} onClick={props.onClick} disabled={props.disabled}>
      {content}
    </button>
  );
}
