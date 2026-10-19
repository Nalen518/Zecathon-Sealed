import { beforeAll, describe, expect, it } from "vitest";
import { buildPaymentUri, parsePaymentUri } from "../../src/lib/zip321";
import { sealTip } from "../../src/lib/seal";
import { MEMO_BYTES } from "../../src/lib/memo";
import { sodiumReady } from "../../src/lib/sodium";

// Address shapes for grammar tests only. Real addresses come from the bundled config.
const ADDRESS = {
  test: "utest1" + "q".repeat(200),
  main: "u1" + "q".repeat(200),
};

let memoBytes: Uint8Array;

beforeAll(async () => {
  const sodium = await sodiumReady();
  const { publicKey } = sodium.crypto_box_keypair();
  memoBytes = (await sealTip("a".repeat(331), publicKey)).memoBytes;
});

// T-2 Link validity (FR-4, FR-9)
describe("T-2 ZIP 321 payment link", () => {
  for (const network of ["test", "main"] as const) {
    it(`builds a valid link on ${network}net`, () => {
      const uri = buildPaymentUri({ address: ADDRESS[network], amountZat: 100_000, memoBytes });
      const parsed = parsePaymentUri(uri);
      expect(parsed.address).toBe(ADDRESS[network]);
      expect(parsed.amount).toBe("0.001");
      expect(parsed.memo.length).toBeLessThanOrEqual(MEMO_BYTES);
      expect(parsed.params.some((p) => p.startsWith("req-"))).toBe(false);
      // The memo is the 511 text bytes, trailing zeros removed (SRD §3).
      expect(new TextDecoder().decode(parsed.memo)).toBe(new TextDecoder().decode(memoBytes.slice(0, 511)));
    });
  }

  it("uses base64url without padding for the memo", () => {
    const uri = buildPaymentUri({ address: ADDRESS.test, amountZat: 100_000, memoBytes });
    const memo = new URL(uri.replace("zcash:", "zcash://x/")).searchParams.get("memo") ?? "";
    expect(memo).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("formats the amount with at most 8 decimals", () => {
    const uri = buildPaymentUri({ address: ADDRESS.test, amountZat: 123_456_789, memoBytes });
    expect(parsePaymentUri(uri).amount).toBe("1.23456789");
  });

  it("refuses a transparent address (rules §3.3)", () => {
    expect(() => buildPaymentUri({ address: "tmBsTi2xWTjUdEXnuTceL7fecEQKeWaPDJd", amountZat: 100_000, memoBytes })).toThrow();
  });

  it("refuses an empty or placeholder address", () => {
    for (const address of ["", "[utest1… desk shielded address]", "utest1…"]) {
      expect(() => buildPaymentUri({ address, amountZat: 100_000, memoBytes })).toThrow();
    }
  });

  it("refuses a memo over 512 bytes", () => {
    expect(() => buildPaymentUri({ address: ADDRESS.test, amountZat: 100_000, memoBytes: new Uint8Array(513).fill(65) })).toThrow();
  });
});
