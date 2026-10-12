/**
 * Desk keystore (FR-7, api-contract §7, rules §1.4 and §1.5).
 * The desk private key and desk token are stored only passphrase-wrapped:
 *   key = Argon2id(passphrase, salt)      crypto_pwhash
 *   box = crypto_secretbox(JSON{sk, token}, nonce, key)
 * in IndexedDB and in the backup file (the same record). Unwrapped values live in memory only.
 */
import { fromBase64, toBase64, wipe } from "./bytes";
import { sodiumReady } from "./sodium";

export interface WrappedDesk {
  v: 1;
  kdf: "argon2id13";
  opslimit: number;
  memlimit: number;
  salt: string;
  nonce: string;
  ciphertext: string;
  /** Public values, kept in clear so the Locked screen can show which key this is. */
  public_key: string;
  fingerprint: string;
  created_at: string;
}

export interface DeskSecrets {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  /** Desk token for the Inbox API, null until the inbox is registered (C-11). */
  token: string | null;
}

/** Argon2id cost: 3 passes over 64 MiB. Stored in each record so it can be raised later (D-47). */
export const KDF_OPSLIMIT = 3;
export const KDF_MEMLIMIT = 64 * 1024 * 1024;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function deriveKey(passphrase: string, salt: Uint8Array, opslimit: number, memlimit: number): Promise<Uint8Array> {
  const sodium = await sodiumReady();
  const pass = encoder.encode(passphrase.normalize("NFKC"));
  try {
    return sodium.crypto_pwhash(
      sodium.crypto_secretbox_KEYBYTES,
      pass,
      salt,
      opslimit,
      memlimit,
      sodium.crypto_pwhash_ALG_ARGON2ID13,
    );
  } finally {
    wipe(pass);
  }
}

export async function wrapDesk(
  secrets: DeskSecrets,
  fingerprint: string,
  passphrase: string,
  createdAt = new Date().toISOString(),
): Promise<WrappedDesk> {
  const sodium = await sodiumReady();
  const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const key = await deriveKey(passphrase, salt, KDF_OPSLIMIT, KDF_MEMLIMIT);
  const plain = encoder.encode(JSON.stringify({ sk: toBase64(secrets.privateKey), token: secrets.token }));
  try {
    const ciphertext = sodium.crypto_secretbox_easy(plain, nonce, key);
    return {
      v: 1,
      kdf: "argon2id13",
      opslimit: KDF_OPSLIMIT,
      memlimit: KDF_MEMLIMIT,
      salt: toBase64(salt),
      nonce: toBase64(nonce),
      ciphertext: toBase64(ciphertext),
      public_key: toBase64(secrets.publicKey),
      fingerprint,
      created_at: createdAt,
    };
  } finally {
    wipe(key);
    wipe(plain);
  }
}

/** Returns null for a wrong passphrase or a damaged record. Never throws on bad input. */
export async function unwrapDesk(record: WrappedDesk, passphrase: string): Promise<DeskSecrets | null> {
  const sodium = await sodiumReady();
  const salt = fromBase64(record.salt);
  const nonce = fromBase64(record.nonce);
  const ciphertext = fromBase64(record.ciphertext);
  const publicKey = fromBase64(record.public_key);
  if (!salt || !nonce || !ciphertext || !publicKey) return null;
  const key = await deriveKey(passphrase, salt, record.opslimit, record.memlimit);
  let plain: Uint8Array | null = null;
  try {
    plain = sodium.crypto_secretbox_open_easy(ciphertext, nonce, key);
    const parsed = JSON.parse(decoder.decode(plain)) as { sk?: unknown; token?: unknown };
    const privateKey = typeof parsed.sk === "string" ? fromBase64(parsed.sk) : null;
    if (!privateKey || privateKey.length !== sodium.crypto_box_SECRETKEYBYTES) return null;
    // The private key must belong to the public key in the record.
    const derived = sodium.crypto_scalarmult_base(privateKey);
    if (!sodium.memcmp(derived, publicKey)) return null;
    return { privateKey, publicKey, token: typeof parsed.token === "string" ? parsed.token : null };
  } catch {
    return null;
  } finally {
    wipe(key);
    wipe(plain);
  }
}

/** Re-wrap with a new token (create, rotate) or none (delete, 401). Needs the passphrase again. */
export async function rewrapWithToken(
  record: WrappedDesk,
  secrets: DeskSecrets,
  token: string | null,
  passphrase: string,
): Promise<WrappedDesk> {
  return wrapDesk({ ...secrets, token }, record.fingerprint, passphrase, record.created_at);
}

// ---------- Backup file ----------

export const BACKUP_FILENAME = "sealed-desk-key-backup.json";

export function backupJson(record: WrappedDesk): string {
  return `${JSON.stringify({ sealed_desk_backup: record }, null, 2)}\n`;
}

/** Parse a backup file. Returns null if it is not a Sealed desk backup. */
export function parseBackup(text: string): WrappedDesk | null {
  try {
    const v = JSON.parse(text) as { sealed_desk_backup?: unknown };
    return isWrappedDesk(v.sealed_desk_backup) ? v.sealed_desk_backup : null;
  } catch {
    return null;
  }
}

function isWrappedDesk(v: unknown): v is WrappedDesk {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    r.v === 1 &&
    r.kdf === "argon2id13" &&
    typeof r.opslimit === "number" &&
    typeof r.memlimit === "number" &&
    ["salt", "nonce", "ciphertext", "public_key", "fingerprint", "created_at"].every((k) => typeof r[k] === "string")
  );
}

// ---------- IndexedDB ----------

const DB_NAME = "sealed";
const STORE = "desk";
const KEY = "desk";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = run(t.objectStore(STORE));
      t.oncomplete = () => resolve(req.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

export async function loadWrappedDesk(): Promise<WrappedDesk | null> {
  const v = await tx<unknown>("readonly", (s) => s.get(KEY));
  return isWrappedDesk(v) ? v : null;
}

export async function saveWrappedDesk(record: WrappedDesk): Promise<void> {
  await tx("readwrite", (s) => s.put(record, KEY));
}

export async function deleteWrappedDesk(): Promise<void> {
  await tx("readwrite", (s) => s.delete(KEY));
}
