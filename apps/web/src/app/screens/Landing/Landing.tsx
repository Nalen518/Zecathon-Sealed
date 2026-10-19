import { useRef } from "react";
import { Button } from "../../../components/Button/Button";
import { Callout } from "../../../components/Callout/Callout";
import { Chip } from "../../../components/Chip/Chip";
import { FaqItem } from "../../../components/FaqItem/FaqItem";
import { Fingerprint } from "../../../components/Fingerprint/Fingerprint";
import { ListItem } from "../../../components/ListItem/ListItem";
import { MemoGrid } from "../../../components/MemoGrid/MemoGrid";
import { PermissionRow } from "../../../components/PermissionRow/PermissionRow";
import { SiteFooter } from "../../../components/SiteFooter/SiteFooter";
import { SiteHeader } from "../../../components/SiteHeader/SiteHeader";
import { Step } from "../../../components/Step/Step";
import { TextLink } from "../../../components/TextLink/TextLink";
import { bundled, type DeskStatus, type SealedConfig } from "../../../lib/config";
import { formatFingerprint } from "../../../lib/fingerprint";
import { formatZec } from "../../../lib/format";
import { MAX_MESSAGE_BYTES } from "../../../lib/memo";
import { EASE, gsap, revealOnScroll, ScrollTrigger, useMotion } from "../../../motion/gsap";
import { useDeskStatus } from "../../useDeskStatus";
import { TwoSides, useForDesksFocus } from "./TwoSides";
import "./Landing.css";

/**
 * Figma: Landing page / "Landing — Desktop 1280" (11:2). FR-6, FR-9, NFR-11.
 * Every value comes from the bundled config (D-08) or the build. Nothing is sent anywhere.
 */
export function Landing() {
  const main = useRef<HTMLElement>(null);
  useForDesksFocus();

  // D-67: the landing page carries the most motion. Reduced motion skips all of it (rules §7.4).
  useMotion(main, (root) => {
    const q = (s: string) => Array.from(root.querySelectorAll(s));
    gsap.from(q(".hero-text > *"), { opacity: 0, y: 16, duration: 0.6, ease: EASE, stagger: 0.08 });
    gsap.from(q(".hero .memo-grid-block"), { opacity: 0, y: 16, duration: 0.8, ease: EASE, delay: 0.25 });
    revealOnScroll(
      q(".section-heading, .two-columns > div, .permission-panel, .protects .button, .faq-item, .questions-list > .callout, .verify-key"),
    );
    revealOnScroll(q(".permission-row"), { y: 12, stagger: 0.06 });
    // "How it works": each step's top rule draws left to right as the steps arrive.
    const steps = q(".step");
    const row = root.querySelector(".steps");
    if (row && steps.length) {
      gsap.set(steps, { "--rule-scale": 0, opacity: 0, y: 16 });
      ScrollTrigger.create({
        trigger: row,
        start: "top 85%",
        once: true,
        onEnter: () =>
          gsap.to(steps, { "--rule-scale": 1, opacity: 1, y: 0, duration: 0.7, ease: EASE, stagger: 0.15 }),
      });
    }
  });

  // App only renders routes when the config parsed (App.tsx).
  if (!bundled.ok) return null;
  const config = bundled.config;
  const floor = formatZec(config.tipFloorZat);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteHeader network={config.network} />
      <main id="main" ref={main}>
        <Hero floor={floor} />
        <WhoItIsFor />
        <HowItWorks floor={floor} config={config} />
        <WhatItProtects />
        <Questions />
        <VerifyThisPage config={config} />
      </main>
      <SiteFooter network={config.network} />
    </>
  );
}

