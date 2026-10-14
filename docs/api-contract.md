# Sealed API contract: frontend and backend

Status: v1, Oct 11 2026, clarified Oct 13 and 14 2026 (C-15 to C-23, no route, field or type change). Owner: @Apa.
This is the single source of truth for how the frontend (Vercel) and the watcher API (Railway) talk. If this file disagrees with the Architecture doc, the SRD table or any code, **this file wins** and the other one is fixed in the same change.

Built from: SRD (FR-1 to FR-19, NFR-1 to NFR-11, T-1 to T-10), Architecture §3 to §5, `docs/design-screens.md` and `docs/frontend/rules.md`.

## 1. Conflicts found and how this contract settles them

These came up when the 17 Figma screens were checked against the Architecture API table. Each one would have broken a screen or a test.

| # | Conflict | Settled as |
|---|---|---|
| C-1 | One `status` field cannot say "pending and below floor" at the same time, but a low tip can be both | Split into `chain_state`, `below_floor` and `format_ok`, plus a derived `display_status` with a fixed precedence (§5.3) |
| C-2 | Paging by tip id only returns new tips. A tip that goes pending to confirmed, or gets orphaned, would never update in the Inbox | Cursor is a change sequence `seq`. Any new or changed tip gets a higher `seq` (§6.5) |
| C-3 | The "All tips (5)" and "Below floor, hidden (2)" tabs need counts the API did not return | Tip list returns `counts` (§6.5) |
| C-4 | "Setup secret" auth had no header name | Header `X-Setup-Secret` (§3) |
| C-5 | Settings has "Rotate desk token" with no setup secret field, but rotation required the setup secret | Rotation accepts the current desk token **or** the setup secret (§6.7) |
| C-6 | Delete needs the desk token and the setup secret, but the Settings screen had no setup secret field | Setup secret field added to the Delete card in Figma (Oct 11) |
| C-7 | The key fingerprint shown on six screens had no defined algorithm. Frontend and backend could compute different values | One algorithm with a test vector (§4.3) |
| C-8 | Amount units, time format and binary encoding were not defined | Integers in zatoshis, RFC 3339 UTC strings, standard base64 (§4) |
| C-9 | Network names differ between libraries ("testnet", "test", "TestNetwork") | Wire values are `"test"` and `"main"` only (§4.1) |
| C-10 | Browser calls from Vercel to Railway need CORS, and the CSP must allow the API origin | CORS and CSP rules (§3) |
| C-11 | Where the frontend keeps the desk token was not defined | Stored passphrase-wrapped in IndexedDB with the desk key, never in plain storage (§7) |
| C-12 | Tip floor range was 0 to 100,000,000 zat, but SRD BR-8 forbids a floor below the ZIP 317 two-action fee (10,000 zat) | Range is 10,000 to 100,000,000 on `POST /inbox` and `PATCH /inbox/{id}` (Oct 11) |
| C-13 | The audit trail (added Oct 12) would have to survive "delete inbox", but FR-17 says delete removes everything | The log is deleted with the inbox. The desk exports it first from the Audit trail page, which the Settings delete card links to (§6.10) |
| C-14 | `GET /v1/health` is public and returned each chain server's full `url`, so credentials in a server URL would be visible to anyone | Field renamed `origin` and holds the origin only. Same rule as the audit log (§5.6) (Oct 13) |
| C-15 | §5.2 allowed unmined tips (`height` null), but §5.6 says `tip_received` details are never null, and compact blocks do not carry the mempool | A tip appears only once it is in a block. In v1 `height`, `block_time_at` and `confirmations` are never null. Clients still accept null so mempool tips can come later without `/v2` (§5.2) (Oct 13) |
| C-16 | A tip with no memo had `format_ok: true` in `tips_page.json`, but §4.4 needs the `z1:` prefix | `memo_b64: null` means the ZIP 302 "no memo" value. `format_ok` is `false`, so `display_status` is `unreadable` (§4.4, §5.2) (Oct 13) |
| C-17 | `seq` bumps on every `confirmations` change, so with 25-second testnet blocks every tip changed on every poll, forever | `confirmations` stops at 10 and no longer changes after that (§5.2) (Oct 13) |
| C-18 | Health had no defined answer when no chain server answers, and no route said when `503 watcher_unavailable` is returned | Health always answers `200` (§5.4). Stored tips and the audit log are served from the database and never return `503`. Only Create inbox without `birthday_height` needs the chain (§5.5, §6.3) (Oct 13) |
| C-19 | Create inbox checked the network before spend authority, so a spending key for the other network got `network_mismatch`, and the order left out several errors | One full check order, spend key first (§6.3) (Oct 13) |
| C-20 | `SEALED_DB_KEY` (viewing key encryption at rest) and Railway's `PORT` were missing from §8 | Added to §8 (Oct 13) |
| C-21 | §8 required two chain servers, but testnet may have only one live server | Two or more on main. One is allowed on test, and health then reads "1 of 1 servers" (§8) (Oct 13) |
| C-22 | `next_seq` on an empty page and `field` on an error about no single field were undefined | `next_seq` equals the `after_seq` sent when the page is empty (§6.5, §6.10). `field` is left out when no single field is at fault (§5.5) (Oct 13) |
| C-23 | A tip is unique by `txid` + `output_index` (FR-13), but each shielded pool numbers its outputs from 0, so a transaction that pays the desk in two pools would give two tips the same key and one would be lost | `output_index` is the output's position across every shielded output of the transaction, counted Sapling outputs first, then Orchard actions, then Ironwood actions (§5.2) (Oct 14) |
| C-24 | Judges share one testnet demo desk through a backup file that carries the desk token. The desk token alone can rotate itself and change the tip floor, so one judge could break every other judge's backup (401) or move tips below the floor | A demo inbox lock set by `SEALED_DEMO_INBOX_ID`: on that inbox, token issue and PATCH need the setup secret and otherwise return `403 demo_locked` (§5.5, §6.4, §6.7, §8). Testnet only (Oct 14) |

