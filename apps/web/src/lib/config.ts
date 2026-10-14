import raw from "../../sealed.config.json";
import { fromBase64 } from "./bytes";
import { fingerprintOf } from "./fingerprint";
import { ZIP317_MIN_FEE_ZAT } from "./memo";

/**
 * The bundled configuration (D-08, api-contract §8). The desk key, fingerprint and
 * address come from here, never from the API (rules §1.8).
 */

export type Network = "test" | "main";

export interface PublishedPlace {
  label: string;
  url: string;
}

export interface SealedConfig {
  network: Network;
  inboxId: string;
  name: string;
  /** Inbox API base, empty until a watcher is deployed. */
  apiBaseUrl: string;
  /** 32-byte desk public key, standard base64. Empty until the desk sets up the inbox. */
  deskPublicKey: string;
  /** 16 upper hex characters, no spaces. */
  fingerprint: string;
  /** Unified address with a shielded receiver. */
  address: string;
  tipFloorZat: number;
  sourceUrl: string;
  /** Second place where the desk publishes its fingerprint, besides the README. */
  fingerprintAlsoOn: PublishedPlace | null;
  /** Block explorer home page for this network. Testnet only, null on mainnet. A plain link, never fetched. */
  explorerUrl: string | null;
  /** Testnet faucet. Testnet only, null on mainnet. A plain link, never fetched. */
  faucetUrl: string | null;
}

/** Which desk fields are still empty. When none are, senders can write a tip. */
export type DeskField = "desk_public_key" | "fingerprint" | "address";

export type ConfigResult =
  | { ok: true; config: SealedConfig; missing: DeskField[] }
  | { ok: false; errors: string[] };

const MIN_FLOOR_ZAT = ZIP317_MIN_FEE_ZAT; // BR-8, contract C-12
const MAX_FLOOR_ZAT = 100_000_000;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const str = (o: Record<string, unknown>, k: string): string => (typeof o[k] === "string" ? (o[k] as string) : "");

/** Unified address prefix per network (api-contract §4.2). */
export const ADDRESS_PREFIX: Record<Network, string> = { test: "utest1", main: "u1" };