function Hero({ floor }: { floor: string }) {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="container hero-stack">
        <div className="hero-text">
          <p className="text-mono-eyebrow hero-eyebrow">Sealed · Shielded tip line</p>
          <h1 id="hero-title" className="text-display">
            Send a tip only the desk can read.
          </h1>
          <p className="text-body-lead hero-lead">
            Write your tip on this page. Your browser seals it, then you send it with a small shielded Zcash payment
            from your own wallet. No account, no email, no name needed.
          </p>
          <div className="hero-actions">
            <Button variant="inverse" to="/write">
              Write a tip
            </Button>
            <TextLink tone="inverse" to="/safety-check">
              Run the safety check
            </TextLink>
          </div>
          {/* D-99: the hero facts as chips (Figma Chips row in 11:24). */}
          <ul className="hero-chips" aria-label="At a glance">
            <li>
              <Chip icon="lock">Sealed in your browser</Chip>
            </li>
            <li>
              <Chip icon="coin">{`Tip floor ${floor} ZEC plus network fee`}</Chip>
            </li>
            <li>
              <Chip icon="eye-off">Your words never reach the server</Chip>
            </li>
          </ul>
        </div>
        <MemoGrid
          mode="loop"
          size="band"
          label="512 squares stand for the 512-byte Zcash memo. A sample tip fills them, then the whole memo turns into sealed text."
        />
      </div>
    </section>
  );
}

