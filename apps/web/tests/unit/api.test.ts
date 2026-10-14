import { describe, expect, it } from "vitest";
import auditChain from "../../../../contracts/fixtures/audit_chain.json";
import errorDemoLocked from "../../../../contracts/fixtures/error_demo_locked.json";
import errorSpendKey from "../../../../contracts/fixtures/error_spend_key.json";
import health from "../../../../contracts/fixtures/health.json";
import inbox from "../../../../contracts/fixtures/inbox.json";
import tip from "../../../../contracts/fixtures/tip.json";
import tipsPage from "../../../../contracts/fixtures/tips_page.json";
import token from "../../../../contracts/fixtures/token.json";
import {
  ApiError,
  parseAuditPage,
  parseError,
  parseHealth,
  parseInbox,
  parseTip,
  parseTipsPage,
  parseToken,
  SealedApi,
} from "../../src/lib/api";

// api-contract §10.2: the client parses every shared fixture with the same validator it uses live.
describe("contract fixtures parse", () => {
  it("inbox.json", () => expect(parseInbox(inbox).fingerprint).toBe(inbox.fingerprint));
  it("tip.json", () => expect(parseTip(tip).displayStatus).toBe("confirmed"));
  it("tips_page.json", () => {
    const page = parseTipsPage(tipsPage);
    expect(page.tips).toHaveLength(2);
    expect(page.tips[1]!.height).toBeNull();
    expect(page.tips[1]!.memoB64).toBeNull();
    expect(page.counts).toEqual({ visible: 1, belowFloor: 1 });
  });
  it("health.json", () => expect(parseHealth(health).sources).toHaveLength(2));
  it("audit_chain.json (page)", () => {
    const page = parseAuditPage(auditChain.page);
    expect(page.entries).toHaveLength(3);
    // Raw objects, untouched: snake_case keys and every field as received.
    expect(page.entries[0]).toEqual(auditChain.page.entries[0]);
  });
  it("token.json", () => expect(parseToken(token).token.startsWith("sld_")).toBe(true));
  it("error_spend_key.json", () => {
    const e = parseError(errorSpendKey, 422, null);
    expect(e.code).toBe("spend_key_rejected");
    expect(e.field).toBe("ufvk");
  });
  it("error_demo_locked.json (C-24)", () => {
    const e = parseError(errorDemoLocked, 403, null);
    expect(e.code).toBe("demo_locked");
    expect(e.field).toBeUndefined();
  });
});

describe("validation rejects contract breaks", () => {
  it("an unknown display_status", () => {
    expect(() => parseTip({ ...tip, display_status: "spam" })).toThrow(ApiError);
  });
  it("a numeric string amount", () => {
    expect(() => parseTip({ ...tip, amount_zat: "100000" })).toThrow(ApiError);
  });
  it("a non RFC 3339 time", () => {
    expect(() => parseInbox({ ...inbox, created_at: "11/10/2026" })).toThrow(ApiError);
  });
  it("a chain server named by more than its origin (C-14)", () => {
    const withSource = (origin: string) => ({ ...health, sources: [{ ...health.sources[0], origin }] });
    expect(parseHealth(withSource("https://testnet.zec.rocks:443")).sources[0]!.origin).toBe("https://testnet.zec.rocks:443");
    expect(parseHealth(withSource("https://testnet.zec.rocks")).sources[0]!.origin).toBe("https://testnet.zec.rocks");
    for (const bad of [
      "https://user:pass@testnet.zec.rocks:443",
      "https://testnet.zec.rocks:443/?key=secret",
      "https://testnet.zec.rocks:443/private/path",
      "https://testnet.zec.rocks:443#frag",
      "testnet.zec.rocks",
    ]) {
      expect(() => parseHealth(withSource(bad)), bad).toThrow(ApiError);
    }
  });
  it("an unknown error code becomes bad_response", () => {
    expect(parseError({ error: { code: "teapot", message: "x" } }, 418, null).code).toBe("bad_response");
  });
});