## 2. Base

| Item | Value |
|---|---|
| Base URL | `https://<railway-host>/v1` from config `api_base_url`. No trailing slash |
| Format | JSON, UTF-8, `Content-Type: application/json` on every body |
| Field names | `snake_case` on the wire. The frontend maps to `camelCase` in `src/lib/api.ts` only |
| Versioning | Path prefix `/v1`. Adding an optional field is allowed. Renaming, removing or changing a type needs `/v2` |
| Single tenant | One deployment serves one inbox. `{id}` is still in every path so a multi-inbox version needs no URL change |

## 3. Transport, auth and browser rules

**Every response**
- `Cache-Control: no-store` and `Pragma: no-cache` (NFR-4)
- No `Set-Cookie`, ever (NFR-4)
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`

**Auth**

| Kind | How it is sent | Used by |
|---|---|---|
| None | | `GET /health`, `GET /inbox/{id}` |
| Desk token | `Authorization: Bearer <token>` | Tip list, one tip, PATCH, rotate, DELETE |
| Setup secret | `X-Setup-Secret: <secret>` | Create inbox, first token, rotate (alternative), DELETE |

- Tokens and secrets are never put in a URL or query string.
- The server stores only a hash of each token and of the setup secret, and compares in constant time.
- On a bad or revoked token the server returns `401 unauthorized`. The frontend sends the desk to the Locked screen.

**CORS** (the browser calls Railway from the Vercel origin)
- `Access-Control-Allow-Origin`: exact match against `ALLOWED_ORIGINS`. Never `*`.
- `Access-Control-Allow-Methods: GET, POST, PATCH, DELETE`
- `Access-Control-Allow-Headers: Authorization, Content-Type, X-Setup-Secret`
- `Access-Control-Allow-Credentials` is not sent. The frontend uses `credentials: "omit"`.
- `Access-Control-Max-Age: 600`

**CSP on the frontend** includes the API origin in `connect-src` and nothing else.

**Rate limits**: by token on desk routes, by IP on public routes. IPs are counted in memory only and never written to logs or the database (NFR-2). Over the limit: `429 rate_limited` with `Retry-After` in seconds.

## 4. Shared types and rules

### 4.1 Scalars

| Type | Wire format | Example | Rule |
|---|---|---|---|
| Network | string `"test"` or `"main"` | `"test"` | Same value in frontend config and backend env. A mismatch is a fatal config error on both sides |
| Inbox id | string `[a-z0-9_-]{1,32}` | `"desk"` | Set at deploy time |
| Tip id | string, opaque | `"tip_01HF…"` | Never parsed by the frontend |
| Amount | integer zatoshis | `100000` | Fields end in `_zat`. 1 ZEC = 100,000,000. The frontend formats as ZEC with up to 8 decimals |
| Time | RFC 3339 UTC string | `"2026-10-11T09:41:00Z"` | Fields end in `_at`. The frontend shows local time |
| Height | integer | `4201108` | Block height |
| Tx id | 64 lowercase hex | `"8b02e4…77ad"` | Byte order as shown by block explorers |
| Binary | standard base64 with padding | | Keys and memo bytes. The ZIP 321 link is the only place that uses base64url, by its own spec |
| Seq | integer, increasing per inbox | `1042` | Change sequence for polling (§6.5) |

### 4.2 Keys and addresses

| Item | Format | Checked by |
|---|---|---|
| Desk public key | 32 bytes, base64 (44 chars) | Both. Frontend from libsodium `crypto_box_keypair` |
| Shielded address | Unified address, HRP `utest` (test) or `u` (main), must contain a Sapling or Orchard receiver | Frontend (prefix) and backend (full decode, FR-11) |
| Viewing key | Unified full viewing key, HRP `uviewtest` or `uview` | Backend decodes. Frontend checks prefix first |
| Spend-capable key | Anything that decodes as a spending key (for example `secret-extended-key-test1…`) | Rejected in the browser before sending, and again by the server with `422 spend_key_rejected` (FR-11, NFR-3) |

### 4.3 Key fingerprint (one algorithm for both sides)

```
fingerprint = upper_hex( BLAKE2b-256( desk_public_key_bytes ) )[0..16]
display     = groups of 4 joined by a space   →   "3F9A C21E 8B02 77AD"
```

- Frontend: libsodium `crypto_generichash(32, key)`. Backend: Rust `blake2` crate, `Blake2b<U32>`.
- The wire carries the 16 hex characters without spaces (`"3F9AC21E8B0277AD"`). Spaces are display only.
- On create, the server recomputes it and rejects a mismatch with `422 fingerprint_mismatch`.
- `contracts/fixtures/fingerprint.json` holds at least one key and its expected fingerprint. Both test suites must pass it.

### 4.4 Memo (from SRD §3, never retyped)

| Item | Value |
|---|---|
| Memo size | 512 bytes |
| Plaintext block | 2-byte big-endian length + message, zero padded to 333 bytes. Message at most 331 UTF-8 bytes |
| Sealed box | `crypto_box_seal`, 381 bytes |
| Memo text | ASCII `z1:` + standard base64 of the sealed box = 511 bytes, then one zero byte |
| On the wire | `memo_b64` = base64 of the full 512 raw bytes exactly as received on chain |
| Format check (server) | `format_ok` = starts with `z1:` and the next 508 bytes are valid base64 decoding to 381 bytes. The server never tries to decrypt |
| No memo | First byte 0xF6 (ZIP 302 "no memo"). The server sends `memo_b64: null` and `format_ok: false` (C-16) |

## 5. Objects

### 5.1 Inbox (public)

```json
{
  "id": "desk",
  "name": "Sealed",
  "network": "test",
  "address": "utest1…",
  "desk_public_key": "base64…",
  "fingerprint": "3F9AC21E8B0277AD",
  "tip_floor_zat": 100000,
  "created_at": "2026-10-11T09:00:00Z"
}
```

Never contains the viewing key, token hashes or anything about senders.

### 5.2 Tip (desk token only)

```json
{
  "id": "tip_01HF…",
  "seq": 1042,
  "txid": "8b02e4…77ad",
  "output_index": 0,
  "height": 4201108,
  "block_time_at": "2026-10-11T09:41:00Z",
  "seen_at": "2026-10-11T09:41:30Z",
  "amount_zat": 100000,
  "confirmations": 10,
  "chain_state": "confirmed",
  "below_floor": false,
  "format_ok": true,
  "display_status": "confirmed",
  "memo_b64": "ejE6…AA=="
}
```

- `id` is unique by `txid` + `output_index` (FR-13).
- `output_index` counts every shielded output of the transaction in one sequence: Sapling outputs first, then Orchard actions, then Ironwood actions, each in its order within its bundle (C-23). A transaction with 2 Sapling outputs and 2 Ironwood actions numbers them 0, 1, 2, 3. The frontend never parses it.
- A tip is listed only once its transaction is in a block (C-15). In v1 `height`, `block_time_at` and `confirmations` are never `null`. Clients still accept `null` for them, kept for a later mempool view.
- `confirmations` counts the tip's own block as 1 and stops at 10. After 10 it does not change, so it no longer bumps `seq` (C-17). The `confirmed` rule (3 or more) is unchanged.
- `memo_b64` is `null` when the wallet sent no memo (§4.4). `format_ok` is then `false` and `display_status` is `unreadable` unless the tip is orphaned. The Inbox shows it as an empty tip.

### 5.3 Tip status (settles C-1)

| Field | Values | Meaning |
|---|---|---|
| `chain_state` | `pending`, `confirmed`, `orphaned` | `confirmed` at 3 or more confirmations (FR-14). `orphaned` if a reorg removed it |
| `below_floor` | boolean | `amount_zat < tip_floor_zat` at the time of the response (FR-16) |
| `format_ok` | boolean | §4.4 (FR-19). `false` when `memo_b64` is `null` |
| `display_status` | `orphaned`, `unreadable`, `below_floor`, `pending`, `confirmed` | Computed by the server with this precedence, left to right. The frontend shows exactly this value in the Status badge |

The five `display_status` values are the five Status badge variants in Figma, in the same spelling. The frontend never invents another.

### 5.4 Health (public)

```json
{
  "network": "test",
  "tip_height": 4201120,
  "lag_blocks": 0,
  "sources": [
    { "origin": "https://testnet.zec.rocks:443", "ok": true, "tip_height": 4201120, "lag_blocks": 0, "last_checked_at": "2026-10-11T09:42:00Z" },
    { "origin": "https://…", "ok": true, "tip_height": 4201120, "lag_blocks": 0, "last_checked_at": "2026-10-11T09:42:00Z" }
  ],
  "version": "0.1.0"
}
```

`origin` is the chain server's scheme, host and port only, never its path, query or a user name and password (C-14). This endpoint is public.

`lag_blocks` at the top is the worst lag among sources that answer.

When no source answers, health still returns `200` (C-18): `tip_height` is the highest tip seen since the service started (0 if none yet), `lag_blocks` is 0, and every source has `ok: false`. A source keeps its last answered `tip_height` and `lag_blocks`, or `null` if it never answered. `last_checked_at` is the last attempt, or `null` before the first one. The Inbox health line reads "{ok count} of {total} servers · {lag_blocks} blocks behind · checked {age} ago". The Tag shows WATCHING when every source is ok and lag is under 3, otherwise WATCHER BEHIND (FR-18).

### 5.5 Error

```json
{ "error": { "code": "spend_key_rejected", "message": "This key can spend funds.", "field": "ufvk" } }
```

`field` names the request field at fault. It is left out when no single field is at fault (C-22).

The frontend picks its text by `code` from the Figma copy and never shows `message` as is. `message` is for logs and curl users.

| HTTP | `code` | When | Screen that handles it |
|---|---|---|---|
| 400 | `invalid_request` | Bad JSON, missing or wrong-type field | Field error under the named `field` |
| 401 | `unauthorized` | Missing, bad or revoked token | Inbox, Locked |
| 403 | `forbidden` | Wrong setup secret | Create inbox 2, Settings |
| 403 | `demo_locked` | Token issue or PATCH on the demo inbox (`SEALED_DEMO_INBOX_ID`) without a correct setup secret (C-24). Nothing is changed or logged | Settings |
| 404 | `not_found` | Unknown inbox or tip | Full-page error |
| 409 | `inbox_exists` | Create when an inbox exists | Create inbox 2 |
| 422 | `spend_key_rejected` | Viewing key has spend authority | Create inbox 2 (Input error state) |
| 422 | `network_mismatch` | Address or key is for the other network | Create inbox 2 |
| 422 | `address_mismatch` | Address is not derived from the viewing key | Create inbox 2 |
| 422 | `address_not_shielded` | No shielded receiver | Create inbox 2 |
| 422 | `fingerprint_mismatch` | Fingerprint does not match the public key | Create inbox 2 |
| 422 | `floor_out_of_range` | Tip floor outside 10,000 to 100,000,000 zat | Settings |
| 429 | `rate_limited` | Too many requests | Any. Retry after `Retry-After` |
| 503 | `watcher_unavailable` | Create inbox without `birthday_height` while no lightwalletd source answers (C-18). Tip, audit and health routes never return it | Create inbox 2. The Inbox reads chain state from health |

### 5.6 Audit entry (desk token only, added Oct 12)

```json
{
  "seq": 10,
  "at": "2026-10-12T14:02:11Z",
  "type": "tip_received",
  "actor": "watcher",
  "details": { "tip_id": "tip_01HF…", "txid": "3f9a…c21e", "output_index": 0, "amount_zat": 100000, "height": 4201337, "format_ok": true },
  "prev_hash": "e7a9…4c10",
  "hash": "9c41…e07b"
}
```

**Hash chain**
```
hash      = lower_hex( BLAKE2b-256( UTF-8( JCS( entry without the "hash" field ) ) ) )
prev_hash = hash of the entry with seq - 1.  For seq 1 it is 64 zeros.
```
- JCS is RFC 8785 canonical JSON (sorted keys, no spaces). Both sides use it so the bytes match.
- **The browser hashes the entry exactly as received** (the raw JSON object minus `hash`), never a parsed or renamed copy. A field added later is then covered by the hash automatically.
- `seq` starts at 1 per inbox and has no gaps. A gap counts as a break.
- The browser recomputes every hash. The first entry whose `hash` is wrong, or whose `prev_hash` does not equal the previous `hash`, is shown as Broken and the page shows CHAIN BROKEN AT #n.
- The server writes an entry in the same database transaction as the change it records, and never updates or deletes entries (except when the whole inbox is deleted, C-13).
- `contracts/fixtures/audit_chain.json` holds three entries with their expected hashes. Both test suites must pass it.

**Canonical form rules** (so TypeScript and Rust produce the same bytes, Oct 13)

| Item | Rule |
|---|---|
| Numbers | Integers only, from 0 to 2^53 − 1. No floats, no exponent, no `-0` |
| Strings | Valid Unicode only (no lone surrogates). No control characters U+0000 to U+001F. Never normalized: stored and served byte for byte |
| Keys | ASCII `[a-z_]` only, so UTF-16 and UTF-8 key order agree |
| `at` | Stored as text and served unchanged, format `YYYY-MM-DDTHH:MM:SSZ` (UTC, no fraction). Never parsed and re-printed |
| `details` | Every field listed below is always present and never `null`. No other fields |
| URLs | Only the origin (scheme, host, port) of a chain server. Never a path, query or user name and password |

The server rejects, and never stores, an entry that breaks a rule. The browser treats an entry that breaks a rule as Broken.

**Event types**

| `type` | `actor` | `details` | Shown as |
|---|---|---|---|
| `inbox_created` | `setup` | `fingerprint`, `tip_floor_zat`, `network`, `birthday_height` | Inbox created |
| `token_issued` | `setup` or `desk` | `token_id` (first 8 hex of BLAKE2b-256 of the token), `rotated` (bool) | Desk token issued / Desk token rotated |
| `floor_changed` | `desk` | `from_zat`, `to_zat` | Tip floor changed |
| `tip_received` | `watcher` | `tip_id`, `txid`, `output_index`, `amount_zat`, `height`, `format_ok` | Tip received |
| `tip_confirmed` | `watcher` | `tip_id`, `txid`, `confirmations` | Tip confirmed |
| `tip_orphaned` | `watcher` | `tip_id`, `txid`, `height` | Tip orphaned |
| `source_down` | `watcher` | `origin` (for example `https://testnet.zec.rocks:443`) | Chain server not answering |
| `source_up` | `watcher` | `origin` | Chain server back |

