import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExplorerLine, FaucetLine } from "../../src/app/OutboundLinks";
import { AuditRow } from "../../src/components/AuditRow/AuditRow";
import { NetworkBadge } from "../../src/components/NetworkBadge/NetworkBadge";
import { bundled, parseConfig } from "../../src/lib/config";

/** D-81 to D-84: testnet explorer and faucet links, config driven, gone on mainnet. */

const EXPLORER = "https://testnet.zecblock.com/";
const FAUCET = "https://faucet.testnet.valargroup.dev/";

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
    test: { explorer_url: EXPLORER, faucet_url: FAUCET },
    main: { explorer_url: null, faucet_url: null },
  },
};

const links = (r: ReturnType<typeof parseConfig>) =>
  r.ok ? { explorer: r.config.explorerUrl, faucet: r.config.faucetUrl } : r.errors;

describe("outbound_links in sealed.config.json", () => {
  it("the bundled config has both links on testnet", () => {
    expect(bundled.ok && bundled.config.network).toBe("test");
    expect(links(bundled)).toEqual({ explorer: EXPLORER, faucet: FAUCET });
  });

  it("testnet picks the test links, mainnet gets null", () => {
    expect(links(parseConfig(base))).toEqual({ explorer: EXPLORER, faucet: FAUCET });
    expect(links(parseConfig({ ...base, network: "main" }))).toEqual({ explorer: null, faucet: null });
  });

  it("missing outbound_links means no links", () => {
    const { outbound_links: _, ...rest } = base;
    expect(links(parseConfig(rest))).toEqual({ explorer: null, faucet: null });
  });

  it("only https URLs are accepted", () => {
    for (const bad of ["http://testnet.zecblock.com/", "javascript:alert(1)", "not a url", "https://user:pw@example.com/", 5]) {
      const r = parseConfig({ ...base, outbound_links: { ...base.outbound_links, test: { explorer_url: bad, faucet_url: FAUCET } } });
      expect(r.ok).toBe(false);
    }
  });

  it("a mainnet link is refused, because outbound links are testnet only", () => {
    const r = parseConfig({ ...base, outbound_links: { ...base.outbound_links, main: { explorer_url: EXPLORER, faucet_url: null } } });
    expect(r.ok).toBe(false);
    expect(r.ok ? [] : r.errors.join(" ")).toMatch(/outbound_links\.main\.explorer_url must be null/);
  });
});

describe("FaucetLine and ExplorerLine", () => {
  it("render a new-tab link with noopener noreferrer on testnet", () => {
    const faucet = renderToStaticMarkup(<FaucetLine url={FAUCET} />);
    expect(faucet).toContain("Need testnet ZEC?");
    expect(faucet).toContain(`href="${FAUCET}"`);
    expect(faucet).toContain('target="_blank"');
    expect(faucet).toContain('rel="noopener noreferrer"');
    expect(faucet).toContain("Get free TAZ from the faucet");

    const explorer = renderToStaticMarkup(<ExplorerLine url={EXPLORER} />);
    expect(explorer).toContain("See what the chain shows.");
    expect(explorer).toContain(`href="${EXPLORER}"`);
    expect(explorer).toContain('target="_blank"');
    expect(explorer).toContain('rel="noopener noreferrer"');
    expect(explorer).toContain("Open the testnet explorer");
  });

  it("render nothing when the URL is null (mainnet)", () => {
    expect(renderToStaticMarkup(<FaucetLine url={null} />)).toBe("");
    expect(renderToStaticMarkup(<ExplorerLine url={null} />)).toBe("");
  });

  it("follow the copy rule: no dashes or semicolons", () => {
    const text = renderToStaticMarkup(<><FaucetLine url={FAUCET} /><ExplorerLine url={EXPLORER} /></>);
    expect(text).not.toMatch(/[—–;]/);
  });
});

describe("Audit row copy button", () => {
  const row = (txid: string | null) =>
    renderToStaticMarkup(
      <table>
        <tbody>
          <AuditRow seq="#10" when="Today, 14:02" event="Tip received" details="0.001 ZEC" txid={txid} by="Watcher" hash="9c41…e07b" broken={false} />
        </tbody>
      </table>,
    );

  it("shows a copy button only when the entry has a transaction id, and never a link", () => {
    const withTx = row("3f9a" + "0".repeat(56) + "c21e");
    expect(withTx).toContain('aria-label="Copy transaction id"');
    expect(withTx).not.toContain("<a ");
    expect(row(null)).not.toContain("Copy transaction id");
  });
});

describe("Network badge", () => {
  it("is the text label only, with no dot (D-81)", () => {
    const html = renderToStaticMarkup(<NetworkBadge network="test" />);
    expect(html).not.toContain("icon");
    expect(html).toContain("Testnet");
  });
});
