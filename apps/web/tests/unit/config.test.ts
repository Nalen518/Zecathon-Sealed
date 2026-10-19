import { describe, expect, it } from "vitest";
import fixture from "../../../../contracts/fixtures/fingerprint.json";
import { bundled, checkDesk, parseConfig } from "../../src/lib/config";

const vector = fixture.vectors[0]!;

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
};

// A syntactically valid unified testnet address shape, used only to test prefix rules.
const TEST_UA = "utest1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";

describe("sealed.config.json", () => {
  it("the bundled config parses", () => {
    expect(bundled.ok).toBe(true);
  });

  it("the shipped desk is ready: its fingerprint matches its key", async () => {
    expect((await checkDesk(bundled)).kind).toBe("ready");
  });

  it("an empty desk is not set up, not invalid", async () => {
    const status = await checkDesk(parseConfig(base));
    expect(status.kind).toBe("not_set_up");
  });

  it("a matching key and fingerprint is ready", async () => {
    const status = await checkDesk(
      parseConfig({ ...base, desk_public_key: vector.desk_public_key, fingerprint: vector.fingerprint, address: TEST_UA }),
    );
    expect(status.kind).toBe("ready");
  });

  it("a fingerprint that does not match the key is invalid", async () => {
    const status = await checkDesk(
      parseConfig({ ...base, desk_public_key: vector.desk_public_key, fingerprint: "0000000000000000", address: TEST_UA }),
    );
    expect(status.kind).toBe("invalid");
  });

  it("rejects a placeholder address, so no page can build a link to it", () => {
    for (const address of ["[utest1… desk shielded address]", "utest1…", "utest1 qqq"]) {
      expect(parseConfig({ ...base, address }).ok).toBe(false);
    }
  });

  it("rejects a transparent address (rules §3.3)", () => {
    const r = parseConfig({ ...base, address: "tmBsTi2xWTjUdEXnuTceL7fecEQKeWaPDJd" });
    expect(r.ok).toBe(false);
  });

  it("rejects a mainnet address on testnet", () => {
    const r = parseConfig({ ...base, address: "u1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq" });
    expect(r.ok).toBe(false);
  });

  it("rejects a tip floor below the ZIP 317 fee (BR-8, C-12)", () => {
    expect(parseConfig({ ...base, tip_floor_zat: 9999 }).ok).toBe(false);
    expect(parseConfig({ ...base, tip_floor_zat: 10000 }).ok).toBe(true);
  });

  it("rejects an unknown network name (C-9)", () => {
    expect(parseConfig({ ...base, network: "testnet" }).ok).toBe(false);
  });

  it("rejects a plain http API outside localhost", () => {
    expect(parseConfig({ ...base, api_base_url: "http://api.example.com/v1" }).ok).toBe(false);
  });
});
