# Sealed backend decisions

A running log of backend decisions. Same format as `docs/frontend/decisions.md`. Never delete a row: mark it Replaced and point to the new one.

Status values: **Accepted** (in force), **Proposed** (recommended, waiting for @Apa), **Open** (not decided), **Replaced**.

## Decided

| ID | Date | Decision | Options considered | Why | Status |
|---|---|---|---|---|---|
| B-01 | Oct 11 | **One Rust service** runs the watcher and the Inbox API | Node calling zcash-walletd. Separate services | Rust with librustzcash is the supported scanning path. One process keeps the demo simple (Architecture §2) | Accepted |
| B-02 | Oct 11 | **SQLite on a Railway volume** | Postgres | One file, one writer, matches the librustzcash wallet database (Architecture §2) | Accepted |
| B-03 | Oct 11 | **`docs/api-contract.md` wins** over every other doc and over code | Contract inside the Architecture doc | One source both sides test against (frontend D-21) | Accepted |
| B-04 | Oct 13 | **Zcash resources limited to the Zecathon list** (developer docs, ZIPs, librustzcash, Zebra, ZODL) plus the faucet and lightwalletd servers from the PRD. NEAR Intents out of scope | Any community tool | Enough for a working shielded flow, and judges know these sources | Replaced by B-20 |
| B-05 | Oct 13 | **Scanner covers Ironwood, Orchard and Sapling outputs** | Orchard and Sapling only | Ironwood (NU6.3) is live and Orchard no longer takes new outputs, so tips land in Ironwood | Accepted |
| B-06 | Oct 13 | **Never hold a spending key.** Spend-capable keys rejected before storage | Accept and ignore spend authority | NFR-3 and FR-11. A breach must not be able to move funds | Accepted |
| B-07 | Oct 13 | **Viewing key encrypted at rest** with `SEALED_DB_KEY` | Plain in SQLite | A leaked volume alone should not reveal the desk's incoming payments | Accepted |
| B-08 | Oct 13 | **Own minimal scanner** on `zcash_client_backend` scanning and trial decryption, viewing key decrypted into memory only, app tables only, reorgs found by comparing block hashes. No `zcash_client_sqlite` wallet database | `zcash_client_sqlite` with SQLCipher. `zcash_client_sqlite` with the key in plain text | The wallet database stores the UFVK in plain text plus trees, nullifiers and note values, which breaks B-07 and rules §1.2. SRD BR-2 and BR-10 to be reworded. Holds only if spike 2 shows the scan API reads Ironwood without the wallet database | Accepted |
| B-09 | Oct 13 | **A tip appears only once mined.** No mempool watching. `height`, `block_time_at` and `confirmations` are never null in v1, `pending` means fewer than 3 confirmations | Watch the mempool through lightwalletd and allow null audit fields | Compact blocks do not carry the mempool, and §5.6 forbids null `details` in `tip_received`. Costs about one 25 s block of delay. Needs a contract note and a `tips_page.json` change (proposed separately) | Accepted |
| B-10 | Oct 13 | **A missing memo is unreadable.** `memo_b64: null` means the ZIP 302 "no memo" value (first byte 0xF6), with `format_ok: false` and `display_status: unreadable` | Skip the format check for a missing memo and keep `format_ok: true` | Keeps §4.4 literal: no `z1:` prefix, no format. The frontend still opens it as an empty tip because it checks `memo_b64` first. `tips_page.json` tip 2 changes in the contract pull request | Accepted |
| B-11 | Oct 13 | **SQLite file on the laptop during development, Railway volume at deploy** (confirms B-02) | Supabase first. Postgres everywhere | Supabase adds a third account (breaks NFR-8) and a data holder outside the threat model, and its Postgres code would be thrown away | Accepted |
| B-12 | Oct 13 | **axum** for HTTP (was P-B1) | actix-web. warp | tokio-native, tower middleware for CORS, limits and headers | Accepted |
| B-13 | Oct 13 | **tonic client generated from the lightwalletd protos that `zcash_client_backend` ships** (was P-B2, adjusted by B-08) | The wallet-database sync helpers | B-08 drops the wallet database, so only the protos and the gRPC types are reused | Accepted |
| B-14 | Oct 13 | **rusqlite** for the app tables (was P-B3) | sqlx | Synchronous and simple, one writer | Accepted |
| B-15 | Oct 13 | **`serde_json_canonicalizer` if it passes `audit_chain.json` byte for byte, else hand-written for our types** (was P-B4) | Always hand-written | Frontend D-59 already named 0.3.2. Version re-checked on crates.io before pinning | Accepted |
| B-16 | Oct 13 | **Hand-written in-memory token bucket** for rate limits (was P-B5) | tower_governor | Our limits are small, and the client IP is read from exactly one trusted Railway header that we control, so rule §1.8 is easy to audit | Accepted |
| B-17 | Oct 13 | **Multi-stage Dockerfile** (was P-B6) | Railway Nixpacks | Reproducible, non-root user, pinned toolchain | Accepted |
| B-18 | Oct 13 | **One lightwalletd source allowed on testnet only**, health shows "1 of 1 servers". Two required on mainnet (was P-B7, option A) | Own Zebra and lightwalletd. Ask the community for a second endpoint | Days of node setup saved. Needs a contract §8 note, proposed with the other contract changes | Accepted |
| B-19 | Oct 13 | **Contract clarified, C-15 to C-22** in one pull request with the fixtures, the frontend tests and frontend D-68: C-15 (B-09), C-16 (B-10), C-17 `confirmations` stops at 10, C-18 health always 200 and 503 only on Create inbox, C-19 Create inbox check order with spend key first, C-20 `SEALED_DB_KEY` and `PORT`, C-21 (B-18), C-22 empty-page `next_seq` and optional `field`. SRD BR-2, BR-5 and BR-10 reworded for B-08 and B-18 | Patch around the gaps in the backend | Rules §10.4: never patch around the contract. Ironwood receivers (review item M4) wait for spike 2 | Accepted |
| B-20 | Oct 13 | **Zcash resources: the Zecathon list without ZODL** (developer docs, ZIPs, librustzcash, Zebra) plus the faucet and lightwalletd servers from the PRD. **zcash-devtool on the laptop** is the test sender wallet and creates the desk's receive-only account and UFVK. NEAR Intents out of scope. Replaces B-04 | Keep the ZODL phone app as the test sender | One machine, no phone. zcash-devtool is built on librustzcash by the Zcash team and is already the PRD's spike 3 fallback. Its authors say not to use it in production, so it is for testing only and never shipped | Accepted |