Never in `details`: tip text, memo bytes, token values, the setup secret, IP addresses, user agents, or anything from a chain server URL beyond its origin (credentials in a URL would otherwise land in the log). Reads (GET requests) are not logged. Lock, unlock and decrypt happen only in the browser and cannot be logged.

## 6. Endpoints

### 6.1 `GET /v1/health`
Auth: none. Returns Health (§5.4). Polled by the Inbox every 30 s. FR-18.

### 6.2 `GET /v1/inbox/{id}`
Auth: none. Returns Inbox (§5.1).
The sender pages use the **bundled config** for the key and address (rules §1.8). They may call this endpoint only to compare. If `desk_public_key`, `fingerprint`, `address` or `network` differ from the config, the page stops and shows a key-mismatch error. It never switches to the API value.

### 6.3 `POST /v1/inbox`
Auth: `X-Setup-Secret`. Screen: Create inbox step 2.

Request
```json
{
  "id": "desk",
  "name": "Sealed",
  "desk_public_key": "base64…",
  "fingerprint": "3F9AC21E8B0277AD",
  "address": "utest1…",
  "ufvk": "uviewtest1…",
  "tip_floor_zat": 100000,
  "birthday_height": 4200000
}
```
Response `201` with Inbox (§5.1).
Server checks, in this order (C-19). The first failure returns its code:

