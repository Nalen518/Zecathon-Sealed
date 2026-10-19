import canonicalizeReference from "canonicalize";
import { describe, expect, it } from "vitest";
import chain from "../../../../contracts/fixtures/audit_chain.json";
import tampered from "../../../../contracts/fixtures/audit_chain_tampered.json";
import { canonicalize, CanonicalError, entryHash, exportAudit, GENESIS_HASH, verifyChain } from "../../src/lib/audit";
import { sodiumReady } from "../../src/lib/sodium";

type Raw = Record<string, unknown>;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const entries = (): Raw[] => clone(chain.page.entries) as Raw[];

/** Re-hash an entry after a deliberate edit, as a forger with database access would. */
async function rehash(e: Raw): Promise<Raw> {
  return { ...e, hash: await entryHash(e) };
}

// api-contract §5.6 and §10: both test suites reproduce contracts/fixtures/audit_chain.json.
describe("audit hash chain fixture", () => {
  it("reproduces every hash", async () => {
    const got = await Promise.all(entries().map((e) => entryHash(e)));
    expect(got).toEqual(chain.expected.hashes);
  });

  it("verifies the untouched chain and reports the latest hash", async () => {
    const r = await verifyChain(entries());
    expect(r).toMatchObject({ verified: true, latestHash: chain.expected.latest_hash, count: 3 });
    expect(entries()[0]!.prev_hash).toBe(GENESIS_HASH);
  });

  it("reproduces the canonical vectors byte for byte, and matches the reference library", async () => {
    const sodium = await sodiumReady();
    for (const v of chain.canonical_vectors) {
      const c = canonicalize(v.input);
      expect(c).toBe(v.canonical);
      expect(c).toBe(canonicalizeReference(v.input));
      expect(sodium.to_hex(sodium.crypto_generichash(32, new TextEncoder().encode(c), null))).toBe(v.blake2b_256);
    }
  });
});

// T-11: a tampered entry shows Chain broken at that entry.
describe("T-11 broken chains", () => {
  it("an edited entry with its old hash breaks at that entry", async () => {
    const r = await verifyChain(clone(tampered.page.entries) as Raw[]);
    expect(r).toMatchObject({ verified: false, brokenAt: tampered.expected.broken_at, reason: "hash" });
  });

  it("an edited and re-hashed entry breaks the link to the next one", async () => {
    const e = entries();
    e[1] = await rehash({ ...e[1]!, details: { token_id: "a1b2c3d4", rotated: true } });
    expect(await verifyChain(e)).toMatchObject({ verified: false, brokenAt: 3, reason: "link" });
  });

  it("a removed entry is a gap", async () => {
    const e = entries();
    e.splice(1, 1);
    expect(await verifyChain(e)).toMatchObject({ verified: false, brokenAt: 3, reason: "gap" });
  });

  it("a first entry that does not start from 64 zeros is a broken link", async () => {
    const e = entries();
    e[0] = await rehash({ ...e[0]!, prev_hash: "f".repeat(64) });
    expect(await verifyChain(e)).toMatchObject({ verified: false, brokenAt: 1, reason: "link" });
  });

  it("an entry outside the canonical form rules is broken, even when its hash is consistent", async () => {
    const cases: Raw[] = [
      { amount_zat: 0.5 },
      { amount_zat: 2 ** 53 },
      { Amount: 1 },
      { note: "line\nbreak" },
    ];
    for (const details of cases) {
      const e = entries();
      const bad: Raw = { ...e[2]!, details: { ...(e[2]!.details as Raw), ...details } };
      // Hash computed over the bad form directly, so only the form check can catch it.
      bad.hash = "0".repeat(64);
      e[2] = bad;
      expect(await verifyChain(e), JSON.stringify(details)).toMatchObject({ verified: false, brokenAt: 3, reason: "form" });
    }
  });

  it("a chain server logged by more than its origin is broken (credentials must never reach the log)", async () => {
    const base = entries();
    const prev = base[2]!.hash as string;
    const bad = await rehash({
      seq: 4,
      at: "2026-10-12T22:02:00Z",
      type: "source_down",
      actor: "watcher",
      details: { origin: "https://user:pass@testnet.zec.rocks:443" },
      prev_hash: prev,
    });
    expect(await verifyChain([...base, bad])).toMatchObject({ verified: false, brokenAt: 4, reason: "form" });
    const good = await rehash({ ...bad, details: { origin: "https://testnet.zec.rocks:443" } });
    expect(await verifyChain([...base, good])).toMatchObject({ verified: true, count: 4 });
  });

  it("an `at` that is not the fixed text format is broken", async () => {
    const e = entries();
    e[0] = { ...e[0]!, at: "2026-10-09T11:00:00+00:00" };
    expect(await verifyChain(e)).toMatchObject({ verified: false, brokenAt: 1, reason: "form" });
  });

  it("an empty log is verified with no latest hash", async () => {
    expect(await verifyChain([])).toEqual({ verified: true, latestHash: null, count: 0 });
  });
});

describe("canonical JSON (RFC 8785, contract subset)", () => {
  it("refuses values outside the subset", () => {
    for (const bad of [1.5, -0, 2 ** 53, Number.NaN, -1, "\u0007", "\ud800", { A: 1 }, { "a-b": 1 }, undefined]) {
      expect(() => canonicalize({ v: bad }), String(bad)).toThrow(CanonicalError);
    }
  });

  it("matches the reference library on random values inside the subset", () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const chars = "abcxyz_ é😀\"\\/€ñ中";
    const key = () => Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => "abcdefghij_"[Math.floor(rnd() * 11)]).join("");
    const str = () => Array.from({ length: Math.floor(rnd() * 8) }, () => [...chars][Math.floor(rnd() * [...chars].length)]).join("");
    const value = (depth: number): unknown => {
      const k = Math.floor(rnd() * (depth > 2 ? 4 : 6));
      if (k === 0) return null;
      if (k === 1) return rnd() < 0.5;
      if (k === 2) return Math.floor(rnd() * Number.MAX_SAFE_INTEGER);
      if (k === 3) return str();
      if (k === 4) return Array.from({ length: Math.floor(rnd() * 4) }, () => value(depth + 1));
      return Object.fromEntries(Array.from({ length: Math.floor(rnd() * 5) }, () => [key(), value(depth + 1)]));
    };
    for (let i = 0; i < 500; i++) {
      const v = { root: value(0) };
      expect(canonicalize(v)).toBe(canonicalizeReference(v));
    }
  });
});

describe("export file", () => {
  it("names the file by inbox and UTC date and keeps the raw entries", async () => {
    const raw = entries();
    const result = await verifyChain(raw);
    const file = exportAudit("desk", raw, result, new Date("2026-10-13T23:30:00-05:00"));
    expect(file.filename).toBe("sealed-audit-desk-2026-10-14.json");
    const body = JSON.parse(file.json);
    expect(body).toEqual({
      inbox_id: "desk",
      exported_at: "2026-10-14T04:30:00Z",
      verified: true,
      broken_at: null,
      entries: raw,
    });
  });

  it("records where a broken chain broke", async () => {
    const raw = clone(tampered.page.entries) as Raw[];
    const file = exportAudit("desk", raw, await verifyChain(raw), new Date("2026-10-13T10:00:00Z"));
    expect(JSON.parse(file.json)).toMatchObject({ verified: false, broken_at: 2 });
  });
});