## Proposed (waiting for a yes)

| ID | Decision | Options | Recommendation and trade-off |
|---|---|---|---|
| P-B1 | **HTTP framework** | axum. actix-web. warp | axum: tokio-native, tower middleware for CORS, limits and headers. actix is faster in benchmarks but this API is tiny. **Accepted Oct 13 as B-12** |
| P-B2 | **lightwalletd client** | tonic generated from the lightwalletd protos. The client inside zcash_client_backend | Use what zcash_client_backend exposes first, fall back to tonic. Less code to own. **Accepted Oct 13 as B-13** |
| P-B3 | **App tables access** | rusqlite. sqlx | rusqlite: synchronous, simple, same engine as zcash_client_sqlite. sqlx adds compile-time checks but needs an offline setup. **Accepted Oct 13 as B-14** |
| P-B4 | **Canonical JSON (RFC 8785)** | A JCS crate. Hand-written for our small fixed shapes | A crate if one passes the shared fixture byte for byte against the frontend. Otherwise hand-write for our exact types. **Accepted Oct 13 as B-15** |
| P-B5 | **Rate limiting** | tower_governor. Hand-written token bucket | tower_governor: fits axum, in-memory only. **Accepted Oct 13 as B-16** |
| P-B6 | **Build** | Multi-stage Dockerfile. Railway Nixpacks | Dockerfile: reproducible, non-root user, pinned toolchain. **Accepted Oct 13 as B-17** |
| P-B7 | **Testnet with one lightwalletd source** | A) Allow one on testnet only, show "1 of 1 servers" in health. B) Run our own Zebra + lightwalletd. C) Ask the community for a second endpoint | **A** for testnet, two sources required on mainnet. B costs days of node setup on Railway. **Accepted Oct 13 as B-18** |

## Open

| ID | Question | Needed by |
|---|---|---|
| O-B1 | Spike 2: does a view-only account on the pinned crates read a testnet memo from an Ironwood output? | Before any API work |
| O-B2 | Spike 3: which wallet exports the receive-only viewing key, and its exact prefix | Before Create inbox is tested end to end |
| O-B3 | Spike 4: Rust build, volume and outbound gRPC work on Railway | Before deploy |
| O-B4 | Do the pinned crates and testnet.zec.rocks already follow NU7 rules on testnet? | Spike 2 |
| O-B5 | Exact submission deadline and whether judges need a live mainnet demo | Before Oct 20 |
