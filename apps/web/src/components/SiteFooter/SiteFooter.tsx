import { useEffect, useRef } from "react";
import type { Network } from "../../lib/config";
import { mountDotWordmark } from "../../motion/dotWordmark";
import { NetworkBadge } from "../NetworkBadge/NetworkBadge";
import "../../motion/motion.css";
import "./SiteFooter.css";

interface SiteFooterProps {
  network: Network;
  sourceUrl: string;
}

/**
 * Figma: Site footer (Breakpoint=Desktop, Mobile), footer F3 with the dot-matrix wordmark (D-05).
 * Landing page only. Links: Source code, Honest limits, Verify this page (D-31).
 */
export function SiteFooter({ network, sourceUrl }: SiteFooterProps) {
  const footer = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvas.current || !footer.current) return;
    const handle = mountDotWordmark(canvas.current, { hoverTarget: footer.current });
    return () => handle.destroy();
  }, []);

  return (
    <footer ref={footer} className="site-footer">
      <div className="container site-footer-inner">
        <div className="site-footer-top">
          <div className="site-footer-about">
            <p className="text-body-default-medium">Powered by Sealed, open source</p>
            <p className="text-body-small site-footer-promise">
              No analytics. No cookies. No third-party scripts or fonts.
              <br />
              Everything you type is sealed in your browser.
            </p>
          </div>
          <nav aria-label="Footer" className="site-footer-links text-body-small">
            <a href={sourceUrl}>Source code</a>
            <a href="/#what-it-protects">Honest limits</a>
            <a href="/#verify">Verify this page</a>
          </nav>
        </div>
        <canvas ref={canvas} className="dot-wordmark site-footer-wordmark" width={1040} height={260} aria-hidden="true" />
        <div className="site-footer-bottom">
          <p className="text-mono-badge site-footer-legal">
            © Sealed · v{__SEALED_VERSION__} · MIT or Apache-2.0
          </p>
          <span className="site-footer-badge">
            <NetworkBadge network={network} />
          </span>
        </div>
      </div>
    </footer>
  );
}
