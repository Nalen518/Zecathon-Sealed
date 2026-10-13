import type { ReactNode } from "react";
import { Link } from "react-router";
import "./TextLink.css";

/** Figma: Text link, property Tone. Underlined, 48 px tall hit area (rules §6.2). */
interface TextLinkProps {
  tone?: "default" | "inverse";
  children: ReactNode;
  /** In-app route. */
  to?: string;
  /** Same-page anchor or external URL. */
  href?: string;
  className?: string;
}

export function TextLink({ tone = "default", children, to, href, className }: TextLinkProps) {
  const cls = `text-link text-link-${tone} text-body-default-medium${className ? ` ${className}` : ""}`;
  if (to !== undefined) {
    return (
      <Link to={to} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={cls}>
      {children}
    </a>
  );
}
