import { describe, expect, it } from "vitest";
import { checkViewingKey } from "../../src/lib/viewingKey";

const long = "q".repeat(200);

// FR-11, NFR-3, T-9: spend-capable input is refused in the browser before any request.
describe("viewing key check", () => {
  it("accepts a unified full viewing key for the network", () => {
    expect(checkViewingKey(`uviewtest1${long}`, "test")).toEqual({ kind: "ufvk" });
    expect(checkViewingKey(`uview1${long}`, "main")).toEqual({ kind: "ufvk" });
  });

  it("refuses spending keys, private keys and seed phrases", () => {
    expect(checkViewingKey(`secret-extended-key-test1${long}`, "test").kind).toBe("spend");
    expect(checkViewingKey(`secret-extended-key-main1${long}`, "main").kind).toBe("spend");
    expect(checkViewingKey("xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi", "test").kind).toBe("spend");
    const seed = Array.from({ length: 24 }, () => "abandon").join(" ");
    expect(checkViewingKey(seed, "test").kind).toBe("spend");
  });

  it("flags a key from the other network (network_mismatch)", () => {
    expect(checkViewingKey(`uview1${long}`, "test").kind).toBe("wrong_network");
  });

  it("asks for a unified key instead of a Sapling-only viewing key", () => {
    expect(checkViewingKey(`zxviewtestsapling1${long}`, "test").kind).toBe("not_unified");
  });

  it("refuses empty or random input", () => {
    expect(checkViewingKey("", "test").kind).toBe("invalid");
    expect(checkViewingKey("hello", "test").kind).toBe("invalid");
  });
});
