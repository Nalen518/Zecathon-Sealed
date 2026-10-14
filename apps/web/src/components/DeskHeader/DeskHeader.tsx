import { NavLink } from "react-router";
import type { Network } from "../../lib/config";
import { Button } from "../Button/Button";
import { NetworkBadge } from "../NetworkBadge/NetworkBadge";
import "../SiteHeader/SiteHeader.css";
import "./DeskHeader.css";

/**
 * Figma: Desk header, property "Show lock button". The nav (Inbox, Decrypt a memo, Audit trail, Settings)
 * shows on every desk screen, including Create inbox, Locked and Restore (D-92). The lock button shows
 * only while the desk is unlocked. Without a key, each link leads back to Restore.
 */
export function DeskHeader({ network, onLock }: { network: Network; onLock?: () => void }) {
  return (
    <header className="site-header">
      <div className="container site-header-inner">
        <span className="site-header-brand">
          <span className="text-body-default-medium">Sealed</span>
          <span aria-hidden="true" className="site-header-divider" />
          <span className="text-mono-eyebrow site-header-tag">Desk</span>
        </span>
        <div className="site-header-right desk-header-right">
          <nav aria-label="Desk" className="site-header-nav desk-header-nav text-body-small">
            <NavLink to="/desk" end>
              Inbox
            </NavLink>
            <NavLink to="/desk/decrypt">Decrypt a memo</NavLink>
            <NavLink to="/desk/audit">Audit trail</NavLink>
            <NavLink to="/desk/settings">Settings</NavLink>
          </nav>
          <NetworkBadge network={network} />
          {onLock && (
            <Button variant="nav" showIcon={false} onClick={onLock}>
              Lock inbox
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
