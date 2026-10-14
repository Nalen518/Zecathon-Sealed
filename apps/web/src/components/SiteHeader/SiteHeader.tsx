import { Link } from "react-router";
import type { Network } from "../../lib/config";
import { Button } from "../Button/Button";
import { NetworkBadge } from "../NetworkBadge/NetworkBadge";
import "./SiteHeader.css";

/**
 * Figma: Site header (Breakpoint=Desktop, Mobile). Landing page and Safety check (rules §4.7).
 * Mobile drops the section links and the Verify button. The badge always stays (FR-9).
 */
export function SiteHeader({ network }: { network: Network }) {
  return (
    <header className="site-header">
      <div className="container site-header-inner">
        <Link to="/" className="site-header-brand">
          <span className="text-body-default-medium">Sealed</span>
          <span aria-hidden="true" className="site-header-divider" />
          <span className="text-mono-eyebrow site-header-tag">Tip line</span>
        </Link>
        <div className="site-header-right">
          <nav aria-label="Sections" className="site-header-nav text-body-small">
            <a href="/#how-it-works">How it works</a>
            <a href="/#what-it-protects">What it protects</a>
            <a href="/#questions">Questions</a>
            <a href="/#for-desks">For desks</a>
          </nav>
          <NetworkBadge network={network} />
          <Button variant="nav" href="/#verify" showIcon={false} className="site-header-verify">
            Verify this page
          </Button>
        </div>
      </div>
    </header>
  );
}