| # | Check | Failure |
|---|---|---|
| 1 | `X-Setup-Secret` present and correct | `403 forbidden` |
| 2 | Body is JSON with every required field of the right type and no unknown field | `400 invalid_request` |
| 3 | `id` equals the deployment's `SEALED_INBOX_ID` | `400 invalid_request`, field `id` |
| 4 | No inbox exists yet | `409 inbox_exists` |
| 5 | `ufvk` is not a spending key, seed phrase or any key with spend authority, for either network | `422 spend_key_rejected` |
| 6 | `ufvk` and `address` are for the deployment's network | `422 network_mismatch` |
| 7 | `ufvk` decodes as a unified full viewing key | `400 invalid_request`, field `ufvk` |
| 8 | `address` decodes as a unified address | `400 invalid_request`, field `address` |
| 9 | `address` has a shielded receiver | `422 address_not_shielded` |
| 10 | `address` is derived from the `ufvk` | `422 address_mismatch` |
| 11 | `desk_public_key` is 32 bytes of standard base64 | `400 invalid_request`, field `desk_public_key` |
| 12 | `fingerprint` matches `desk_public_key` (§4.3) | `422 fingerprint_mismatch` |
| 13 | `tip_floor_zat` is from 10,000 to 100,000,000 | `422 floor_out_of_range` |
| 14 | `birthday_height`, when sent, is not above the current chain tip | `400 invalid_request`, field `birthday_height` |
| 15 | Without `birthday_height`, a chain server answers so the default can be set | `503 watcher_unavailable` |

