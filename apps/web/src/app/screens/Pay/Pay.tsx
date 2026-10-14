import { useMemo, useRef } from "react";
import { EASE, gsap, QUICK, useMotion } from "../../../motion/gsap";
import { Navigate, useNavigate } from "react-router";
import { Button } from "../../../components/Button/Button";
import { Callout } from "../../../components/Callout/Callout";
import { Fingerprint } from "../../../components/Fingerprint/Fingerprint";
import { FlowHeader } from "../../../components/FlowHeader/FlowHeader";
import { Icon } from "../../../components/Icon/Icon";
import { MemoGrid } from "../../../components/MemoGrid/MemoGrid";
import { QrCode } from "../../../components/QrCode/QrCode";
import { SlimFooter } from "../../../components/SlimFooter/SlimFooter";
import { StepIndicator } from "../../../components/StepIndicator/StepIndicator";
import { TextLink } from "../../../components/TextLink/TextLink";
import { bundled } from "../../../lib/config";
import { formatZec } from "../../../lib/format";
import { MAX_MESSAGE_BYTES, SEALED_MEMO_BYTES, ZIP317_MIN_FEE_ZAT } from "../../../lib/memo";
import { buildPaymentUri } from "../../../lib/zip321";
import { useTipFlow } from "../../flow/TipFlow";
import { FaucetLine } from "../../OutboundLinks";
import { SENDER_STEPS } from "../Write/Write";
import "../AppScreen.css";
import "./Pay.css";

/**
 * Figma: Sender screens / Pay — Default. FR-4, FR-5.
 * The ZIP 321 link and QR code are built in the browser from the bundled config and the sealed memo.
 * The page never learns whether the sender paid, by design.
 */
export function Pay() {
  const navigate = useNavigate();
  const flow = useTipFlow();
  const config = bundled.ok ? bundled.config : null;
  const sealed = flow.sealed;

  const main = useRef<HTMLElement>(null);
  // Light motion (D-67): the payment options arrive in reading order, then the checks tick in. The warning stays still.
  useMotion(main, (root) => {
    const q = (s: string) => Array.from(root.querySelectorAll(s));
    gsap.from(q(".qr-code, .pay-open, .pay-left > .card, .pay-confirm"), { opacity: 0, y: 12, duration: QUICK, ease: EASE, stagger: 0.06 });
    gsap.from(q(".pay-checks li"), { opacity: 0, x: -8, duration: QUICK, ease: EASE, stagger: 0.08, delay: 0.2 });
  });

  // Set only by the "I've sent it" click on this visit. A later visit (browser Back) goes to Write instead.
  const justSent = useRef(false);

  const uri = useMemo(
    () =>
      config && sealed
        ? buildPaymentUri({ address: config.address, amountZat: config.tipFloorZat, memoBytes: sealed.memoBytes })
        : null,
    [config, sealed],
  );

  if (!config) return null;
  // "I've sent it" wipes the sealed tip and navigates in the same click. Render nothing in between.
  if (justSent.current) return null;
  if (!sealed || !uri) return <Navigate to="/write" replace />;

  const amount = formatZec(config.tipFloorZat);
  const memoPreview = `${sealed.memoText.slice(0, 12)}…${sealed.memoText.slice(-8)}`;

  return (
    <div className="app-page">
      <FlowHeader
        network={config.network}
        confirmLeave
        onLeave={() => {
          flow.discard();
          navigate("/");
        }}
      />
      <main id="main" className="app-main" ref={main}>
        <div className="container app-stack">
          <StepIndicator steps={SENDER_STEPS} current={2} />
          <div className="app-heading">
            <h1 className="text-heading-h2">Pay from your wallet</h1>
            <p className="text-body-lead lead">
              Your wallet sends {amount} ZEC to the desk with the sealed tip as the memo. This page cannot see or touch
              your wallet.
            </p>
          </div>

          <div className="pay-columns">
            <div className="pay-left">
              <div className="pay-qr-and-link">
                <QrCode value={uri} label={`Payment request: ${amount} ZEC to the desk with the sealed tip as the memo`} />
                <div className="pay-open">
                  <h2 className="text-body-default-medium">On a phone or a computer with a wallet</h2>
                  <p className="text-body-default">
                    Scan the code with your wallet, or open the payment link on this device.
                  </p>
                  <div>
                    <Button variant="primary" href={uri}>
                      Open in wallet
                    </Button>
                  </div>
                  <p className="text-body-small muted">
                    Some wallets drop the memo from links. If the memo field is empty in your wallet, use the three
                    fields below.
                  </p>
                </div>
              </div>

              <section className="card" aria-labelledby="copy-fallback-title">
                <h2 id="copy-fallback-title" className="text-heading-h3">
                  Or copy three fields into your wallet’s send screen
                </h2>
                <Fingerprint label="1 · Address (shielded)" value={config.address} />
                <Fingerprint label="2 · Amount (ZEC)" value={amount} />
                <Fingerprint
                  label={`3 · Memo (sealed, ${SEALED_MEMO_BYTES} bytes)`}
                  value={memoPreview}
                  copyValue={sealed.memoText}
                />
              </section>
            </div>

            <aside className="ink-panel pay-confirm" aria-labelledby="pay-confirm-title">
              <p id="pay-confirm-title" className="text-mono-eyebrow eyebrow">
                Check in your wallet before you confirm
              </p>
              <MemoGrid
                mode="static"
                size="compact"
                bytes={MAX_MESSAGE_BYTES}
                sealed
                label="The sealed memo fills 511 of the 512 squares of the Zcash memo."
              />
              <ul className="pay-checks">
                <li>
                  <Icon name="check" />
                  <span className="text-body-default">The amount is {amount} ZEC.</span>
                </li>
                <li>
                  <Icon name="check" />
                  <span className="text-body-default">The memo starts with z1: and is not empty.</span>
                </li>
                <li>
                  <Icon name="check" />
                  <span className="text-body-default">You pay from a shielded balance, not a transparent one.</span>
                </li>
              </ul>
              <p className="text-body-small note">
                Cost: {amount} ZEC to the desk, plus the network fee your wallet adds (at least{" "}
                {formatZec(ZIP317_MIN_FEE_ZAT)} ZEC).
              </p>
              <FaucetLine url={config.faucetUrl} />
            </aside>
          </div>

          <Callout tone="warning" title="Keep this tab open until your wallet confirms" className="pay-callout">
            The sealed tip lives only in this tab. If you close it before paying, it is gone and you write it again.
            Nothing is saved anywhere.
          </Callout>

          <div className="actions">
            <Button
              variant="secondary"
              onClick={() => {
                justSent.current = true;
                flow.markSent();
                navigate("/sent");
              }}
            >
              I’ve sent it
            </Button>
            <TextLink to="/write">Back to edit the tip</TextLink>
          </div>
        </div>
      </main>
      <SlimFooter />
    </div>
  );
}
