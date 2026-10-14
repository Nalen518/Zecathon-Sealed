import { TextLink } from "../components/TextLink/TextLink";
import "./OutboundLinks.css";

/**
 * Plain links to outside testnet tools (D-82 to D-84, rules §2.7). The URLs come from
 * `outbound_links` in sealed.config.json and are null on mainnet, so nothing renders there.
 * Nothing is fetched from these sites. The visitor clicks, and the link opens in a new tab.
 */

/** Pay, inside the "Check in your wallet" panel under the cost line (Figma: Pay — Default). */
export function FaucetLine({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <div className="outbound-line outbound-line-stacked">
      <p className="text-body-small note">Need testnet ZEC?</p>
      <TextLink tone="inverse" href={url} external>
        Get free TAZ from the faucet
      </TextLink>
    </div>
  );
}

/**
 * Audit trail, between the proof block and the table. Home page only, never a link per transaction,
 * so the explorer does not learn which tip the desk is looking at (D-82).
 */
export function ExplorerLine({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <div className="outbound-line">
      <p className="text-body-small muted">See what the chain shows.</p>
      <TextLink href={url} external>
        Open the testnet explorer
      </TextLink>
    </div>
  );
}