`birthday_height` is optional. Default is the current tip minus 100 blocks. FR-11, NFR-3.

### 6.4 `POST /v1/inbox/{id}/tokens`
Auth: `X-Setup-Secret` **or** the current `Authorization: Bearer` (settles C-5). Screens: Create inbox step 2 (right after create) and Settings "Rotate desk token".
Request body: none. Response `201`:
```json
{ "token": "sld_…", "created_at": "2026-10-11T09:00:05Z" }
```
Issuing a token revokes every earlier token for the inbox. The token is returned only in this response. The frontend stores it at once (§7).

**Demo inbox (C-24).** When `{id}` is the inbox named by `SEALED_DEMO_INBOX_ID`, the desk token alone is not enough: the request also needs a correct `X-Setup-Secret`, otherwise `403 demo_locked`. The check runs before any change, and a refused request writes no audit entry.

### 6.5 `GET /v1/inbox/{id}/tips`
Auth: Bearer. Screen: Inbox.

| Query | Default | Meaning |
|---|---|---|
| `after_seq` | `0` | Return tips with `seq` greater than this (new or changed) |
| `filter` | `visible` | `visible` (not below floor), `below_floor`, or `all` |
| `limit` | `50` | 1 to 200 |

Response `200`:
```json
{
  "tips": [ /* Tip objects, ordered by seq ascending */ ],
  "next_seq": 1042,
  "has_more": false,
  "counts": { "visible": 5, "below_floor": 2 }
}
```
When no tip matches, `tips` is empty and `next_seq` equals the `after_seq` sent (C-22).

