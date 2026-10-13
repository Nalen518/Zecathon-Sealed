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
| B-21 | Oct 13 | **Testnet is on NU6.3, not NU7.** Rules §3.3 corrected: NU7 expected at testnet height 4,465,026 (about early November). C-17 (`confirmations` stops at 10) is kept | Keep the "NU7 active with 25 s blocks" premise | Both live testnet servers report branch ID `37a5165b` (NU6.3) at about height 4,395,365 (see Spike findings). C-17 still saves polling at any block time | Replaced by B-23 (the monitor data was stale) |
| B-22 | Oct 13 | **Both zec.rocks testnet servers are the FR-12 sources**: `testnet.zec.rocks:443` and `zaino.testnet.unsafe.zec.rocks:443`. The honest limits say they share one operator | Only `testnet.zec.rocks` (B-18) | Two independent backends (lightwalletd on Zakura, Zaino on Zebra) catch a stale or broken server, though not a dishonest operator. B-18 stays as the fallback if one goes away | Accepted |
| B-23 | Oct 13 | **NU7 is active on testnet** (branch ID `77190ad9`, height 4,497,128 on `testnet.zec.rocks` at 07:36 UTC). Rules §3.3 restored to say so. The stable crate line (`zcash_protocol` 0.10.6) maps this height to NU6.3 and cannot parse or build NU7 transactions, so testnet needs the pre-release line. Replaces B-21 | Trust the hosh monitor (B-21) | Measured directly with `GetLightdInfo` from the spike. The monitor reported height 4,395,364 and NU6.3, about 100,000 blocks old | Accepted |
| B-24 | Oct 13 | **Pre-release crate line on testnet (option A):** `zcash_client_backend` =0.25.0-pre.1, `zcash_keys` =0.17.0-pre.1, `zcash_primitives` =0.31.0-pre.1, `zcash_protocol` =0.11.0-pre.0, with `tonic` =0.14.6 (`tls-ring`, `ring` was already in the tree) and `tokio` =1.53.2. A local copy of zcash-devtool (branch `sealed-nu7`, never pushed, outside the repo) is moved to the same line to send test tips. Fallback: mainnet tests with the stable line (option B) if A is not working by Oct 16 | B) mainnet with stable crates. C) a phone wallet that supports NU7 | Only the pre-release line knows the testnet NU7 height. Spike confirmed: with it the crate maps the tip to `Nu7`, matching the server. API change seen so far: `scan_block` takes `SpendIdentifiers` instead of `Nullifiers` and has an error type parameter. Pre-release APIs may still change, so versions stay pinned exactly | Accepted |
| B-25 | Oct 13 | **`core` dependencies:** `blake2` =0.10.6, `serde_json_canonicalizer` =0.3.2, `serde` =1.0.229, `serde_json` =1.0.151, `base64` =0.22.1, `thiserror` =2.0.21. B-15 settled: the canonicalizer passes `audit_chain.json` (hashes and canonical vectors) byte for byte, so JCS is not hand-written. Our own check enforces the §5.6 subset before it runs. `unwrap` and `expect` allowed in tests only (`clippy.toml`, rules §7.2) | `blake2` 0.11.0. Hand-written JCS. `serde_json` 1.0.154 | 0.10.6 is the version frontend D-59 named and reuses `digest` 0.10.7 already in the tree. `serde_json` 1.0.151 skips three releases from the last three days | Accepted |
| B-26 | Oct 13 | **`store` crate and migration 0001** (not released yet): tables `inbox` (viewing key sealed with XChaCha20-Poly1305, `SEALED_DB_KEY`, inbox id as associated data), `tip` (512 memo bytes or NULL for no memo, unique by inbox + txid + output index and by inbox + seq), `desk_token` (BLAKE2b-256 hashes only), `sync_state` (origin only), `chain_block` (recent block hashes for reorg detection), `audit_log` (triggers block UPDATE, and DELETE while the inbox exists). `below_floor` is computed at read time. Tip ids are derived from inbox + txid + output index, so a rescan after a lost volume keeps them. Crates: `rusqlite` =0.40.2 (`bundled`, `fallible_uint`), `chacha20poly1305` =0.11.0, `getrandom` =0.4.3, `zeroize` =1.9.1 | Store `below_floor` as a column. Random tip ids. A separate scan table | Rules §5. A computed `below_floor` cannot go stale. `fallible_uint` makes a too-large `u64` an error instead of a silent wrap | Accepted |

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

