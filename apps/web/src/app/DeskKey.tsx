import { Callout } from "../components/Callout/Callout";
import { Fingerprint } from "../components/Fingerprint/Fingerprint";
import type { DeskStatus } from "../lib/config";
import { formatFingerprint } from "../lib/fingerprint";

/**
 * The desk key fingerprint from the bundled config, or why there is none (FR-6).
 * The "not set up", "does not check out" and "checking" states are not drawn in Figma (D-37).
 */
export function DeskKey({ status }: { status: DeskStatus | null }) {
  if (status === null) {
    return (
      <p className="text-body-small desk-key-checking" role="status">
        Checking the desk key.
      </p>
    );
  }
  if (status.kind === "ready") {
    return <Fingerprint label="Desk key fingerprint" value={formatFingerprint(status.config.fingerprint)} />;
  }
  if (status.kind === "not_set_up") {
    return (
      <Callout tone="warning" title="This tip line is not set up yet" role="status">
        The desk has not published its key on this page. Do not send a tip until a fingerprint appears here.
      </Callout>
    );
  }
  return (
    <Callout tone="warning" title="The desk key on this page does not check out" role="alert">
      The key and its fingerprint do not match. Do not send a tip. Reach the desk another way and tell them.
    </Callout>
  );
}
