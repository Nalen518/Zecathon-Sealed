/** Standard base64 with padding (api-contract §4.1) to bytes. Returns null on bad input. */
export function fromBase64(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4 !== 0) return null;
  try {
    const bin = atob(text);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** base64url without padding, the only encoding ZIP 321 uses for `memo`. */
export function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  const std = text.replace(/-/g, "+").replace(/_/g, "/");
  return fromBase64(std + "=".repeat((4 - (std.length % 4)) % 4));
}

/** Overwrite a buffer that held secret bytes. */
export function wipe(bytes: Uint8Array | null | undefined): void {
  bytes?.fill(0);
}
