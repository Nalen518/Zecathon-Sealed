# Sealed backend rules

Status: active from Oct 13, 2026. Owner: @Apa.
These rules apply to every line of backend code, every pull request and every AI coding session. When a rule and a request conflict, the rule wins until this file is changed. Change a rule by editing this file and adding a row to `docs/backend/decisions.md`.

The backend is one Rust service on Railway: the **watcher** (scans the chain with a view-only key and stores sealed tips) and the **Inbox API** (serves them to the desk page).

Sources of truth, in this order: `docs/api-contract.md`, the SRD, the PRD, the Architecture doc, then this file. The SRD IDs (FR-n, NFR-n, T-n) are quoted so each rule can be traced.

## 1. Privacy and security (a broken rule here is a failed submission)

1. **No spending key, ever.** The service only holds a unified full viewing key for a receive-only account. Any key with spend authority is rejected with `422 spend_key_rejected` before it is stored (FR-11, NFR-3).
2. **Store only what the contract lists.** Inbox, tip, token hash, sync state and audit entries as defined in `docs/api-contract.md` §5. Never tip plaintext, the desk private key, a passphrase, a sender IP or a user agent (NFR-2).
3. **The viewing key is encrypted at rest** in SQLite with a key from the `SEALED_DB_KEY` environment variable. A leaked volume alone must not reveal which payments the desk received.
4. **Secrets are hashed.** Desk tokens are 32 random bytes, stored as a BLAKE2b-256 hash. The setup secret is stored only as an Argon2id hash in `SEALED_SETUP_SECRET_HASH`. Every comparison is constant time.
5. **No endpoint accepts a memo or anything from a sender.** Memos only travel on chain (contract §6.9).
6. **Every response** sends `Cache-Control: no-store`, `Pragma: no-cache`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and never `Set-Cookie` (NFR-4).
7. **CORS** allows only the exact origins in `ALLOWED_ORIGINS`. Never `*`, never credentials.
8. **Rate limits** count by token on desk routes and by IP on public routes, in memory only. IPs are never written to logs, the database or error messages.
9. **Outbound traffic** goes only to the configured lightwalletd servers over TLS. No telemetry, no analytics, no crash reporting service.
10. **Request limits:** JSON bodies up to 16 KB, a 10 s handler timeout, unknown fields rejected.

## 2. The API contract is law

1. Implement every route in `docs/api-contract.md` §6 exactly: method, path, auth, status codes, error codes, field names and types. Nothing more, nothing less.
2. A route, field or error code that is not in the contract does not get built. Propose a contract change instead. A change lands in one pull request with the contract, the fixtures, the frontend client and a decisions row on both sides.
3. Serde structs use `snake_case` and serialize byte for byte to `contracts/fixtures/*.json`. A test fails the build on any difference.
4. Amounts are integer zatoshis, times are RFC 3339 UTC, binary is standard base64, network values are `"test"` and `"main"` (contract §4.1).
5. Errors use the contract shape `{ "error": { "code", "message", "field" } }`. No stack traces, no internal paths, no SQL in a response.
6. Fingerprint, `display_status` precedence, memo `format_ok` and the audit hash chain are computed exactly as contract §4.3, §5.3, §4.4 and §5.6 say, and pass the shared fixtures.

## 3. Zcash: resources, versions and network upgrades