export function parseConfig(input: unknown): ConfigResult {
  if (!isRecord(input)) return { ok: false, errors: ["sealed.config.json is not an object"] };
  const errors: string[] = [];

  const network = input.network;
  if (network !== "test" && network !== "main") errors.push('network must be "test" or "main"');

  const inboxId = str(input, "inbox_id");
  if (!/^[a-z0-9_-]{1,32}$/.test(inboxId)) errors.push("inbox_id must match [a-z0-9_-]{1,32}");

  const name = str(input, "name");
  if (!name) errors.push("name is empty");

  const apiBaseUrl = str(input, "api_base_url");
  if (apiBaseUrl) {
    try {
      const u = new URL(apiBaseUrl);
      const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
      if (u.protocol !== "https:" && !local) errors.push("api_base_url must use https");
      if (apiBaseUrl.endsWith("/")) errors.push("api_base_url must not end with a slash");
    } catch {
      errors.push("api_base_url is not a URL");
    }
  }

  const tipFloorZat = input.tip_floor_zat;
  if (
    typeof tipFloorZat !== "number" ||
    !Number.isSafeInteger(tipFloorZat) ||
    tipFloorZat < MIN_FLOOR_ZAT ||
    tipFloorZat > MAX_FLOOR_ZAT
  ) {
    errors.push(`tip_floor_zat must be an integer from ${MIN_FLOOR_ZAT} to ${MAX_FLOOR_ZAT}`);
  }

  const deskPublicKey = str(input, "desk_public_key");
  if (deskPublicKey && fromBase64(deskPublicKey)?.length !== 32) {
    errors.push("desk_public_key must be 32 bytes in standard base64");
  }

  const fingerprint = str(input, "fingerprint");
  if (fingerprint && !/^[0-9A-F]{16}$/.test(fingerprint)) {
    errors.push("fingerprint must be 16 upper-case hex characters with no spaces");
  }

  const address = str(input, "address");
  if (address && (network === "test" || network === "main")) {
    if (/^(t1|t3|tm|t2|tex1|textest1)/.test(address)) {
      errors.push("address is transparent. A memo needs a shielded address (rules §3.3)");
    } else if (!address.startsWith(ADDRESS_PREFIX[network])) {
      errors.push(`address must be a unified address starting with ${ADDRESS_PREFIX[network]} on ${network}`);
    }
  }

  const sourceUrl = str(input, "source_url");
  if (!/^https:\/\//.test(sourceUrl)) errors.push("source_url must be an https URL");

  let fingerprintAlsoOn: PublishedPlace | null = null;
  const also = input.fingerprint_also_on;
  if (also !== null && also !== undefined) {
    if (isRecord(also) && str(also, "label") && /^https:\/\//.test(str(also, "url"))) {
      fingerprintAlsoOn = { label: str(also, "label"), url: str(also, "url") };
    } else {
      errors.push("fingerprint_also_on must be null or { label, url } with an https url");
    }
  }

  const links = parseOutboundLinks(input.outbound_links, network, errors);

  if (errors.length > 0) return { ok: false, errors };

  const missing: DeskField[] = [];
  if (!deskPublicKey) missing.push("desk_public_key");
  if (!fingerprint) missing.push("fingerprint");
  if (!address) missing.push("address");

  return {
    ok: true,
    missing,
    config: {
      network: network as Network,
      inboxId,
      name,
      apiBaseUrl,
      deskPublicKey,
      fingerprint,
      address,
      tipFloorZat: tipFloorZat as number,
      sourceUrl,
      fingerprintAlsoOn,
      explorerUrl: links.explorerUrl,
      faucetUrl: links.faucetUrl,
    },
  };
}

const LINK_KEYS = ["explorer_url", "faucet_url"] as const;

/**
 * `outbound_links` holds the explorer and faucet links per network (D-84). Each value is an https URL or null.
 * Mainnet must stay null: the links exist only to help on testnet (rules §2.7). Missing means none.
 */
function parseOutboundLinks(
  input: unknown,
  network: unknown,
  errors: string[],
): { explorerUrl: string | null; faucetUrl: string | null } {
  const none = { explorerUrl: null, faucetUrl: null };
  if (input === undefined || input === null) return none;
  if (!isRecord(input)) {
    errors.push("outbound_links must be an object keyed by network");
    return none;
  }
  const parsed: Record<string, { explorerUrl: string | null; faucetUrl: string | null }> = {};
  for (const net of ["test", "main"] as const) {
    const entry = input[net];
    if (entry === undefined || entry === null) {
      parsed[net] = none;
      continue;
    }
    if (!isRecord(entry)) {
      errors.push(`outbound_links.${net} must be an object`);
      parsed[net] = none;
      continue;
    }
    const urls: (string | null)[] = LINK_KEYS.map((k) => {
      const v = entry[k];
      if (v === null || v === undefined) return null;
      if (typeof v !== "string" || !isHttpsUrl(v)) {
        errors.push(`outbound_links.${net}.${k} must be null or an https URL`);
        return null;
      }
      if (net === "main") errors.push(`outbound_links.main.${k} must be null. Outbound links are testnet only`);
      return v;
    });
    parsed[net] = { explorerUrl: urls[0] ?? null, faucetUrl: urls[1] ?? null };
  }
  return network === "test" || network === "main" ? parsed[network]! : none;
}

function isHttpsUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "https:" && u.username === "" && u.password === "";
  } catch {
    return false;
  }
}

/** The config shipped with this build. */
export const bundled: ConfigResult = parseConfig(raw);

/**
 * Desk readiness for the sender pages:
 * - ready: key, fingerprint and address are set and the fingerprint matches the key
 * - not_set_up: the desk has not filled in its key yet
 * - invalid: the config is broken, or the fingerprint does not match the key
 */
export type DeskStatus =
  | { kind: "ready"; config: SealedConfig; publicKey: Uint8Array }
  | { kind: "not_set_up"; config: SealedConfig }
  | { kind: "invalid"; config: SealedConfig | null; errors: string[] };

export async function checkDesk(result: ConfigResult = bundled): Promise<DeskStatus> {
  if (!result.ok) return { kind: "invalid", config: null, errors: result.errors };
  const { config, missing } = result;
  if (missing.length > 0) return { kind: "not_set_up", config };
  const publicKey = fromBase64(config.deskPublicKey);
  if (!publicKey) return { kind: "invalid", config, errors: ["desk_public_key is not base64"] };
  const computed = await fingerprintOf(publicKey);
  if (computed !== config.fingerprint) {
    return { kind: "invalid", config, errors: ["fingerprint does not match desk_public_key"] };
  }
  return { kind: "ready", config, publicKey };
}
