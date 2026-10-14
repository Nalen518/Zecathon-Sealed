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
  /**
   * Outbound link (D-84): opens in a new tab so the page and anything held in memory stay put,
   * with noopener and noreferrer so the other site gets no handle on this tab and no Referer.
   */
  external?: boolean;
  className?: string;
}

export function TextLink({ tone = "default", children, to, href, external = false, className }: TextLinkProps) {
  const cls = `text-link text-link-${tone} text-body-default-medium${className ? ` ${className}` : ""}`;
  if (to !== undefined) {
    return (
      <Link to={to} className={cls}>
        {children}
      </Link>
    );
  }
  if (external) {
    return (
      <a href={href} className={cls} target="_blank" rel="noopener noreferrer">
        {children}
        <span className="visually-hidden"> (opens in a new tab)</span>
      </a>
    );
  }
  return (
    <a href={href} className={cls}>
      {children}
    </a>
  );
}