1. **Use only the Zecathon resource list** plus what the PRD already names:
   - Zcash developer docs (start here)
   - ZIPs: 321 (payment requests), 302 (memo layout), 317 (fees), 316 (unified addresses and viewing keys)
   - librustzcash (the Rust core for scanning, keys, addresses and `zip321`)
   - Zebra (the node behind public lightwalletd servers. Not run by us)
   - zcash-devtool (CLI on librustzcash, laptop only: the test sender wallet and the tool that creates the desk's receive-only account and UFVK. Never in production, never shipped. ZODL is no longer used, decision B-20)
   - NEAR Intents is out of scope (transparent ZEC only, no memos, PRD §3)
   - From the PRD: a testnet faucet for TAZ and public lightwalletd servers (zec.rocks)
2. **Pin exact versions** of every librustzcash crate, verified against the live testnet before use. Do not trust version numbers from memory or old docs.
3. **Network upgrades are live and moving.** Ironwood (NU6.3) adds a new shielded pool and stops Orchard from accepting new outputs, so the scanner must trial-decrypt **Ironwood outputs as well as Orchard and Sapling**. Ironwood outputs go to Orchard receivers and are found with the Orchard viewing key, so there is no separate Ironwood receiver. NU7 is active on testnet since height 4,465,026 (branch ID `77190ad9`, confirmed by `GetLightdInfo` on Oct 13). Only the pre-release crate line (`zcash_protocol` 0.11.0-pre.0 and up) knows this height, so testnet needs it. Mainnet has no NU7 height yet (decision B-23). Take activation heights and branch IDs from the crates (`zcash_protocol`), never hardcode them.
4. **One network per deployment**, set by `SEALED_NETWORK`. The service refuses to start if a configured address, viewing key or server belongs to the other network.
5. **Mainnet is opt-in.** Everything runs on testnet until @Apa says to switch.

## 4. Watcher correctness

1. Poll every `SEALED_POLL_SECONDS` (30). Fetch compact blocks from the last scanned height, trial-decrypt with the view-only key, fetch the full transaction for each match to read the 512-byte memo.
2. **At least two lightwalletd sources** (FR-12). A new chain tip is trusted only when a second source returns the same block hash. On testnet both zec.rocks servers are used, and the honest limits say they share one operator (decision B-22). If only one source is available on testnet, follow decision B-18 and show it in `/v1/health`.
3. **Confirmations:** `confirmed` at 3 blocks (FR-14). On a reorg, rescan from the fork height and mark removed tips `orphaned`. Never delete them.
4. **Idempotent:** a tip is unique by `txid` + `output_index` (FR-13). Restarts resume from `sync_state` with no duplicate and no lost tip (NFR-7).
5. **`seq` bumps** on every insert and every change to `confirmations`, `chain_state` or `below_floor`. A tip floor change bumps every tip it affects (contract §6.5).
6. **The server never decrypts a memo.** It only checks `format_ok` (contract §4.4) and stores the raw 512 bytes.
7. **A new inbox starts** at its `birthday_height` (default: tip minus 100). A lost volume is rebuilt by rescanning from that height. The chain is the source of truth.
8. **Back off** on server errors (exponential, capped at the poll interval) and record `source_down` / `source_up` audit entries only on state changes, not on every retry.

## 5. Storage

1. SQLite on the Railway volume at `SEALED_DB_PATH`, WAL mode, one writer.
2. Versioned migrations, each in one transaction, run at startup. Never edit a released migration.
3. **Audit entries** are written in the same transaction as the change they record, hash-chained per contract §5.6, and never updated or deleted, except when the whole inbox is deleted (contract C-12).
4. `DELETE /v1/inbox/{id}` removes the inbox, viewing key, token hashes, tips and audit entries in one transaction (FR-17, T-9).

## 6. Logging

1. `tracing` with a **field allowlist**: route, status, latency, height, source host, counts. Nothing else.
2. Never log: IP, user agent, headers, request or response bodies, tokens, the setup secret, keys, memo bytes, tip ids next to amounts.
3. A test greps the source and fails the build if a log call contains `ip`, `user_agent`, `token`, `secret`, `memo` or `ufvk`.
4. Railway's own request logs are outside our control. This is disclosed in the honest limits, not hidden.

## 7. Code

1. Rust stable, pinned in `rust-toolchain.toml`. `cargo fmt` and `cargo clippy -- -D warnings` must pass.
2. No `unsafe`. No `unwrap` or `expect` outside tests and startup config. Errors are typed (`thiserror`) and mapped to contract error codes in one place.
3. `Cargo.lock` committed, exact versions in `Cargo.toml` (NFR-9). `cargo deny` blocks AGPL and GPL dependencies and known advisories.
4. Layout: `apps/watcher` with crates `core` (types, fingerprint, JCS, audit hash, status rules), `store` (SQLite, migrations), `chain` (lightwalletd, scanning), `api` (HTTP). `core` has no I/O.
5. Configuration only from environment variables listed in contract §8. `.env.example` has every name with a fake value. Real `.env` files are git-ignored.

## 8. Tests (each maps to the SRD)

| Test | What it proves | SRD |
|---|---|---|
| Unit: fingerprint, JCS, audit hash, display_status, format_ok | Match the shared fixtures byte for byte | Contract §10 |
| Unit: reorg simulation | Tips go orphaned, rescan from the fork, seq bumps | FR-14 |
| Integration: API against a temp database | Every route, status code and error code in the contract | FR-11 to FR-20 |
| Integration: restart and one source down | No duplicate, no lost tip, health shows the lag | T-7, NFR-7 |
| Testnet: real payment | Memo reaches the watcher byte for byte | T-4 |
| Testnet: desk inbox | Pending to confirmed, decrypted in the frontend, row holds ciphertext only | T-5 |
| Testnet: floor, unreadable, key safety | Below floor hidden, plain memo marked unreadable, spend key rejected, delete removes all | T-6, T-8, T-9 |
| Testnet: audit chain | Tampered entry shows Chain broken in the frontend | T-11 |
| Build: log grep | No sensitive field in any log call | NFR-1, NFR-2 |

## 9. Deploy

1. Multi-stage Docker build, runs as a non-root user, health check on `/v1/health`.
2. Secrets (`SEALED_SETUP_SECRET_HASH`, `SEALED_DB_KEY`) live only in Railway variables, never in the repo.
3. **Ask @Apa before:** creating the Railway project or volume, setting production secrets, spending TAZ, pushing to main, switching to mainnet.

## 10. Git and review

1. One change per pull request. The description lists the FR, NFR and T IDs it covers.
2. Before merge: fmt, clippy, unit and integration tests, contract fixture tests, log grep.
3. Every new choice gets a row in `docs/backend/decisions.md`. Every piece of feedback gets a row in `docs/backend/feedback.md`.
4. If a spike shows the contract cannot work as written, stop and show both sides with a recommendation. Never patch around the contract.

## Definition of done for a backend feature

- [ ] Matches `docs/api-contract.md` exactly and passes the fixtures.
- [ ] Stores and logs nothing outside sections 1 and 6.
- [ ] Has unit or integration tests, plus a testnet check where the SRD names one.
- [ ] Works after a restart and with one lightwalletd source down.
- [ ] The SRD requirements it covers are listed in the pull request.
