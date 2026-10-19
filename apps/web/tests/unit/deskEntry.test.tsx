import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { JudgeCallout } from "../../src/app/desk/screens/Locked";
import { JudgeBox, TwoSides } from "../../src/app/screens/Landing/TwoSides";
import { IconCopyButton } from "../../src/components/IconCopyButton/IconCopyButton";
import { TextLink } from "../../src/components/TextLink/TextLink";
import { bundled, parseConfig, type SealedConfig } from "../../src/lib/config";

/** D-87 to D-90: For desks, the Two sides block, the judge kit behind demo_desk, Text link Size=Small. */

const base = {
  network: "test",
  inbox_id: "desk",
  name: "Sealed",
  api_base_url: "",
  desk_public_key: "",
  fingerprint: "",
  address: "",
  tip_floor_zat: 100000,
  source_url: "https://github.com/Nalen518/Zecathon-Sealed",
  fingerprint_also_on: null,
  outbound_links: {
    test: { explorer_url: "https://testnet.zecblock.com/", faucet_url: "https://faucet.testnet.valargroup.dev/" },
    main: { explorer_url: null, faucet_url: null },
  },
};

function config(over: Record<string, unknown>): SealedConfig {
  const r = parseConfig({ ...base, ...over });
  if (!r.ok) throw new Error(r.errors.join(", "));
  return r.config;
}

const html = (node: ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);

describe("demo_desk in sealed.config.json", () => {
  it("ships off in the bundled config", () => {
    expect(bundled.ok && bundled.config.demoDesk).toBe(false);
  });

  it("is false when missing and follows the value when set on testnet", () => {
    expect(config({}).demoDesk).toBe(false);
    expect(config({ demo_desk: true }).demoDesk).toBe(true);
  });

  it("refuses true on mainnet, so a shared demo key can never take real tips", () => {
    const r = parseConfig({ ...base, network: "main", demo_desk: true });
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.errors.join(" ")).toMatch(/demo_desk must be false on main/);
    expect(parseConfig({ ...base, network: "main", demo_desk: false }).ok).toBe(true);
  });

  it("refuses anything but a boolean", () => {
    expect(parseConfig({ ...base, demo_desk: "yes" }).ok).toBe(false);
  });
});

describe("Judge box and restore callout", () => {
  it("render with demo_desk true on testnet", () => {
    const box = html(<JudgeBox config={config({ demo_desk: true })} />);
    expect(box).toContain("Judging Sealed? Try both sides.");
    expect(box).toContain("tips are already waiting in the demo desk.");
    expect(box).toContain("Testnet only");
    expect(box).toContain('href="https://faucet.testnet.valargroup.dev/"');
    expect(box).toContain('rel="noopener noreferrer"');
    expect(box).toContain('href="/desk/restore"');
    expect(box).toContain("Restore the demo desk");

    const callout = html(<JudgeCallout demoDesk />);
    expect(callout).toContain("Judging Sealed?");
    expect(callout).toContain("It works on testnet only.");
  });

  it("are absent with demo_desk false", () => {
    expect(html(<JudgeBox config={config({ demo_desk: false })} />)).toBe("");
    expect(html(<JudgeCallout demoDesk={false} />)).toBe("");
    expect(html(<TwoSides config={config({})} />)).not.toContain("Judging Sealed?");
  });
});

describe("Two sides block", () => {
  const block = html(<TwoSides config={config({ demo_desk: true })} />);

  it("has the #for-desks anchor, an H2 title and both cards", () => {
    expect(block).toContain('id="for-desks"');
    expect(block).toMatch(/<h2[^>]*>One page for sources\. One desk that holds the key\.<\/h2>/);
    expect(block).toContain('href="/write"');
    expect(block).toContain('href="/desk"');
    expect(block).toContain('href="https://github.com/Nalen518/Zecathon-Sealed#run-your-own-desk"');
  });

  it("follows the copy rule: no dashes or semicolons", () => {
    const text = block.replace(/<[^>]+>/g, " ");
    expect(text).not.toMatch(/[—–;]/);
  });
});

describe("Text link and icon copy button", () => {
  it("Text link Size=Small uses Body/Small Medium", () => {
    expect(html(<TextLink size="small" href="/x">Link</TextLink>)).toContain("text-body-small-medium");
    expect(html(<TextLink href="/x">Link</TextLink>)).toContain("text-body-default-medium");
  });

  it("the copy button has its label and a tooltip with the same text", () => {
    const b = html(<IconCopyButton value="abc" label="Copy transaction id" />);
    expect(b).toContain('aria-label="Copy transaction id"');
    expect(b).toMatch(/icon-copy-tooltip[^>]*>Copy transaction id</);
  });
});
