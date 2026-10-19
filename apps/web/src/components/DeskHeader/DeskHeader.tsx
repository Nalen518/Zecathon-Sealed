import { useRef } from "react";
import { NavLink, useNavigate } from "react-router";
import type { Network } from "../../lib/config";
import { Button } from "../Button/Button";
import { NetworkBadge } from "../NetworkBadge/NetworkBadge";
import "../FlowHeader/FlowHeader.css";
import "../SiteHeader/SiteHeader.css";
import "./DeskHeader.css";

/**
 * Figma: Desk header, property "Show lock button". The nav (Inbox, Decrypt a memo, Audit trail, Settings)
 * shows on every desk screen, including Create inbox, Locked and Restore (D-92). The lock button shows
 * only while the desk is unlocked. Without a key, each link leads back to Restore.
 * "Leave" (D-96) is on every desk screen: it locks the desk and goes to the tip page. Leaving the desk routes
 * also wipes the key from memory (DeskSession). It asks first only when a new desk key is not saved yet.
 */
interface DeskHeaderProps {
  network: Network;
  onLock?: () => void;
  /** True on Create inbox while the new key is not saved in this browser yet. */
  confirmLeave?: boolean;
}

export function DeskHeader({ network, onLock, confirmLeave = false }: DeskHeaderProps) {
  const navigate = useNavigate();
  const dialog = useRef<HTMLDialogElement>(null);

  function leaveNow() {
    onLock?.();
    navigate("/");
  }

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
          <Button variant="nav" showIcon={false} onClick={() => (confirmLeave ? dialog.current?.showModal() : leaveNow())}>
            Leave
          </Button>
        </div>
      </div>
      <dialog ref={dialog} className="leave-dialog" aria-labelledby="desk-leave-title" aria-describedby="desk-leave-body">
        <h2 id="desk-leave-title" className="text-heading-h3">
          Leave without saving the desk key?
        </h2>
        <p id="desk-leave-body" className="text-body-default leave-dialog-body">
          The new desk key lives only in this tab until you continue. If you leave now, it is gone.
        </p>
        <div className="leave-dialog-actions">
          <Button variant="primary" showIcon={false} onClick={() => dialog.current?.close()}>
            Stay on this page
          </Button>
          <Button
            variant="secondary"
            showIcon={false}
            onClick={() => {
              dialog.current?.close();
              leaveNow();
            }}
          >
            Leave and discard
          </Button>
        </div>
      </dialog>
    </header>
  );
}