Polling (settles C-2): the first load calls with `after_seq=0` and pages while `has_more` is true. Then every 30 s it calls with `after_seq=<last next_seq>` and merges by `id`, replacing older copies. The server bumps `seq` whenever a tip is inserted or any of `confirmations`, `chain_state`, `below_floor` changes. A floor change through PATCH bumps every affected tip. FR-12 to FR-16, NFR-6.

### 6.6 `GET /v1/inbox/{id}/tips/{tip_id}`
Auth: Bearer. Returns one Tip. Used when the desk opens a link to a single tip.

### 6.7 `PATCH /v1/inbox/{id}`
Auth: Bearer. Screen: Settings.
Request `{ "tip_floor_zat": 150000 }`, only this field in v1. Range 10,000 to 100,000,000 (the minimum is the ZIP 317 fee for a two-action transaction, SRD BR-8). The same range applies to `tip_floor_zat` in `POST /v1/inbox`.
Response `200` with Inbox. Tips are re-sorted, never deleted. FR-16.

**Demo inbox (C-24).** On the inbox named by `SEALED_DEMO_INBOX_ID`, PATCH needs the desk token **and** a correct `X-Setup-Secret`, otherwise `403 demo_locked`, before any change and with no audit entry. `GET` routes, tips, audit and health are unchanged, and DELETE already needs the setup secret (§6.8).

