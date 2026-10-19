/**
 * Safety check content (FR-10). Pure data, no network, no storage (D-20).
 * Question 1 and the three result texts marked "Figma" are copied from the Figma frames.
 * Everything else is new copy written from the PRD threat model (§7) and is listed in decisions.md (D-43).
 */

export type Risk = "warning" | "ok";

export interface Option {
  value: string;
  label: string;
  hint: string;
  risk: Risk;
  result: { title: string; body: string };
}

export interface Question {
  id: "funding" | "timing" | "network";
  question: string;
  lead: string;
  options: Option[];
}

const NOT_SURE_HINT = "The result shows the safest steps.";

export const QUESTIONS: Question[] = [
  {
    id: "funding",
    question: "Where did the ZEC in your wallet come from?",
    lead: "The payment itself is shielded. The way the ZEC got into your wallet may not be.",
    options: [
      {
        value: "exchange",
        label: "I bought it on an exchange with my ID",
        hint: "Exchanges keep records that link you to this ZEC.",
        risk: "warning",
        // Figma
        result: {
          title: "Your ZEC came from an exchange with your ID",
          body: "Move it into a shielded balance first, wait a few days, and send an amount that differs from what you bought, so the amounts and times do not line up.",
        },
      },
      {
        value: "someone",
        label: "Someone sent it to me",
        hint: "They know the amount and time they sent it.",
        risk: "warning",
        result: {
          title: "Someone else knows where your ZEC came from",
          body: "The sender knows the amount and the time. Move it into a shielded balance first and wait a few days before you send.",
        },
      },
      {
        value: "shielded",
        label: "It has been in a shielded balance for weeks",
        hint: "Older shielded funds are harder to link to a new payment.",
        risk: "ok",
        result: {
          title: "Your ZEC has been shielded for weeks",
          body: "Older shielded funds are harder to link to a new payment.",
        },
      },
      {
        value: "unsure",
        label: "I am not sure",
        hint: NOT_SURE_HINT,
        risk: "warning",
        result: {
          title: "You are not sure where your ZEC came from",
          body: "Treat it as traceable. Move it into a shielded balance first, wait a few days, and send an amount that differs from what you received.",
        },
      },
    ],
  },
  {
    id: "timing",
    question: "When did you last move this ZEC?",
    lead: "A tip sent right after a purchase or a transfer is easier to match to it.",
    options: [
      {
        value: "today",
        label: "Today, just before writing this",
        hint: "The amounts and times may line up with the tip.",
        risk: "warning",
        result: {
          title: "You moved the ZEC very recently",
          body: "Wait a few days before you send, so the tip is harder to match to that transfer.",
        },
      },
      {
        value: "days",
        label: "A few days ago or more",
        hint: "Time between moves makes matching harder.",
        risk: "ok",
        // Figma
        result: {
          title: "Timing looks fine",
          body: "You moved the ZEC days ago, so the tip is harder to match to that transfer.",
        },
      },
      {
        value: "unsure",
        label: "I am not sure",
        hint: NOT_SURE_HINT,
        risk: "warning",
        result: {
          title: "You are not sure when you moved the ZEC",
          body: "Wait a few days after any transfer before you send, so the tip is harder to match to it.",
        },
      },
    ],
  },
  {
    id: "network",
    question: "How are you connected right now?",
    lead: "This page and wallet servers can see your IP address. The sealed tip itself cannot reveal it.",
    options: [
      {
        value: "shared",
        label: "A work, school or shared network",
        hint: "The owner of the network may log the sites you visit.",
        risk: "warning",
        // Figma
        result: {
          title: "You are on a work or shared network",
          body: "Use your own device on a connection you trust. Tor or a VPN hides your IP address from this page and from wallet servers.",
        },
      },
      {
        value: "own",
        label: "My own connection at home or on my phone",
        hint: "Your internet provider can see which sites you visit.",
        risk: "warning",
        result: {
          title: "Your internet provider can see this visit",
          body: "Your provider can see that you opened this page and a wallet server. Tor or a VPN hides that.",
        },
      },
      {
        value: "tor",
        label: "Tor or a VPN I trust",
        hint: "Hides your IP address from this page and from wallet servers.",
        risk: "ok",
        result: {
          title: "Your IP address is hidden",
          body: "Keep using Tor or the VPN until your wallet confirms the payment.",
        },
      },
      {
        value: "unsure",
        label: "I am not sure",
        hint: NOT_SURE_HINT,
        risk: "warning",
        result: {
          title: "You are not sure how you are connected",
          body: "Use your own device on a connection you trust. Tor or a VPN hides your IP address from this page and from wallet servers.",
        },
      },
    ],
  },
];

const COUNT_WORDS = ["Nothing", "One thing", "Two things", "Three things"];

/** "Two things to change before you send" (Figma) and its 0, 1 and 3 variants. */
export function resultTitle(warnings: number): string {
  return `${COUNT_WORDS[warnings] ?? `${warnings} things`} to change before you send`;
}
