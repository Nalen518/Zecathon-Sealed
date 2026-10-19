const ZAT_PER_ZEC = 100_000_000;

/** Integer zatoshis to a ZEC string with at most 8 decimals and no trailing zeros: 100000 -> "0.001". */
export function formatZec(zat: number): string {
  if (!Number.isSafeInteger(zat) || zat < 0) throw new RangeError(`Invalid zatoshi amount: ${zat}`);
  const whole = Math.floor(zat / ZAT_PER_ZEC);
  const frac = String(zat % ZAT_PER_ZEC).padStart(8, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : String(whole);
}