### 6.8 `DELETE /v1/inbox/{id}`
Auth: Bearer **and** `X-Setup-Secret`. Screen: Settings (typed DELETE plus setup secret, settles C-6).
Response `204`, empty body. Removes the inbox, viewing key, token hashes and every tip row. Later calls return `404`. FR-17, T-9.
After `204` the frontend wipes the stored token, keeps the desk key (the backup still opens old memos in Decrypt) and shows Create inbox step 1.

### 6.9 Never

- No endpoint accepts a memo, a tip text or anything from a sender. Memos only travel on chain.
- No endpoint returns the viewing key after create.
- No endpoint takes or returns the desk private key or passphrase.

### 6.10 `GET /v1/inbox/{id}/audit` (added Oct 12)
Auth: Bearer. Screen: Audit trail.

| Query | Default | Meaning |
|---|---|---|
| `after_seq` | `0` | Entries with `seq` greater than this |
| `limit` | `200` | 1 to 500 |

Response `200`:
```json
{ "entries": [ /* Audit entries, seq ascending */ ], "next_seq": 10, "has_more": false, "total": 10 }
```
- When no entry matches, `entries` is empty and `next_seq` equals the `after_seq` sent (C-22).
- The page loads every entry (paging while `has_more`), verifies the chain from `seq` 1, then shows newest first, 50 at a time.
- **Export** is done in the browser: it saves `{ "inbox_id", "exported_at", "verified", "broken_at", "entries" }` as `sealed-audit-<inbox>-<YYYY-MM-DD>.json` (UTC date). `entries` are the raw entries as received, so anyone can re-check the chain. `broken_at` is the first broken `seq` or `null`. No export endpoint.
- The file holds tx ids, amounts and arrival times. They are not secret, but they tie each tip to a transaction on the chain. The export button says so: "The file links each tip to its transaction. Keep it on the desk’s own machine."
- The Settings delete card links to this page ("Export the audit log first"). It does not export by itself.
- The page shows the latest `hash` with a copy button so the desk can keep it outside Sealed. A rewritten log will not contain an older saved hash.

## 7. What the frontend keeps where

| Data | Where | Cleared when |
|---|---|---|
| Desk private key | IndexedDB, wrapped with the passphrase (Argon2id + `crypto_secretbox`) | Never by the app. The desk can export and delete |
| Desk token | Same IndexedDB record as the key, wrapped with the same passphrase (settles C-11) | Rotate, delete, or 401 |
| Unwrapped key and token | Memory only | Lock inbox, 15 minutes idle, tab closed |
| Decrypted tip text | Memory only | Same as above |
| Setup secret | Memory only, during Create inbox and the delete form | Leaving that screen |
| Sender tip text and sealed memo | Memory only | Leaving the flow or closing the tab |
| Audit entries and verification result | Memory only. Exported JSON goes to the desk's own disk | Leaving the Audit trail page |