function WhoItIsFor() {
  return (
    <section className="section who" aria-labelledby="who-title">
      <div className="container stack-2xl">
        <div className="section-heading">
          <p className="text-mono-eyebrow eyebrow">Who this is for</p>
          <h2 id="who-title" className="text-heading-h2">
            Is this the right way to reach the desk?
          </h2>
        </div>
        <div className="two-columns">
          <div>
            <h3 className="text-body-default-medium">Use this if</h3>
            <ul>
              <ListItem type="include">You have information the desk should look into.</ListItem>
              <ListItem type="include">You have, or can get, a Zcash wallet that sends shielded payments.</ListItem>
              <ListItem type="include">You want your message readable only by the tip desk.</ListItem>
            </ul>
          </div>
          <div>
            <h3 className="text-body-default-medium">Use something else if</h3>
            <ul>
              <ListItem type="exclude">You are in immediate danger. Contact local emergency services.</ListItem>
              <ListItem type="exclude">
                You need to hide that you made contact at all. Use a SecureDrop or ask to meet a reporter.
              </ListItem>
              <ListItem type="exclude">You need to send files. A sealed tip holds about 330 characters of text.</ListItem>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorks({ floor, config }: { floor: string; config: SealedConfig }) {
  return (
    <section id="how-it-works" className="section how" aria-labelledby="how-title">
      <div className="container stack-2xl">
        <div className="section-heading">
          <p className="text-mono-eyebrow eyebrow">How it works</p>
          <h2 id="how-title" className="text-heading-h2">
            Three steps, in your browser and your wallet
          </h2>
        </div>
        <ol className="steps">
          <Step number="01" title="Write and seal">
            Type up to {MAX_MESSAGE_BYTES} bytes. Your browser locks the message with the desk’s public key before
            anything leaves the page.
          </Step>
          <Step number="02" title="Pay from your wallet">
            Scan the code or open the link. Your wallet sends {floor} ZEC to the desk’s shielded address with the
            sealed message attached.
          </Step>
          <Step number="03" title="The desk opens it">
            Only the desk’s browser holds the key that opens it. The server keeps the sealed text and never sees your
            words.
          </Step>
        </ol>
        <p className="text-body-default">
          Want a reply? Say how to reach you inside the message. The desk has no other way to find you.
        </p>
        <TwoSides config={config} />
      </div>
    </section>
  );
}

function WhatItProtects() {
  return (
    <section id="what-it-protects" className="section protects" aria-labelledby="protects-title">
      <div className="container stack-2xl">
        <div className="section-heading">
          <p className="text-mono-eyebrow eyebrow">What it protects</p>
          <h2 id="protects-title" className="text-heading-h2">
            What it protects, and what it does not
          </h2>
          <p className="text-body-lead lead">
            Sealed hides what you write. It cannot hide everything about you. Read this before you send.
          </p>
        </div>
        <div className="permission-panel">
          <p className="text-mono-eyebrow permission-panel-header" id="permission-panel-title">
            Who can see what
          </p>
          <ul aria-labelledby="permission-panel-title">
            <PermissionRow
              visibility="sealed"
              label="Your message"
              detail="Encrypted in your browser to the desk key. Only the desk can open it."
            />
            <PermissionRow
              visibility="sealed"
              label="Your address and the amount"
              detail="When you pay from a shielded balance, the chain does not show who paid or how much."
            />
            <PermissionRow
              visibility="visible"
              label="That a shielded payment happened"
              detail="Anyone can see that a transaction and its fee exist, not who sent it."
            />
            <PermissionRow
              visibility="visible"
              label="Arrival time and amount, to the server"
              detail="The desk’s server sees when a sealed tip arrives and what was paid. Never the words."
            />
            <PermissionRow
              visibility="not-protected"
              label="Where you bought your ZEC"
              detail="Exchanges keep purchase records tied to your identity."
            />
            <PermissionRow
              visibility="not-protected"
              label="Your device and network"
              detail="Use a device and connection you trust. Tor or a VPN hides your IP address from this page."
            />
            <PermissionRow
              visibility="not-protected"
              label="This page’s code"
              detail="If someone altered this page, they could read your tip. Check the fingerprint below."
            />
          </ul>
        </div>
        <div>
          <Button variant="secondary" to="/safety-check">
            Run the safety check
          </Button>
        </div>
      </div>
    </section>
  );
}

function Questions() {
  return (
    <section id="questions" className="section questions" aria-labelledby="questions-title">
      <div className="container questions-columns">
        <div className="section-heading">
          <p className="text-mono-eyebrow eyebrow">Questions</p>
          <h2 id="questions-title" className="text-heading-h2">
            Common questions
          </h2>
        </div>
        <div className="questions-list">
          <div>
            <FaqItem question="Do I need to give my name?" defaultExpanded>
              No. Write only what you choose to share. If you want a reply, say how to reach you inside the sealed
              message.
            </FaqItem>
            <FaqItem question="Why do I have to pay?">
              The payment carries your sealed message and makes bulk spam costly.
            </FaqItem>
            <FaqItem question="Which wallets work?">Any Zcash wallet that sends shielded payments with a memo.</FaqItem>
            <FaqItem question="Can the desk reply to me?">Not through this page yet.</FaqItem>
            <FaqItem question="Does this replace SecureDrop?">
              No. SecureDrop protects your network identity better.
            </FaqItem>
          </div>
          <Callout tone="warning" title="The desk will never ask you to pay more">
            The desk will never contact you first, ask for a larger amount, or ask for your wallet’s recovery phrase.
            Anyone who does is not the desk.
          </Callout>
        </div>
      </div>
    </section>
  );
}

function VerifyThisPage({ config }: { config: SealedConfig }) {
  const status = useDeskStatus();
  const readme = `${config.sourceUrl}#desk-key-fingerprint`;

  return (
    <section id="verify" className="section verify" aria-labelledby="verify-title">
      <div className="container verify-columns">
        <div className="section-heading verify-heading">
          <p className="text-mono-eyebrow eyebrow">Verify this page</p>
          <h2 id="verify-title" className="text-heading-h2">
            Check the desk key before you send
          </h2>
          <p className="text-body-lead lead">
            This page seals your tip to the key below. Sealed also publishes this fingerprint in{" "}
            <a href={readme}>the repository README</a>
            {config.fingerprintAlsoOn && (
              <>
                {" "}
                and on <a href={config.fingerprintAlsoOn.url}>{config.fingerprintAlsoOn.label}</a>
              </>
            )}
            . If they do not match, do not send.
          </p>
        </div>
        <div className="verify-key">
          <DeskKey status={status} />
          <div>
            <Button variant="primary" to="/write">
              Write a tip
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

/** The fingerprint, or why there is none. States not drawn in Figma are listed in decisions.md (D-37). */
function DeskKey({ status }: { status: DeskStatus | null }) {
  if (status === null) {
    return (
      <p className="text-body-small verify-checking" role="status">
        Checking the desk key.
      </p>
    );
  }
  if (status.kind === "ready") {
    const display = formatFingerprint(status.config.fingerprint);
    return <Fingerprint label="Desk key fingerprint" value={display} />;
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
