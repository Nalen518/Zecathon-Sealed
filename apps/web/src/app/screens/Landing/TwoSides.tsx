import { useEffect } from "react";
import { Button } from "../../../components/Button/Button";
import { Tag } from "../../../components/Tag/Tag";
import { TextLink } from "../../../components/TextLink/TextLink";
import type { SealedConfig } from "../../../lib/config";

/**
 * Figma: Landing / How it works / Two sides (70:7213), anchor #for-desks (D-87).
 * One page for sources, one desk that holds the key. Copy from docs/desk-entry-and-judge-kit.md §4.
 */
export const FOR_DESKS_ID = "for-desks";
const TITLE_ID = "for-desks-title";

export function TwoSides({ config }: { config: SealedConfig }) {
  return (
    <div id={FOR_DESKS_ID} className="two-sides">
      <div className="section-heading">
        <p className="text-mono-eyebrow eyebrow">Two sides</p>
        <h2 id={TITLE_ID} className="text-heading-h2" tabIndex={-1}>
          One page for sources. One desk that holds the key.
        </h2>
      </div>
      <div className="two-sides-cards">
        <article className="side-card" aria-labelledby="side-sources-title">
          <div>
            <Tag tone="neutral">Tip line</Tag>
          </div>
          <h3 id="side-sources-title" className="text-heading-h3">
            For sources
          </h3>
          <p className="text-body-default">
            Write a tip, seal it in your browser and pay from your own wallet. No account, no email and no name.
          </p>
          <div className="side-card-actions">
            <Button variant="primary" to="/write">
              Write a tip
            </Button>
          </div>
        </article>
        <article className="side-card" aria-labelledby="side-desk-title">
          <div>
            <Tag tone="neutral">Desk</Tag>
          </div>
          <h3 id="side-desk-title" className="text-heading-h3">
            For the desk
          </h3>
          <p className="text-body-default">
            The newsroom holds the only key that opens tips, kept in its own browser. The server watches for payments
            with a view-only key. It can never read a tip or move funds.
          </p>
          <div className="side-card-actions">
            <Button variant="secondary" to="/desk">
              Open the desk
            </Button>
            <TextLink href={`${config.sourceUrl}#run-your-own-desk`}>Run your own desk</TextLink>
          </div>
        </article>
      </div>
      <JudgeBox config={config} />
    </div>
  );
}

/**
 * Figma: Judge box (70:7242). Testnet only: rendered only when demo_desk is true (D-88), which the
 * config refuses on mainnet (D-89). The dashed border-strong outline means testnet only (rules §4.10).
 */
export function JudgeBox({ config }: { config: SealedConfig }) {
  if (!config.demoDesk) return null;
  return (
    <section className="judge-box" aria-labelledby="judge-title">
      <div>
        <Tag tone="warning">Testnet only</Tag>
      </div>
      <h3 id="judge-title" className="text-heading-h3">
        Judging Sealed? Try both sides.
      </h3>
      <ol className="judge-steps">
        <li>
          <span className="text-mono-label judge-step-number">01</span>
          <span className="text-body-default">Write a tip on this page. Pay with testnet ZEC from the faucet.</span>
        </li>
        <li>
          <span className="text-mono-label judge-step-number">02</span>
          <span className="text-body-default">
            Open the desk. Restore the demo desk with the judge kit from the submission notes.
          </span>
        </li>
        <li>
          <span className="text-mono-label judge-step-number">03</span>
          <span className="text-body-default">
            Watch your tip arrive and open it. Then check its entry in the audit trail.
          </span>
        </li>
      </ol>
      <p className="text-body-small judge-note">
        The demo desk key is shared with judges, so anyone with the kit can read tips sent here. Do not send anything
        real.
      </p>
      <div className="judge-links">
        {config.faucetUrl && (
          <TextLink href={config.faucetUrl} external>
            Get free TAZ from the faucet
          </TextLink>
        )}
        <TextLink to="/desk/restore">Restore the demo desk</TextLink>
      </div>
    </section>
  );
}

/**
 * "For desks" in the header is a plain link to /#for-desks. On this page, scroll to the block and move focus to
 * its heading, both on arrival from another page and when the link is clicked here again.
 */
export function useForDesksFocus(): void {
  useEffect(() => {
    const focus = () => {
      if (window.location.hash !== `#${FOR_DESKS_ID}`) return;
      const heading = document.getElementById(TITLE_ID);
      if (!heading) return;
      document.getElementById(FOR_DESKS_ID)?.scrollIntoView({ block: "start" });
      heading.focus({ preventScroll: true });
    };
    const onClick = (e: MouseEvent) => {
      const link = e.target instanceof Element ? e.target.closest("a") : null;
      if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const url = new URL(link.href, window.location.href);
      if (url.pathname !== window.location.pathname || url.hash !== `#${FOR_DESKS_ID}`) return;
      e.preventDefault();
      if (window.location.hash !== url.hash) window.history.pushState(null, "", url.hash);
      focus();
    };
    focus();
    window.addEventListener("hashchange", focus);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", focus);
      document.removeEventListener("click", onClick);
    };
  }, []);
}