## Spike findings

### Oct 13: crates, network upgrades and testnet servers (O-B4, research only, no code)

> **Superseded in part by the direct measurement below.** The hosh monitor data was stale: NU7 is active on testnet, the stable crate line does not fit testnet, and the Zaino server was not answering when measured.

Sources: crates.io API, the librustzcash `main` changelogs, `hosh.zec.rocks/api/v0/zec.json` (zec.rocks endpoint monitor), zcash-devtool `main`.

| Finding | Evidence | Effect |
|---|---|---|
| **NU7 is not active on testnet yet.** Testnet is on NU6.3 | Both live testnet servers report branch ID `37a5165b`, which `zcash_protocol` maps to `BranchId::Nu6_3`. Height about 4,395,365. `zcash_protocol` 0.11.0-pre.0 sets the testnet NU7 height to 4,465,026, about 69,700 blocks ahead. At the recent testnet pace (about 33 s a block since NU6.3 at 4,134,000) that is roughly early November, after Oct 28 | The "NU7 active with 25 s blocks" premise does not hold today. Rule §3.3 to be corrected after @Apa confirms |
| **Ironwood has no receiver or key of its own.** Orchard receivers and Orchard viewing keys receive into the Ironwood pool after NU6.3 | `zcash_address` typecodes are only P2PKH, P2SH, Sapling, Orchard. `zcash_client_backend` 0.24.0 adds `ScanningKeys::ironwood` and `WalletIronwoodOutput` behind the `orchard` feature, and `ProposalError::OrchardReceiverRequiresIronwood` | Review item M4 mostly closes: contract §4.2 needs no new receiver. A UA with an Orchard receiver is enough. Spike 2 confirms on chain |
| **Compact blocks carry Ironwood actions** | lightwallet-protocol v0.5.0 (Jun 30): `CompactTx.ironwoodActions`, `ChainMetadata.ironwoodCommitmentTreeSize`, `PoolType.IRONWOOD`. `LightdInfo` has `upgradeName`, `upgradeHeight`, `lightwalletProtocolVersion` | The scanner can stay on compact blocks (B-08). Health can read the upgrade from `GetLightdInfo` |
| **Stable crate line: `zcash_client_backend` 0.24.0, `zcash_keys` 0.16.1, `zcash_primitives` 0.30.1, `zcash_protocol` 0.10.6, `zcash_address` 0.13.0, `zip321` 0.9.0** (NU6.3, Ironwood, no NU7) | crates.io. 0.25.0-pre / 0.11.0-pre / 0.31.0-pre add NU7 on testnet and ZIP 316 Revision 2 encodings | Candidate pin: the stable line, valid on testnet until NU7 activates. To be proven in spike 2 before it is accepted |
| **ZIP 316 Revision 2 adds new prefixes** (pre-release crates only): test `zutest` / `tutest` addresses, `uvftest` viewing keys. Main `zu` / `tu` / `uvf` | `zcash_address` constants on `main` | Not needed on the stable line. If we ever move to the pre-release line, the frontend prefix checks (`utest1`, `uviewtest1`) must accept them too |
| **Two testnet servers online**: `testnet.zec.rocks:443` (lightwalletd v0.5.4, Zakura 1.5.0) and `zaino.testnet.unsafe.zec.rocks:443` (Zaino 0.6.0, Zebra 6.3.0). Every other listed testnet server is offline, including `lightwalletd.testnet.electriccoin.co` | hosh monitor, cross-checked by a TLS request to `testnet.zec.rocks` | FR-12 can have two sources on testnet, but both are run by one operator (zec.rocks), so the second-source check does not guard against that operator. The "unsafe" name is unexplained. B-18 stays as the fallback |
| **zcash-devtool `main` uses the same stable line** (`zcash_client_backend` 0.24.0, `zcash_protocol` 0.10.x), Apache-2.0, last commit Aug 28 (`5a26ee854e`) | Its `Cargo.toml` | It should work as the test wallet on testnet until NU7 activates. Build on Windows not yet tried |

