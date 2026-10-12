import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  backupJson,
  deleteWrappedDesk,
  loadWrappedDesk,
  parseBackup,
  rewrapWithToken,
  saveWrappedDesk,
  unwrapDesk,
  wrapDesk,
  type DeskSecrets,
} from "../../src/lib/keystore";
import { fingerprintOf } from "../../src/lib/fingerprint";
import { sodiumReady } from "../../src/lib/sodium";

let secrets: DeskSecrets;
let fingerprint: string;
const PASS = "correct horse battery staple";

beforeAll(async () => {
  const sodium = await sodiumReady();
  const kp = sodium.crypto_box_keypair();
  secrets = { privateKey: kp.privateKey, publicKey: kp.publicKey, token: null };
  fingerprint = await fingerprintOf(kp.publicKey);
});

// FR-7, T-9
describe("keystore", () => {
  it("wraps and unwraps the desk key with the passphrase", async () => {
    const record = await wrapDesk(secrets, fingerprint, PASS);
    const out = await unwrapDesk(record, PASS);
    expect(out?.privateKey).toEqual(secrets.privateKey);
    expect(out?.token).toBeNull();
  });

  it("never stores the private key or the passphrase in clear", async () => {
    const sodium = await sodiumReady();
    const record = await wrapDesk(secrets, fingerprint, PASS);
    const text = JSON.stringify(record);
    expect(text).not.toContain(sodium.to_base64(secrets.privateKey, sodium.base64_variants.ORIGINAL));
    expect(text).not.toContain(PASS);
  });

  it("rejects a wrong passphrase", async () => {
    const record = await wrapDesk(secrets, fingerprint, PASS);
    expect(await unwrapDesk(record, "wrong passphrase here")).toBeNull();
  });

  it("rejects a tampered record", async () => {
    const record = await wrapDesk(secrets, fingerprint, PASS);
    const bad = { ...record, ciphertext: record.ciphertext.replace(/^./, record.ciphertext[0] === "A" ? "B" : "A") };
    expect(await unwrapDesk(bad, PASS)).toBeNull();
  });

  it("keeps the desk token in the same wrapped record (C-11)", async () => {
    const record = await wrapDesk(secrets, fingerprint, PASS);
    const withToken = await rewrapWithToken(record, secrets, "sld_token", PASS);
    expect(JSON.stringify(withToken)).not.toContain("sld_token");
    expect((await unwrapDesk(withToken, PASS))?.token).toBe("sld_token");
  });

  it("round trips through IndexedDB and is gone after delete", async () => {
    const record = await wrapDesk(secrets, fingerprint, PASS);
    await saveWrappedDesk(record);
    expect(await loadWrappedDesk()).toEqual(record);
    await deleteWrappedDesk();
    expect(await loadWrappedDesk()).toBeNull();
  });

  it("restores from the backup file only (T-9)", async () => {
    const record = await wrapDesk(secrets, fingerprint, PASS);
    const file = backupJson(record);
    await deleteWrappedDesk();
    const restored = parseBackup(file);
    expect(restored).toEqual(record);
    expect((await unwrapDesk(restored!, PASS))?.privateKey).toEqual(secrets.privateKey);
    expect(parseBackup("{\"not\":\"a backup\"}")).toBeNull();
    expect(parseBackup("not json")).toBeNull();
  });
});
