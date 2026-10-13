import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../../components/Button/Button";
import { Callout } from "../../../components/Callout/Callout";
import { FlowHeader } from "../../../components/FlowHeader/FlowHeader";
import { MemoGrid } from "../../../components/MemoGrid/MemoGrid";
import { SlimFooter } from "../../../components/SlimFooter/SlimFooter";
import { StepIndicator } from "../../../components/StepIndicator/StepIndicator";
import { Textarea } from "../../../components/Textarea/Textarea";
import { TextLink } from "../../../components/TextLink/TextLink";
import { bundled } from "../../../lib/config";
import { MAX_MESSAGE_BYTES, truncateToBytes, utf8Length } from "../../../lib/memo";
import { DeskKey } from "../../DeskKey";
import { EASE, gsap, motionAllowed } from "../../../motion/gsap";
import type { MemoGridHandle } from "../../../motion/memoGrid";
import { useTipFlow } from "../../flow/TipFlow";
import { useDeskStatus } from "../../useDeskStatus";
import "../AppScreen.css";
import "./Write.css";

/**
 * Figma: Sender screens / Write — Default, Empty, At limit. FR-1, FR-2, FR-6.
 * The tip stays in this tab. Sealing runs in the browser (crypto_box_seal), nothing is sent.
 */
export const SENDER_STEPS: [string, string, string] = ["Write", "Pay", "Done"];

export function Write() {
  const navigate = useNavigate();
  const flow = useTipFlow();
  const status = useDeskStatus();
  const [sealing, setSealing] = useState(false);
  const [sealError, setSealError] = useState(false);
  const grid = useRef<MemoGridHandle | null>(null);
  if (!bundled.ok) return null;
  const config = bundled.config;

  const bytes = utf8Length(flow.text);
  const empty = flow.text.length === 0;
  const atLimit = bytes >= MAX_MESSAGE_BYTES;
  const ready = status?.kind === "ready";

  function onChange(value: string) {
    // FR-1, D-11: block input past the limit and cut a long paste at a whole character.
    flow.setText(truncateToBytes(value));
  }

  async function onSeal() {
    if (status?.kind !== "ready" || empty) return;
    setSealing(true);
    setSealError(false);
    try {
      // Seal first (the real work, in the browser). Then show it: a 500 ms gold sweep, never longer (rules §7.6).
      await flow.seal(status.publicKey);
      const g = grid.current;
      if (g && motionAllowed()) {
        const sweep = { p: 0 };
        await gsap.to(sweep, { p: 1, duration: 0.5, ease: EASE, onUpdate: () => g.setSealProgress(sweep.p) });
        // Left the page (Leave) during the sweep: the grid is gone, so do not jump to Pay.
        if (grid.current !== g) return;
      }
      navigate("/pay");
    } catch {
      setSealError(true);
    } finally {
      setSealing(false);
    }
  }

  const also = config.fingerprintAlsoOn;

  return (
    <div className="app-page">
      <FlowHeader
        network={config.network}
        confirmLeave={!empty}
        onLeave={() => {
          flow.discard();
          navigate("/");
        }}
      />
      <main id="main" className="app-main">
        <div className="container app-stack">
          <StepIndicator steps={SENDER_STEPS} current={1} />
          <div className="write-columns">
            <div className="write-left">
              <div className="app-heading">
                <h1 className="text-heading-h2">Write your tip</h1>
                <p className="text-body-lead lead">
                  Only the desk can open what you write here. Nothing leaves this page until you pay from your own
                  wallet.
                </p>
              </div>

              <Textarea
                label="Your tip"
                value={flow.text}
                onChange={onChange}
                placeholder="What should the desk know? Names, dates, places, and how you know."
                helper="Want a reply? Say how to reach you here. The desk has no other way to find you."
                error={atLimit ? `You have used all ${MAX_MESSAGE_BYTES} bytes. Shorten the tip to add more.` : undefined}
                counter={`${bytes} / ${MAX_MESSAGE_BYTES} bytes`}
                counterDanger={atLimit}
              />

              <div className="write-key-check">
                <DeskKey status={status} />
                {ready && (
                  <p className="text-body-small muted">
                    {also ? (
                      <>
                        Compare it with the fingerprint Sealed publishes on <a href={also.url}>{also.label}</a>. If it
                        differs, stop.
                      </>
                    ) : (
                      <>
                        Compare it with the fingerprint Sealed publishes in{" "}
                        <a href={`${config.sourceUrl}#desk-key-fingerprint`}>the repository README</a>. If it differs,
                        stop.
                      </>
                    )}
                  </p>
                )}
              </div>

              {sealError && (
                <Callout tone="warning" title="The tip could not be sealed" role="alert">
                  The crypto library did not load. Reload the page and try again. Your tip was not sent anywhere.
                </Callout>
              )}

              <div className="actions">
                <Button variant="primary" onClick={onSeal} disabled={empty || !ready || sealing}>
                  Seal and continue
                </Button>
                <TextLink to="/safety-check">Run the safety check</TextLink>
              </div>
              {empty && (
                <p className="text-body-small muted">
                  Write something first. The button turns on when your tip has at least one character.
                </p>
              )}
            </div>

            <aside className="ink-panel write-memo-panel" aria-labelledby="memo-panel-title">
              <p id="memo-panel-title" className="text-mono-eyebrow eyebrow">
                What the memo will hold
              </p>
              <MemoGrid
                mode="static"
                size="compact"
                bytes={bytes}
                handleRef={grid}
                label="512 squares stand for the 512-byte Zcash memo. Filled squares show how many bytes your tip uses."
              />
              <p className="text-body-small note">
                {atLimit
                  ? `Full. ${MAX_MESSAGE_BYTES} bytes is the most a Zcash memo can carry once it is sealed. Accented letters and emoji count as 2 to 4 bytes.`
                  : "Each square is one byte of the 512-byte Zcash memo. Sealing adds 48 bytes and turns the tip into text the desk alone can open."}
              </p>
              <p className="text-body-default-medium">Nothing has left this page.</p>
            </aside>
          </div>
        </div>
      </main>
      <SlimFooter />
    </div>
  );
}