### Oct 13: measured directly with the spike (`apps/watcher/spikes/scan-memo info`)

| Server | Result |
|---|---|
| `testnet.zec.rocks:443` | ECC LightWalletD v0.5.4, chain `test`, height 4,497,128, branch `77190ad9` (NU7), lightwallet protocol v0.5.0, `upgrade_name` empty. TLS with webpki roots works |
| `zaino.testnet.unsafe.zec.rocks:443` | `503 Service Unavailable` from its Fly.io edge at 07:36 UTC |

Effect: the stable line (`zcash_client_backend` 0.24.0, `zcash_protocol` 0.10.6) labels the tip as NU6.3, so it cannot read or build NU7 transactions. The candidate pin moves to the pre-release line (`zcash_client_backend` 0.25.0-pre.1, `zcash_protocol` 0.11.0-pre.0), to be proven in spike 2. zcash-devtool `main` uses the stable line, so it may not be able to send on testnet either. B-23.

### Oct 13: spike on the pre-release line (B-24)

| Check | Result |
|---|---|
| Spike builds on `zcash_client_backend` 0.25.0-pre.1 and `zcash_protocol` 0.11.0-pre.0 | Yes, after two API fixes (`SpendIdentifiers`, `scan_block` error type) |
| Crate's branch at the testnet tip (4,497,147) | `Nu7`, matching the server's `77190ad9`. The stable line said `Nu6_3` |
| Last 500 testnet blocks | 79 transactions with shielded data: 173 Ironwood actions, 0 Orchard, 0 Sapling. Compact blocks carry Ironwood actions when `pool_types` asks for them |
| zcash-devtool on the stable line | Builds on Windows in 14 min 38 s, exit 0. Cannot send on NU7 testnet, so it is being moved to the pre-release line |


### Oct 13: zcash-devtool on the pre-release line, and spike 3 (first part)

| Check | Result |
|---|---|
| zcash-devtool ported to the B-24 crate line (local branch `sealed-nu7`, `D:\ZECathon-tools`, never pushed) | Builds clean. The `inspect`, `pczt`, `zip48`, `migration`, multisig, `shield`, `init-fvk`, `derive-path` and `derive-address` commands were cut out of this local copy. Fixes: `rand` 0.10 `UnwrapErr(SysRng)` in place of `OsRng`, `zip32` 0.3, `zcash_script` 0.6, `bip32` 0.6.0, `create_proposed_transactions` now takes a clock and an RNG, `Ufvk::decode` returns the ZIP 316 revision, `encode` returns a `Result`, `UnifiedAddress::from_receivers` takes 5 arguments |
| Testnet wallets created from `testnet.zec.rocks` at birthday 4,497,089 | `sender` (test sender) and `desk` (stands in for the desk's dedicated receive-only account). Seeds age-encrypted outside the repo |
| Viewing key export prefix (O-B2) | `uviewtest1…` (ZIP 316 Revision 0), so the frontend check in `viewingKey.ts` already matches. Incoming viewing key `uivktest1…`. A spending key is never exported by this flow |
| Default unified address prefix | `utest1…` (Revision 0), matching `ADDRESS_PREFIX.test` in the frontend config |
