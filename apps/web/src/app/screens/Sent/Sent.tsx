import { Navigate, useNavigate } from "react-router";
import { Button } from "../../../components/Button/Button";
import { FlowHeader } from "../../../components/FlowHeader/FlowHeader";
import { SlimFooter } from "../../../components/SlimFooter/SlimFooter";
import { StepIndicator } from "../../../components/StepIndicator/StepIndicator";
import { Tag } from "../../../components/Tag/Tag";
import { TextLink } from "../../../components/TextLink/TextLink";
import { bundled } from "../../../lib/config";
import { formatZec } from "../../../lib/format";
import { useTipFlow } from "../../flow/TipFlow";
import { SENDER_STEPS } from "../Write/Write";
import "../AppScreen.css";
import "./Sent.css";

/** Figma: Sender screens / Pay — Sent. "I've sent it" only changes the screen. The tip is already wiped. */
export function Sent() {
  const navigate = useNavigate();
  const flow = useTipFlow();
  if (!bundled.ok) return null;
  if (!flow.sent) return <Navigate to="/write" replace />;
  const config = bundled.config;

  return (
    <div className="app-page">
      <FlowHeader network={config.network} confirmLeave={false} onLeave={() => navigate("/")} />
      <main id="main" className="app-main">
        <div className="container app-stack">
          <StepIndicator steps={SENDER_STEPS} current={3} />
          <section className="card sent-card" aria-labelledby="sent-title">
            <div>
              <Tag tone="success">Sent from your wallet</Tag>
            </div>
            <h1 id="sent-title" className="text-heading-h2">
              Sent. Only the desk can read it.
            </h1>
            <p className="text-body-lead muted">
              Your tip reaches the desk after about 3 block confirmations, usually a few minutes.
            </p>
            <dl className="sent-items">
              <div>
                <dt className="text-body-default-medium">Nothing to keep</dt>
                <dd className="text-body-default muted">
                  This page stored nothing. Closing it removes the sealed tip from your screen.
                </dd>
              </div>
              <div>
                <dt className="text-body-default-medium">Your wallet history</dt>
                <dd className="text-body-default muted">
                  It shows a payment of {formatZec(config.tipFloorZat)} ZEC with a memo nobody but the desk can read.
                </dd>
              </div>
              <div>
                <dt className="text-body-default-medium">If you asked for a reply</dt>
                <dd className="text-body-default muted">
                  Watch the channel you named in your tip. The desk cannot find you any other way.
                </dd>
              </div>
            </dl>
            <div className="actions">
              <Button
                variant="secondary"
                showIcon={false}
                onClick={() => {
                  flow.discard();
                  navigate("/", { replace: true });
                }}
              >
                Clear this page
              </Button>
              <TextLink href="/#what-it-protects">Read what Sealed does not protect</TextLink>
            </div>
          </section>
        </div>
      </main>
      <SlimFooter />
    </div>
  );
}
