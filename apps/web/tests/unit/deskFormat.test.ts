import { describe, expect, it } from "vitest";
import { auditView } from "../../src/app/desk/auditDisplay";
import { formatAge, formatWhen, parseZec, shortTxid } from "../../src/app/desk/format";

describe("desk display helpers", () => {
  const now = new Date(2026, 9, 13, 18, 0, 0);
  it("formats times like the Figma rows, on a 24-hour clock", () => {
    expect(formatWhen(new Date(2026, 9, 13, 14, 2).toISOString(), now)).toMatch(/^Today, 14[:.]02$/);
    expect(formatWhen(new Date(2026, 9, 12, 22, 15).toISOString(), now)).toMatch(/^Yesterday, 22[:.]15$/);
    expect(formatWhen(new Date(2026, 9, 9, 11, 20).toISOString(), now)).toMatch(/, 11[:.]20$/);
  });
  it("parses typed ZEC amounts into zatoshis", () => {
    expect(parseZec("0.001")).toBe(100_000);
    expect(parseZec(" 1 ")).toBe(100_000_000);
    expect(parseZec("0.00000001")).toBe(1);
    for (const bad of ["", "abc", "0.000000001", "-1", "1e3", "0,001"]) expect(parseZec(bad), bad).toBeNull();
  });
  it("shortens tx ids and ages", () => {
    expect(shortTxid("3f9a" + "0".repeat(56) + "c21e")).toBe("3f9a…c21e");
    expect(formatAge("2026-10-13T10:00:00Z", Date.parse("2026-10-13T10:00:12Z"))).toBe("12 s");
    expect(formatAge("2026-10-13T10:00:00Z", Date.parse("2026-10-13T10:03:00Z"))).toBe("3 min");
  });
  it("shows chain servers by host name only and never raw JSON", () => {
    const v = auditView({ seq: 7, at: "2026-10-12T22:30:00Z", type: "source_up", actor: "watcher", details: { origin: "https://testnet.zec.rocks:443" }, prev_hash: "", hash: "0b6f" + "0".repeat(56) + "91de" });
    expect(v).toMatchObject({ seq: "#7", event: "Chain server back", details: "testnet.zec.rocks answering again", by: "Watcher", hash: "0b6f…91de" });
    const odd = auditView({ seq: "x", type: "tip_received", details: { amount_zat: "lots", txid: 5 } });
    expect(odd).toMatchObject({ seq: "#?", event: "Tip received", details: "" });
  });
});
