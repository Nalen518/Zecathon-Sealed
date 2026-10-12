import { describe, expect, it } from "vitest";
import fixture from "../../../../contracts/fixtures/fingerprint.json";
import { fromBase64 } from "../../src/lib/bytes";
import { fingerprintOf, formatFingerprint } from "../../src/lib/fingerprint";

// api-contract §4.3: both test suites must pass contracts/fixtures/fingerprint.json.
describe("desk key fingerprint", () => {
  for (const v of fixture.vectors) {
    it(`matches the shared vector ${v.display}`, async () => {
      const key = fromBase64(v.desk_public_key);
      expect(key?.length).toBe(32);
      const fp = await fingerprintOf(key!);
      expect(fp).toBe(v.fingerprint);
      expect(formatFingerprint(fp)).toBe(v.display);
    });
  }
});
