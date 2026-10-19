import { useRef } from "react";
import type { Network } from "../../lib/config";
import { Button } from "../Button/Button";
import { NetworkBadge } from "../NetworkBadge/NetworkBadge";
import "../SiteHeader/SiteHeader.css";
import "./FlowHeader.css";

/**
 * Figma: Flow header. Write, Pay and Sent (rules §4.7, D-13). No section links, so a source cannot
 * leave by accident. "Leave" confirms inside the page when there is a tip to lose (rules §6.9).
 */
interface FlowHeaderProps {
  network: Network;
  /** True when leaving would discard a tip. */
  confirmLeave: boolean;
  onLeave: () => void;
}

export function FlowHeader({ network, confirmLeave, onLeave }: FlowHeaderProps) {
  const dialog = useRef<HTMLDialogElement>(null);

  function leave() {
    if (confirmLeave) dialog.current?.showModal();
    else onLeave();
  }

  return (
    <header className="site-header">
      <div className="container site-header-inner">
        <span className="site-header-brand">
          <span className="text-body-default-medium">Sealed</span>
          <span aria-hidden="true" className="site-header-divider" />
          <span className="text-mono-eyebrow site-header-tag">Tip line</span>
        </span>
        <div className="site-header-right flow-header-right">
          <NetworkBadge network={network} />
          <Button variant="nav" showIcon={false} onClick={leave}>
            Leave
          </Button>
        </div>
      </div>
      <dialog ref={dialog} className="leave-dialog" aria-labelledby="leave-title" aria-describedby="leave-body">
        <h2 id="leave-title" className="text-heading-h3">
          Leave and discard your tip?
        </h2>
        <p id="leave-body" className="text-body-default leave-dialog-body">
          Your tip lives only in this tab. If you leave now, it is gone and nothing is saved.
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
              onLeave();
            }}
          >
            Leave and discard
          </Button>
        </div>
      </dialog>
    </header>
  );
}