## 8. Configuration that must match on both sides

| Value | Frontend (`sealed.config.json`) | Backend (Railway env) | Must match |
|---|---|---|---|
| Network | `network` | `SEALED_NETWORK` | Yes |
| Inbox id | `inbox_id` | `SEALED_INBOX_ID` | Yes |
| API base | `api_base_url` | | Frontend only |
| Frontend origin | | `ALLOWED_ORIGINS` (comma list) | Must include the Vercel URL |
| Desk public key, fingerprint, address | `desk_public_key`, `fingerprint`, `address` | Stored by `POST /inbox` | Compared by §6.2 |
| Tip floor | `tip_floor_zat` (shown to senders) | Stored, changed by PATCH | Redeploy the frontend after a PATCH so senders see the new floor |
| Confirmations | | `SEALED_CONFIRMATIONS=3` | Frontend reads `chain_state` only |
| Poll interval | Inbox polls every 30 s | `SEALED_POLL_SECONDS=30` | Both 30 |
| Chain servers | | `SEALED_LIGHTWALLETD_URLS` (comma list. At least 2 on main, FR-12. 1 allowed on test, C-21) | Backend only |
| Setup secret | Typed by the desk | `SEALED_SETUP_SECRET_HASH` | Backend stores only the hash |
| Database | | `SEALED_DB_PATH` on the Railway volume | Backend only |
| Database key | | `SEALED_DB_KEY`: 32 random bytes, standard base64. Encrypts the viewing key at rest (C-20) | Backend only, never in the repo |
| Listen port | | `PORT`, set by Railway (C-20) | Backend only |
| Demo inbox | `demo_desk` (judge box, testnet only) | `SEALED_DEMO_INBOX_ID`: unset everywhere except the testnet judging deploy. The backend refuses to start if it is set on main (C-24) | Set together on the judging deploy |

Both repos ship a `.env.example` listing these names with fake values. Real `.env` files are git-ignored.

## 9. Requirement coverage

| SRD | Endpoint or rule | Screen |
|---|---|---|
| FR-1 to FR-5 | None (browser only) | Write, Pay |
| FR-6 | §4.3, §6.2 compare | Landing, Write, Create inbox 3 |
| FR-7 | §7 | Create inbox 1, Locked |
| FR-8 | None (browser only) | Decrypt |
| FR-9 | `network` in §4.1, §5.4 | Header badge on every page |
| FR-10 | None (browser only) | Safety check |
| FR-11 | §4.2, §6.3 | Create inbox 2 |
| FR-12, FR-13 | §5.2, §6.5 | Inbox |
| FR-14 | `chain_state`, `seq` | Inbox |
| FR-15 | Bearer auth, §6.5 | Inbox |
| FR-16 | `below_floor`, `counts`, §6.7 | Inbox tabs, Settings |
| FR-17 | §6.8 | Settings |
| FR-18 | §5.4, §6.1 | Inbox health line |
| FR-19 | `format_ok`, `display_status` | Inbox row, Decrypt |
| NFR-1, NFR-2, NFR-4 | §3, §6.9, §7 | All |
| NFR-3 | §4.2, §6.3 | Create inbox 2 |
| FR-20 (Oct 13): desk audit trail with a verifiable hash chain | §5.6, §6.10 | Audit trail, Settings (link to export before delete) |

## 10. How this contract stays true

1. **Shared fixtures** in `contracts/fixtures/` at the repo root: one JSON file per object and per error (`inbox.json`, `tip.json`, `tips_page.json`, `health.json`, `error_spend_key.json`, `fingerprint.json`, `audit_chain.json`).
2. **Frontend** parses every fixture with the same validator it uses on live responses (`src/lib/api.ts`). A fixture that fails to parse fails the build.
3. **Backend** serializes its Rust structs and compares them to the fixtures in a test. A difference fails the build.
4. **A change to this file** comes in one pull request that also updates the fixtures, both sides' code and a row in `docs/frontend/decisions.md`.
5. **The Architecture §4 table** is a summary. It points here for details.
