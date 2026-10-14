import type { Network } from "../../lib/config";
import "./NetworkBadge.css";

/** Figma: Network badge, property Network (Testnet, Mainnet). Shown on every page (FR-9). Text only, no dot (D-81). */
export function NetworkBadge({ network }: { network: Network }) {
  const label = network === "main" ? "Mainnet" : "Testnet";
  return (
    <span className={`network-badge network-badge-${network} text-mono-badge`}>
      <span className="visually-hidden">Network: </span>
      {label}
    </span>
  );
}
