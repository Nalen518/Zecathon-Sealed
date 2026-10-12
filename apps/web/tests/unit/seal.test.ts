import { beforeAll, describe, expect, it } from "vitest";
import { openMemo, sealTip, TipTooLongError } from "../../src/lib/seal";
import { MAX_MESSAGE_BYTES, MEMO_BYTES, SEALED_MEMO_BYTES, TEXT_PREFIX } from "../../src/lib/memo";
import { sodiumReady, type SodiumLib } from "../../src/lib/sodium";

let sodium: SodiumLib;
let desk: { publicKey: Uint8Array; privateKey: Uint8Array };
let other: { publicKey: Uint8Array; privateKey: Uint8Array };

beforeAll(async () => {
  sodium = await sodiumReady();
  desk = sodium.crypto_box_keypair();
  other = sodium.crypto_box_keypair();
});

// T-1 Round trip, offline (FR-1 to FR-3, FR-8)
describe("T-1 seal and open", () => {
  it("a 331-byte tip seals into a 512-byte text memo and opens to the same text", async () => {
    const tip = "a".repeat(MAX_MESSAGE_BYTES);
    const sealed = await sealTip(tip, desk.publicKey);
    expect(sealed.memoBytes.length).toBe(MEMO_BYTES);
    expect(sealed.memoText.length).toBe(SEALED_MEMO_BYTES);
    expect(sealed.memoText.startsWith(TEXT_PREFIX)).toBe(true);
    expect(sealed.memoBytes[MEMO_BYTES - 1]).toBe(0);
    const opened = await openMemo(sealed.memoBytes, desk);
    expect(opened).toEqual({ ok: true, text: tip });
  });

  it("multi-byte text round trips exactly", async () => {
    const tip = "Bridge tender décidé 🚧 before bids closed.\nAsk the clerk.";
    const sealed = await sealTip(tip, desk.publicKey);
    expect(await openMemo(sealed.memoText, desk)).toEqual({ ok: true, text: tip });
  });

  it("every memo has the same length whatever the tip length", async () => {
    const a = await sealTip("x", desk.publicKey);
    const b = await sealTip("x".repeat(300), desk.publicKey);
    expect(a.memoText.length).toBe(b.memoText.length);
  });

  it("rejects 332 bytes", async () => {
    await expect(sealTip("a".repeat(MAX_MESSAGE_BYTES + 1), desk.publicKey)).rejects.toBeInstanceOf(TipTooLongError);
  });

  it("rejects a tampered memo", async () => {
    const sealed = await sealTip("tamper with me", desk.publicKey);
    const bytes = sealed.memoBytes.slice();
    // Flip one base64 character inside the ciphertext.
    bytes[100] = bytes[100] === 65 ? 66 : 65;
    expect(await openMemo(bytes, desk)).toEqual({ ok: false });
  });

  it("rejects the wrong key", async () => {
    const sealed = await sealTip("only for the desk", desk.publicKey);
    expect(await openMemo(sealed.memoBytes, other)).toEqual({ ok: false });
  });

  it("marks a plain text memo unreadable (FR-19)", async () => {
    expect(await openMemo("Thanks for the coffee", desk)).toEqual({ ok: false });
    expect(await openMemo(new Uint8Array(512), desk)).toEqual({ ok: false });
  });

  it("seals in under 1 second (NFR-5)", async () => {
    const t0 = performance.now();
    await sealTip("a".repeat(MAX_MESSAGE_BYTES), desk.publicKey);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
