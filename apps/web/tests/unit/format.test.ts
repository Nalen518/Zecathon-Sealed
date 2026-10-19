import { describe, expect, it } from "vitest";
import { formatZec } from "../../src/lib/format";
import { MAX_MESSAGE_BYTES, SEALED_MEMO_BYTES, truncateToBytes, utf8Length } from "../../src/lib/memo";

describe("formatZec", () => {
  it("formats zatoshis as ZEC with no trailing zeros", () => {
    expect(formatZec(100_000)).toBe("0.001");
    expect(formatZec(150_000)).toBe("0.0015");
    expect(formatZec(1)).toBe("0.00000001");
    expect(formatZec(100_000_000)).toBe("1");
    expect(formatZec(0)).toBe("0");
  });
  it("rejects fractions and negatives", () => {
    expect(() => formatZec(1.5)).toThrow();
    expect(() => formatZec(-1)).toThrow();
  });
});

describe("memo constants and byte limits", () => {
  it("the sealed text memo is 511 of 512 bytes (SRD §3)", () => {
    expect(SEALED_MEMO_BYTES).toBe(511);
  });
  it("cuts at a whole character, never inside one (D-11)", () => {
    const cut = truncateToBytes("é".repeat(200));
    expect(utf8Length(cut)).toBe(330);
    expect(cut.endsWith("é")).toBe(true);
    expect(utf8Length(truncateToBytes("a".repeat(400)))).toBe(MAX_MESSAGE_BYTES);
  });
});