describe("requests follow the contract", () => {
  function recorder(status: number, body: unknown, headers: Record<string, string> = {}) {
    const calls: { url: string; init: RequestInit }[] = [];
    const impl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
    }) as unknown as typeof fetch;
    return { calls, impl };
  }

  it("tips uses after_seq, the bearer header, no-store and omits credentials", async () => {
    const r = recorder(200, tipsPage);
    const api = new SealedApi("https://api.example.test/v1", r.impl);
    await api.tips("desk", "sld_secret", { afterSeq: 1042, filter: "all" });
    const call = r.calls[0]!;
    expect(call.url).toBe("https://api.example.test/v1/inbox/desk/tips?after_seq=1042&filter=all");
    expect(call.url).not.toContain("sld_secret");
    expect((call.init.headers as Record<string, string>).Authorization).toBe("Bearer sld_secret");
    expect(call.init.cache).toBe("no-store");
    expect(call.init.credentials).toBe("omit");
  });

  it("create sends the setup secret header and snake_case fields only", async () => {
    const r = recorder(201, inbox);
    const api = new SealedApi("https://api.example.test/v1", r.impl);
    await api.createInbox(
      {
        id: "desk",
        name: "Sealed",
        deskPublicKey: inbox.desk_public_key,
        fingerprint: inbox.fingerprint,
        address: inbox.address,
        ufvk: "uviewtest1abc",
        tipFloorZat: 100000,
      },
      "setup-secret",
    );
    const init = r.calls[0]!.init;
    expect((init.headers as Record<string, string>)["X-Setup-Secret"]).toBe("setup-secret");
    expect(Object.keys(JSON.parse(init.body as string)).sort()).toEqual(
      ["address", "desk_public_key", "fingerprint", "id", "name", "tip_floor_zat", "ufvk"].sort(),
    );
  });

  it("delete sends both the token and the setup secret and accepts 204", async () => {
    const r = recorder(204, null);
    const api = new SealedApi("https://api.example.test/v1", r.impl);
    await expect(api.deleteInbox("desk", "sld_t", "secret")).resolves.toBeUndefined();
    const h = r.calls[0]!.init.headers as Record<string, string>;
    expect(h.Authorization).toBe("Bearer sld_t");
    expect(h["X-Setup-Secret"]).toBe("secret");
  });

  it("audit pages from after_seq=0 while has_more, with the bearer header", async () => {
    const calls: string[] = [];
    const first = { ...auditChain.page, entries: auditChain.page.entries.slice(0, 2), next_seq: 2, has_more: true };
    const second = { ...auditChain.page, entries: auditChain.page.entries.slice(2), next_seq: 3, has_more: false };
    const impl = (async (url: string, init: RequestInit) => {
      calls.push(url);
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sld_t");
      return new Response(JSON.stringify(calls.length === 1 ? first : second), { status: 200 });
    }) as unknown as typeof fetch;
    const all = await new SealedApi("https://api.example.test/v1", impl).auditAll("desk", "sld_t");
    expect(all).toHaveLength(3);
    expect(calls).toEqual([
      "https://api.example.test/v1/inbox/desk/audit?after_seq=0&limit=500",
      "https://api.example.test/v1/inbox/desk/audit?after_seq=2&limit=500",
    ]);
  });

  it("maps a 429 with Retry-After", async () => {
    const r = recorder(429, { error: { code: "rate_limited", message: "slow down" } }, { "Retry-After": "30" });
    const api = new SealedApi("https://api.example.test/v1", r.impl);
    await expect(api.health()).rejects.toMatchObject({ code: "rate_limited", retryAfterSeconds: 30 });
  });

  it("refuses to call when no API is configured", async () => {
    await expect(new SealedApi("").health()).rejects.toMatchObject({ code: "not_configured" });
  });
});
